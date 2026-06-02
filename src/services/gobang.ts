import {
  CACHE_TTL,
  GOBANG_API_BASE_URL,
  GOBANG_WEB_BASE_URL,
} from "../constants.js";
import type {
  GobangCountResponse,
  GobangDetailResponse,
  GobangHouseDetail,
  GobangListResponse,
  GobangPlacesResponse,
  GobangSidosResponse,
} from "../types.js";
import { CachedHttpClient, createHttpClient } from "./http.js";

/** Extracts the listing object from a gobang.kr/place/<no> page's SSR data. */
function parseHouseFromPage(html: string): GobangHouseDetail | undefined {
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) return undefined;
  try {
    const data = JSON.parse(match[1]) as {
      props?: { pageProps?: { house?: GobangHouseDetail } };
    };
    return data.props?.pageProps?.house ?? undefined;
  } catch {
    return undefined;
  }
}

/** Listing categories accepted by the gobang search/count endpoints. */
export const GOBANG_HOUSE_TYPES = [
  "GOSIWON", // 고시원
  "ONE_ROOM_TEL", // 원룸텔
  "ONE_TWO_ROOM", // 원룸/투룸
  "SHARE_HOUSE", // 쉐어하우스
  "CO_LIVING", // 코리빙
  "OFFICETEL", // 오피스텔
] as const;

export type GobangHouseType = (typeof GOBANG_HOUSE_TYPES)[number];
export type GobangGender = "ALL" | "MALE" | "FEMALE";
export type NearbyBand = "0-500" | "500-1000";

/** Filters shared by the search and count endpoints. */
export interface GobangFilter {
  /** Region: top-level 시/도 code (from listSidos). */
  sidoCode?: string;
  /** Region: 읍/면/동 (dongli) code. */
  dongliCode?: string;
  /** Map bounding box (all four required together). */
  swLat?: number;
  neLat?: number;
  swLng?: number;
  neLng?: number;
  houseTypes?: GobangHouseType[];
  gender?: GobangGender;
  /** Monthly rent bounds in 만원. */
  minPrice?: number;
  maxPrice?: number;
  /** Deposit bounds in 만원. */
  minDeposit?: number;
  maxDeposit?: number;
  minAge?: number;
  maxAge?: number;
  keyword?: string;
}

export interface GobangSearchParams extends GobangFilter {
  pageNo: number;
  pageSize: number;
}

export interface GobangNearbyParams extends GobangFilter {
  latitude: number;
  longitude: number;
  band: NearbyBand;
  pageNo: number;
  pageSize: number;
}

/** Drops undefined/null/empty values and comma-joins houseTypes. */
function toQuery(filter: GobangFilter): Record<string, unknown> {
  const q: Record<string, unknown> = {};
  const assign = (k: string, v: unknown): void => {
    if (v !== undefined && v !== null && v !== "") q[k] = v;
  };
  assign("sidoCode", filter.sidoCode);
  assign("dongliCode", filter.dongliCode);
  assign("swLat", filter.swLat);
  assign("neLat", filter.neLat);
  assign("swLng", filter.swLng);
  assign("neLng", filter.neLng);
  assign("gender", filter.gender);
  assign("minPrice", filter.minPrice);
  assign("maxPrice", filter.maxPrice);
  assign("minDeposit", filter.minDeposit);
  assign("maxDeposit", filter.maxDeposit);
  assign("minAge", filter.minAge);
  assign("maxAge", filter.maxAge);
  assign("keyword", filter.keyword);
  if (filter.houseTypes && filter.houseTypes.length > 0) {
    q.houseTypes = filter.houseTypes.join(",");
  }
  return q;
}

/**
 * Client for the public (unauthenticated) parts of the gobang.kr API at
 * api.gobang.kr — the same endpoints the website calls from the browser.
 *
 * No API key is required; the server only checks the Origin/Referer headers,
 * which are set here. Identical GETs are served from a short-lived TTL cache.
 */
export class GobangClient {
  private readonly http: CachedHttpClient;
  private readonly web: CachedHttpClient;

  constructor() {
    this.http = new CachedHttpClient(
      createHttpClient({
        baseURL: GOBANG_API_BASE_URL,
        headers: {
          Origin: "https://gobang.kr",
          Referer: "https://gobang.kr/",
        },
      }),
    );
    // The api.gobang.kr detail endpoint returns only summary fields; the full
    // listing detail is server-rendered into the gobang.kr/place/<no> page, so
    // we read it from there instead.
    this.web = new CachedHttpClient(
      createHttpClient({
        baseURL: GOBANG_WEB_BASE_URL,
        headers: { "User-Agent": "Mozilla/5.0" },
      }),
    );
  }

  /** Searches listings. Requires a region (sido/dongli) or a bounding box. */
  async searchHouses(params: GobangSearchParams): Promise<GobangListResponse> {
    return this.http.get<GobangListResponse>(
      "/v2/houses",
      { ...toQuery(params), pageNo: params.pageNo, pageSize: params.pageSize },
      { ttlMs: CACHE_TTL.LISTING },
    );
  }

  /** Counts listings matching a filter, without fetching them. */
  async countHouses(filter: GobangFilter): Promise<GobangCountResponse> {
    return this.http.get<GobangCountResponse>("/v2/house-count", toQuery(filter), {
      ttlMs: CACHE_TTL.LISTING,
    });
  }

  /**
   * Full detail for a single listing, read from the server-rendered
   * gobang.kr/place/<no> page (richer than the api.gobang.kr endpoint).
   */
  async getHouse(no: number): Promise<GobangDetailResponse> {
    const html = await this.web.get<string>(`/place/${no}`, undefined, {
      ttlMs: CACHE_TTL.LISTING,
    });
    return { result: parseHouseFromPage(html) };
  }

  /** Listings near a coordinate, within the 0-500m or 500-1000m band. */
  async nearbyHouses(params: GobangNearbyParams): Promise<GobangListResponse> {
    return this.http.get<GobangListResponse>(
      `/v2/nearby/${params.band}/houses`,
      {
        ...toQuery(params),
        latitude: params.latitude,
        longitude: params.longitude,
        pageNo: params.pageNo,
        pageSize: params.pageSize,
      },
      { ttlMs: CACHE_TTL.LISTING },
    );
  }

  /** Resolves a place / subway / region name to coordinates and metadata. */
  async searchPlaces(keyword: string): Promise<GobangPlacesResponse> {
    return this.http.get<GobangPlacesResponse>(
      "/v2/search/places",
      { keyword },
      { ttlMs: CACHE_TTL.SEARCH },
    );
  }

  /** Lists all top-level regions (시/도) with their listing counts. */
  async listSidos(): Promise<GobangSidosResponse> {
    return this.http.get<GobangSidosResponse>("/v2/house-sidos", undefined, {
      ttlMs: CACHE_TTL.REGION,
    });
  }
}

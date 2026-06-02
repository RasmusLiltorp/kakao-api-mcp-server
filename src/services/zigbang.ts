import { CACHE_TTL } from "../constants.js";
import { CachedHttpClient, createHttpClient } from "./http.js";

/** Base URL for the public (anonymous) Zigbang (직방) API. */
export const ZIGBANG_API_BASE_URL = "https://apis.zigbang.com";

/** Property domains accepted by the area-listing endpoint. */
export const ZIGBANG_DOMAINS = ["oneroom", "officetel", "villa"] as const;
export type ZigbangDomain = (typeof ZIGBANG_DOMAINS)[number];

/** Korean labels for the property domains. */
export const ZIGBANG_DOMAIN_LABEL: Record<ZigbangDomain, string> = {
  oneroom: "원룸",
  officetel: "오피스텔",
  villa: "빌라",
};

/** Sales (deal) types accepted by the area-listing filter. */
export const ZIGBANG_SALES_TYPES = ["전세", "월세", "매매"] as const;
export type ZigbangSalesType = (typeof ZIGBANG_SALES_TYPES)[number];

// --- Geohash encoder (vendored; no npm dependency) -------------------------

const GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Encodes a latitude/longitude into a geohash string of the given precision
 * using standard base-32 geohashing. Precision 5 ≈ a ~5km cell.
 */
export function encodeGeohash(
  lat: number,
  lng: number,
  precision = 5,
): string {
  let latMin = -90;
  let latMax = 90;
  let lngMin = -180;
  let lngMax = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let even = true; // even bits index longitude, odd bits latitude

  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngMin = mid;
      } else {
        ch = ch << 1;
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latMin = mid;
      } else {
        ch = ch << 1;
        latMax = mid;
      }
    }
    even = !even;
    if (bit < 4) {
      bit += 1;
    } else {
      hash += GEOHASH_BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

// --- Response types --------------------------------------------------------

export interface ZigbangSearchItem {
  id: number;
  type: string; // subway | region | apartment | address
  name: string;
  hint?: string;
  description?: string;
  lat: number;
  lng: number;
  zoom?: number;
}

export interface ZigbangSearchResponse {
  success?: boolean;
  code?: string;
  items?: ZigbangSearchItem[];
}

export interface ZigbangAreaItem {
  lat: number;
  lng: number;
  itemId: number;
  itemBmType?: string;
}

export interface ZigbangAreaResponse {
  items?: ZigbangAreaItem[];
}

export interface ZigbangItemDetail {
  itemId: number;
  salesType?: string;
  serviceType?: string;
  roomType?: string;
  title?: string;
  description?: string;
  status?: string;
  price?: { deposit?: number; rent?: number };
  area?: { 전용면적M2?: number; 계약면적M2?: number };
  floor?: { allFloors?: string; floor?: string };
  location?: { lat?: number; lng?: number };
  randomLocation?: { lat?: number; lng?: number };
  addressOrigin?: {
    local1?: string;
    local2?: string;
    local3?: string;
    local4?: string;
    fullText?: string;
    localText?: string;
  };
  jibunAddress?: string;
  manageCost?: { amount?: number; includes?: string[] };
  options?: string[];
  moveinDate?: string;
  roomDirection?: string;
  elevator?: boolean;
  parkingAvailableText?: string;
  bathroomCount?: number;
}

export interface ZigbangSubway {
  id: number;
  name: string;
  description?: string;
}

export interface ZigbangDetailResponse {
  item?: ZigbangItemDetail;
  agent?: {
    agentTitle?: string;
    agentName?: string;
    agentPhone?: string;
    agentAddress?: string;
  };
  subways?: ZigbangSubway[];
}

/** Filters for the area-listing endpoint (units 만원 / 10,000 KRW). */
export interface ZigbangAreaFilter {
  depositMin?: number;
  depositMax?: number;
  rentMin?: number;
  rentMax?: number;
  salesTypes?: ZigbangSalesType[];
}

/**
 * Client for the public (anonymous) Zigbang (직방) API at apis.zigbang.com —
 * the same endpoints the website calls from the browser. No API key or auth
 * header is required. Identical GETs are served from a short-lived TTL cache.
 */
export class ZigbangClient {
  private readonly http: CachedHttpClient;

  constructor() {
    this.http = new CachedHttpClient(
      createHttpClient({ baseURL: ZIGBANG_API_BASE_URL }),
    );
  }

  /** Resolves a place / subway / region / apartment name to coordinates. */
  async searchPlaces(q: string): Promise<ZigbangSearchResponse> {
    return this.http.get<ZigbangSearchResponse>(
      "/v2/search",
      { q },
      { ttlMs: CACHE_TTL.SEARCH },
    );
  }

  /**
   * Lists item IDs (+ coordinates) within a geohash cell for one domain.
   * `geohash` is required by the API; filters are in 만원.
   */
  async listArea(
    domain: ZigbangDomain,
    geohash: string,
    filter: ZigbangAreaFilter = {},
  ): Promise<ZigbangAreaResponse> {
    const params: Record<string, unknown> = {
      geohash,
      domain: "zigbang",
      checkAnyItemWithoutFilter: true,
    };
    const assign = (k: string, v: unknown): void => {
      if (v !== undefined && v !== null) params[k] = v;
    };
    assign("depositMin", filter.depositMin);
    assign("depositMax", filter.depositMax);
    assign("rentMin", filter.rentMin);
    assign("rentMax", filter.rentMax);
    // Array params are encoded as salesTypes[0], salesTypes[1], ... (verified).
    if (filter.salesTypes && filter.salesTypes.length > 0) {
      filter.salesTypes.forEach((t, i) => {
        params[`salesTypes[${i}]`] = t;
      });
    }
    return this.http.get<ZigbangAreaResponse>(`/v2/items/${domain}`, params, {
      ttlMs: CACHE_TTL.LISTING,
    });
  }

  /** Full detail for a single listing by its itemId. */
  async getItem(itemId: number): Promise<ZigbangDetailResponse> {
    return this.http.get<ZigbangDetailResponse>(
      `/v3/items/${itemId}`,
      undefined,
      { ttlMs: CACHE_TTL.LISTING },
    );
  }
}

import { CACHE_TTL } from "../constants.js";
import { CachedHttpClient, createHttpClient } from "./http.js";

/** Base URL for the Dabang (다방) web API. */
const DABANG_BASE_URL = "https://www.dabangapp.com";

/**
 * Headers required for an anonymous 200 response from the Dabang API
 * (empirically confirmed — without them the API returns HTTP 400). The
 * User-Agent must look like a browser; the two D-* headers identify the
 * web client and its API version.
 */
const DABANG_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "D-Api-Version": "5.0.0",
  "D-Call-Type": "web",
} as const;

/** Selling (deal) types: monthly rent or lease (jeonse). */
export const DABANG_SELLING_TYPES = ["MONTHLY_RENT", "LEASE"] as const;
export type DabangSellingType = (typeof DABANG_SELLING_TYPES)[number];

/** Room categories. */
export const DABANG_ROOM_TYPES = [
  "ONE_ROOM",
  "TWO_ROOM",
  "THREE_ROOM",
  "OFFICETEL",
  "APT",
] as const;
export type DabangRoomType = (typeof DABANG_ROOM_TYPES)[number];

/** Floor categories. */
export const DABANG_ROOM_FLOORS = [
  "GROUND_FIRST",
  "GROUND_SECOND_OVER",
  "SEMI_BASEMENT",
  "ROOFTOP",
] as const;
export type DabangRoomFloor = (typeof DABANG_ROOM_FLOORS)[number];

/** Listing source: agent-listed or owner-direct. */
export const DABANG_DEAL_TYPES = ["AGENT", "DIRECT"] as const;
export type DabangDealType = (typeof DABANG_DEAL_TYPES)[number];

/** A min/max range, in 만원 (10,000 KRW) for money or pyeong for size. */
interface DabangRange {
  min: number;
  max: number;
}

/**
 * The full `filters` object the room-list endpoint requires. Every key is
 * mandatory — the API returns HTTP 400 listing any that are missing.
 */
export interface DabangFilters {
  sellingTypeList: DabangSellingType[];
  depositRange: DabangRange;
  priceRange: DabangRange;
  isIncludeMaintenance: boolean;
  pyeongRange: DabangRange;
  useApprovalDateRange: DabangRange;
  roomFloorList: DabangRoomFloor[];
  roomTypeList: DabangRoomType[];
  dealTypeList: DabangDealType[];
  canParking: boolean;
  isShortLease: boolean;
  hasElevator: boolean;
  hasPano: boolean;
  isDivision: boolean;
  isDuplex: boolean;
}

const RANGE_MAX = 999999;
const fullRange = (): DabangRange => ({ min: 0, max: RANGE_MAX });

/** Overridable subset of the filters, used by the search tool. */
export interface DabangFilterOptions {
  sellingTypeList?: DabangSellingType[];
  roomTypeList?: DabangRoomType[];
  roomFloorList?: DabangRoomFloor[];
  depositRange?: Partial<DabangRange>;
  priceRange?: Partial<DabangRange>;
  pyeongRange?: Partial<DabangRange>;
  useApprovalDateRange?: Partial<DabangRange>;
}

/**
 * Builds the mandatory `filters` object, defaulting every key to a permissive
 * value and applying any caller overrides for the common ones.
 */
export function buildFilters(options: DabangFilterOptions = {}): DabangFilters {
  const range = (o?: Partial<DabangRange>): DabangRange => ({
    min: o?.min ?? 0,
    max: o?.max ?? RANGE_MAX,
  });
  return {
    sellingTypeList: options.sellingTypeList ?? ["MONTHLY_RENT", "LEASE"],
    depositRange: range(options.depositRange),
    priceRange: range(options.priceRange),
    isIncludeMaintenance: false,
    pyeongRange: range(options.pyeongRange),
    useApprovalDateRange: range(options.useApprovalDateRange),
    roomFloorList: options.roomFloorList ?? [
      "GROUND_FIRST",
      "GROUND_SECOND_OVER",
      "SEMI_BASEMENT",
      "ROOFTOP",
    ],
    roomTypeList: options.roomTypeList ?? ["ONE_ROOM", "TWO_ROOM"],
    dealTypeList: ["AGENT"],
    canParking: false,
    isShortLease: false,
    hasElevator: false,
    hasPano: false,
    isDivision: false,
    isDuplex: false,
  };
}

/** A region match from the location search endpoint. */
export interface DabangRegion {
  gid: number;
  code: string;
  name: string;
  fullName: string;
  shortName?: string;
  /** [longitude, latitude]. */
  location: [number, number];
  parentCityName?: string;
  parentStateName?: string;
}

/** Envelope returned by the region search endpoint. */
export interface DabangRegionResponse {
  code: number;
  msg: string;
  result?: { list?: DabangRegion[] };
}

/** A single room summary from the room-list endpoint. */
export interface DabangRoom {
  id: string;
  seq: number;
  roomTypeName?: string;
  priceTypeName?: string;
  priceTitle?: string;
  roomTitle?: string;
  roomDesc?: string;
  complexName?: string | null;
  randomLocation?: { lat: number; lng: number };
  dongName?: string;
  imgUrlList?: string[];
  isPano?: boolean;
  isDirect?: boolean;
}

/** Result payload of the room-list endpoint. */
export interface DabangRoomListResult {
  total?: number;
  hasMore?: boolean;
  page?: number;
  roomList?: DabangRoom[];
  premiumList?: DabangRoom[];
  region?: unknown;
}

/** Envelope returned by the room-list endpoint. */
export interface DabangRoomListResponse {
  code: number;
  msg: string;
  result?: DabangRoomListResult;
}

/** A map bounding box. */
export interface DabangBbox {
  sw: { lat: number; lng: number };
  ne: { lat: number; lng: number };
}

/** Area selector for a room search — exactly one shape is used. */
export type DabangArea =
  | { type: "region"; code: string }
  | { type: "bbox"; bbox: DabangBbox }
  | { type: "subway"; id: string }
  | { type: "univ"; id: string };

export interface DabangSearchParams {
  area: DabangArea;
  filters: DabangFilters;
  page: number;
  zoom: number;
}

/**
 * Client for the public (unauthenticated) parts of the Dabang (다방) web API
 * at www.dabangapp.com — the same endpoints the website calls from the
 * browser.
 *
 * No login is required for region and room *search*, but three headers are
 * mandatory (set here) or the API returns HTTP 400. NOTE: Dabang's
 * listing-detail endpoint is login-gated (403 anonymously), so this client is
 * search-only — there is no detail method. Identical GETs are served from a
 * short-lived TTL cache.
 */
export class DabangClient {
  private readonly http: CachedHttpClient;

  constructor() {
    this.http = new CachedHttpClient(
      createHttpClient({
        baseURL: DABANG_BASE_URL,
        headers: { ...DABANG_HEADERS },
      }),
    );
  }

  /** Resolves a Korean place name to region matches (code + coords). */
  async searchRegion(keyword: string): Promise<DabangRegionResponse> {
    return this.http.get<DabangRegionResponse>(
      "/api/v5/loc/search/region",
      { searchKeyword: keyword },
      { ttlMs: CACHE_TTL.SEARCH },
    );
  }

  /** Searches one/two-room listings within a region, bbox, subway, or univ. */
  async searchRooms(
    params: DabangSearchParams,
  ): Promise<DabangRoomListResponse> {
    const { area, filters, page, zoom } = params;
    const query: Record<string, unknown> = {
      useMap: "naver",
      zoom,
      page,
      filters: JSON.stringify(filters),
    };
    switch (area.type) {
      case "region":
        query.code = area.code;
        break;
      case "bbox":
        query.bbox = JSON.stringify(area.bbox);
        break;
      case "subway":
      case "univ":
        query.id = area.id;
        break;
    }
    return this.http.get<DabangRoomListResponse>(
      `/api/v5/room-list/category/one-two/${area.type}`,
      query,
      { ttlMs: CACHE_TTL.LISTING },
    );
  }
}

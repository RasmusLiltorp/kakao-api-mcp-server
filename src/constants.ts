/** Shared constants for the korea-travel-mcp server. */

export const SERVER_NAME = "korea-travel-mcp";
export const SERVER_VERSION = "2.0.0";

export const KAKAO_LOCAL_BASE_URL = "https://dapi.kakao.com";
export const KAKAO_MOBILITY_BASE_URL = "https://apis-navi.kakaomobility.com";
export const ODSAY_BASE_URL = "https://api.odsay.com";
export const GOBANG_API_BASE_URL = "https://api.gobang.kr";
export const GOBANG_WEB_BASE_URL = "https://gobang.kr";

/** Timeout applied to every outbound API request. */
export const REQUEST_TIMEOUT_MS = 15000;

/** Maximum tool response size in characters before truncation kicks in. */
export const CHARACTER_LIMIT = 25000;

/**
 * Response-cache TTLs in milliseconds, tuned to how fast each kind of data
 * changes. Identical requests within the window are served from cache and
 * make no API call.
 */
export const CACHE_TTL = {
  /** Address and region lookups: effectively static. */
  GEO: 60 * 60 * 1000,
  /** Keyword, category and Daum search: fairly stable. */
  SEARCH: 10 * 60 * 1000,
  /** Car directions: traffic-sensitive, kept short. */
  ROUTE: 2 * 60 * 1000,
  /** Public-transit routing: kept short. */
  TRANSIT: 3 * 60 * 1000,
  /** Gobang listing search and counts: listings change slowly. */
  LISTING: 5 * 60 * 1000,
  /** Gobang region lists: effectively static. */
  REGION: 60 * 60 * 1000,
} as const;

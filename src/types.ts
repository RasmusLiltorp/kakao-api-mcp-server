/** API response type definitions shared across the server. */

// --- Kakao Local / Daum Search API ---

export interface KakaoPlace {
  place_name: string;
  address_name: string;
  road_address_name?: string;
  category_name: string;
  place_url: string;
  phone?: string;
  x?: string;
  y?: string;
}

export interface KakaoSearchMeta {
  total_count: number;
  pageable_count: number;
  is_end: boolean;
}

export interface KakaoKeywordSearchResponse {
  documents: KakaoPlace[];
  meta: KakaoSearchMeta;
}

export interface KakaoRoadAddress {
  address_name: string;
  building_name?: string;
}

export interface KakaoAddress {
  address_name: string;
}

export interface KakaoCoord2AddressDocument {
  road_address: KakaoRoadAddress | null;
  address: KakaoAddress | null;
}

export interface KakaoCoord2AddressResponse {
  meta: { total_count: number };
  documents: KakaoCoord2AddressDocument[];
}

export interface DaumSearchResponse {
  meta: KakaoSearchMeta;
  documents: Record<string, unknown>[];
}

export interface KakaoAddressDocument {
  address_name: string;
  address_type?: string;
  x: string;
  y: string;
  road_address: KakaoRoadAddress | null;
  address: KakaoAddress | null;
}

export interface KakaoAddressSearchResponse {
  meta: KakaoSearchMeta;
  documents: KakaoAddressDocument[];
}

export interface KakaoRegionDocument {
  region_type: string;
  address_name: string;
  region_1depth_name: string;
  region_2depth_name: string;
  region_3depth_name: string;
  code: string;
  x: number;
  y: number;
}

export interface KakaoCoord2RegionResponse {
  meta: { total_count: number };
  documents: KakaoRegionDocument[];
}

// --- Kakao Mobility API ---

export interface MobilityFare {
  taxi?: number;
  toll?: number;
}

export interface MobilitySummary {
  distance?: number;
  duration?: number;
  fare?: MobilityFare;
}

export interface MobilityRoad {
  name?: string;
  distance?: number;
  traffic_state?: number;
}

export interface MobilitySection {
  roads?: MobilityRoad[];
}

export interface MobilityRoute {
  result_code: number;
  result_msg?: string;
  summary?: MobilitySummary;
  sections?: MobilitySection[];
}

export interface MobilityDirectionsResponse {
  routes?: MobilityRoute[];
}

// --- ODsay public-transit API ---

export interface OdsayLane {
  name?: string;
  busNo?: string;
}

export interface OdsaySubPath {
  trafficType: number; // 1 = subway, 2 = bus, 3 = walk, 4 = intercity train
  distance?: number;
  sectionTime?: number;
  stationCount?: number;
  startName?: string;
  endName?: string;
  lane?: OdsayLane[];
}

export interface OdsayPathInfo {
  totalTime?: number;
  payment?: number;
  /** Used by intercity paths in place of `payment`. */
  totalPayment?: number;
  totalWalk?: number;
  busTransitCount?: number;
  subwayTransitCount?: number;
}

export interface OdsayPath {
  pathType: number;
  info: OdsayPathInfo;
  subPath: OdsaySubPath[];
}

export interface OdsayError {
  code?: string;
  message?: string;
  msg?: string;
}

// --- Gobang (gobang.kr 1인가구 housing) API types ---

/** A label tag on a listing, e.g. "여성전용", "엘리베이터" (already human-readable). */
export interface GobangTag {
  name: string;
  fixed?: boolean;
  type?: string | null;
}

/** A nearby subway station on a listing. */
export interface GobangNearSubway {
  name: string;
  /** Distance in kilometres. */
  distance?: number;
  line?: string;
}

/** A listing as it appears in search/list results. */
export interface GobangHouseSummary {
  no: number;
  name: string;
  houseTypes?: string[];
  latitude?: number;
  longitude?: number;
  dongliCode?: string;
  eupmyeondongFullName?: string;
  eupmyeondongName?: string;
  /** Monthly rent range, in 만원 (10,000 KRW). */
  minPrice?: number;
  maxPrice?: number;
  /** Deposit range, in 만원 (10,000 KRW). */
  minDeposit?: number;
  maxDeposit?: number;
  hasTourVideo?: boolean;
  reviewCount?: number;
  membershipGrade?: string;
  tags?: GobangTag[];
  nearSubways?: GobangNearSubway[];
  [key: string]: unknown;
}

/** Full detail for a single listing (superset of the summary fields). */
export interface GobangHouseDetail extends GobangHouseSummary {
  addrFullBunji?: string;
  addrDetail?: string;
  sidoName?: string;
  sigunguName?: string;
  telNo?: string;
  virtualTelNo?: string;
  gender?: string;
  minAge?: number;
  maxAge?: number;
  totalFloor?: number;
  houseInfo?: string;
  notice?: string;
  nearSchools?: Array<{ name?: string; distance?: number }>;
}

/** A place/subway/region suggestion from the place-search endpoint. */
export interface GobangPlace {
  placeName?: string;
  category?: string;
  line?: string;
  keyword?: string;
  x?: number;
  y?: number;
  [key: string]: unknown;
}

/** A top-level region (시/도) with its listing count. */
export interface GobangSido {
  sidoCode: string;
  sidoName: string;
  sidoFullName?: string;
  houseCount?: number;
}

export interface GobangListResponse {
  result?: GobangHouseSummary[];
}

export interface GobangDetailResponse {
  result?: GobangHouseDetail;
}

export interface GobangCountResponse {
  result?: number;
}

export interface GobangPlacesResponse {
  result?: { items?: GobangPlace[] };
}

export interface GobangSidosResponse {
  result?: GobangSido[];
}

export interface OdsayResponse {
  result?: { path: OdsayPath[] };
  error?: OdsayError[] | OdsayError;
}

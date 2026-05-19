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

export interface OdsayResponse {
  result?: { path: OdsayPath[] };
  error?: OdsayError[] | OdsayError;
}

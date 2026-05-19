import {
  CACHE_TTL,
  KAKAO_LOCAL_BASE_URL,
  KAKAO_MOBILITY_BASE_URL,
} from "../constants.js";
import type {
  DaumSearchResponse,
  KakaoAddressSearchResponse,
  KakaoCoord2AddressResponse,
  KakaoCoord2RegionResponse,
  KakaoKeywordSearchResponse,
  MobilityDirectionsResponse,
} from "../types.js";
import { CachedHttpClient, createHttpClient } from "./http.js";

export type DaumSearchCategory = "web" | "image" | "blog" | "cafe";

export interface KeywordSearchParams {
  query: string;
  x?: number;
  y?: number;
  radius?: number;
  page?: number;
  size?: number;
}

export interface CategorySearchParams {
  categoryGroupCode: string;
  x: number;
  y: number;
  radius: number;
  page?: number;
}

export interface DaumSearchParams {
  query: string;
  sort?: string;
  page?: number;
  size?: number;
}

export interface DirectionsParams {
  /** "longitude,latitude" of the origin. */
  origin: string;
  /** "longitude,latitude" of the destination. */
  destination: string;
  /** Pipe-separated "longitude,latitude" waypoints, or undefined. */
  waypoints?: string;
  priority: string;
  trafficInfo: boolean;
}

/**
 * Client for the Kakao Local API, the Daum Search API (both on dapi.kakao.com)
 * and the Kakao Mobility directions API. All three authenticate with the same
 * Kakao REST API key.
 *
 * Requests retry automatically on rate-limit errors, and identical GETs are
 * served from a TTL response cache, so repeated calls make no API request.
 */
export class KakaoClient {
  private readonly local: CachedHttpClient;
  private readonly mobility: CachedHttpClient;

  constructor(apiKey: string) {
    const headers = { Authorization: `KakaoAK ${apiKey}` };
    this.local = new CachedHttpClient(
      createHttpClient({ baseURL: KAKAO_LOCAL_BASE_URL, headers }),
    );
    this.mobility = new CachedHttpClient(
      createHttpClient({ baseURL: KAKAO_MOBILITY_BASE_URL, headers }),
    );
  }

  /** Keyword place search on Kakao Map. */
  async searchKeyword(
    params: KeywordSearchParams,
  ): Promise<KakaoKeywordSearchResponse> {
    return this.local.get<KakaoKeywordSearchResponse>(
      "/v2/local/search/keyword.json",
      { ...params },
      { ttlMs: CACHE_TTL.SEARCH },
    );
  }

  /** Category place search around a coordinate (e.g. all cafes nearby). */
  async searchByCategory(
    params: CategorySearchParams,
  ): Promise<KakaoKeywordSearchResponse> {
    return this.local.get<KakaoKeywordSearchResponse>(
      "/v2/local/search/category.json",
      {
        category_group_code: params.categoryGroupCode,
        x: params.x,
        y: params.y,
        radius: params.radius,
        page: params.page,
      },
      { ttlMs: CACHE_TTL.SEARCH },
    );
  }

  /** Address search: resolves an address string to coordinates. */
  async searchAddress(
    query: string,
    page?: number,
  ): Promise<KakaoAddressSearchResponse> {
    return this.local.get<KakaoAddressSearchResponse>(
      "/v2/local/search/address.json",
      { query, page },
      { ttlMs: CACHE_TTL.GEO },
    );
  }

  /** Converts a coordinate to road-name and lot-number addresses. */
  async coordToAddress(
    x: number,
    y: number,
  ): Promise<KakaoCoord2AddressResponse> {
    return this.local.get<KakaoCoord2AddressResponse>(
      "/v2/local/geo/coord2address.json",
      { x, y },
      { ttlMs: CACHE_TTL.GEO },
    );
  }

  /** Converts a coordinate to its administrative and legal region codes. */
  async coordToRegion(
    x: number,
    y: number,
  ): Promise<KakaoCoord2RegionResponse> {
    return this.local.get<KakaoCoord2RegionResponse>(
      "/v2/local/geo/coord2regioncode.json",
      { x, y },
      { ttlMs: CACHE_TTL.GEO },
    );
  }

  /** Daum search across web, image, blog or cafe content. */
  async daumSearch(
    category: DaumSearchCategory,
    params: DaumSearchParams,
  ): Promise<DaumSearchResponse> {
    return this.local.get<DaumSearchResponse>(
      `/v2/search/${category}`,
      { ...params },
      { ttlMs: CACHE_TTL.SEARCH },
    );
  }

  /** Car route lookup via the Kakao Mobility directions API. */
  async directions(
    params: DirectionsParams,
  ): Promise<MobilityDirectionsResponse> {
    return this.mobility.get<MobilityDirectionsResponse>(
      "/v1/directions",
      {
        origin: params.origin,
        destination: params.destination,
        ...(params.waypoints ? { waypoints: params.waypoints } : {}),
        priority: params.priority,
        car_fuel: "GASOLINE",
        alternatives: false,
        road_details: params.trafficInfo,
        summary: true,
      },
      { ttlMs: CACHE_TTL.ROUTE },
    );
  }
}

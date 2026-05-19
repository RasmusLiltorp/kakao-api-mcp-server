import axios, { type AxiosInstance } from "axios";
import {
  KAKAO_LOCAL_BASE_URL,
  KAKAO_MOBILITY_BASE_URL,
  REQUEST_TIMEOUT_MS,
} from "../constants.js";
import type {
  DaumSearchResponse,
  KakaoCoord2AddressResponse,
  KakaoKeywordSearchResponse,
  MobilityDirectionsResponse,
} from "../types.js";

export type DaumSearchCategory = "web" | "image" | "blog" | "cafe";

export interface KeywordSearchParams {
  query: string;
  x?: number;
  y?: number;
  radius?: number;
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
 */
export class KakaoClient {
  private readonly local: AxiosInstance;
  private readonly mobility: AxiosInstance;

  constructor(apiKey: string) {
    const headers = { Authorization: `KakaoAK ${apiKey}` };
    this.local = axios.create({
      baseURL: KAKAO_LOCAL_BASE_URL,
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
    this.mobility = axios.create({
      baseURL: KAKAO_MOBILITY_BASE_URL,
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    });
  }

  /** Keyword place search on Kakao Map. */
  async searchKeyword(
    params: KeywordSearchParams,
  ): Promise<KakaoKeywordSearchResponse> {
    const res = await this.local.get<KakaoKeywordSearchResponse>(
      "/v2/local/search/keyword.json",
      { params },
    );
    return res.data;
  }

  /** Converts a coordinate to road-name and lot-number addresses. */
  async coordToAddress(
    x: number,
    y: number,
  ): Promise<KakaoCoord2AddressResponse> {
    const res = await this.local.get<KakaoCoord2AddressResponse>(
      "/v2/local/geo/coord2address.json",
      { params: { x, y } },
    );
    return res.data;
  }

  /** Daum search across web, image, blog or cafe content. */
  async daumSearch(
    category: DaumSearchCategory,
    params: DaumSearchParams,
  ): Promise<DaumSearchResponse> {
    const res = await this.local.get<DaumSearchResponse>(
      `/v2/search/${category}`,
      { params },
    );
    return res.data;
  }

  /** Car route lookup via the Kakao Mobility directions API. */
  async directions(
    params: DirectionsParams,
  ): Promise<MobilityDirectionsResponse> {
    const res = await this.mobility.get<MobilityDirectionsResponse>(
      "/v1/directions",
      {
        params: {
          origin: params.origin,
          destination: params.destination,
          ...(params.waypoints ? { waypoints: params.waypoints } : {}),
          priority: params.priority,
          car_fuel: "GASOLINE",
          alternatives: false,
          road_details: params.trafficInfo,
          summary: true,
        },
      },
    );
    return res.data;
  }
}

import type { AxiosInstance } from "axios";
import { ODSAY_BASE_URL } from "../constants.js";
import type { OdsayResponse } from "../types.js";
import { createHttpClient } from "./http.js";

/**
 * Client for the ODsay public-transit routing API.
 *
 * ODsay keys registered against a web URI are validated against the request's
 * Referer header. When a referer is configured it is sent with every call;
 * otherwise no Referer header is added. Requests retry on rate-limit errors.
 */
export class OdsayClient {
  private readonly http: AxiosInstance;

  constructor(
    private readonly apiKey: string,
    referer?: string,
  ) {
    this.http = createHttpClient({
      baseURL: ODSAY_BASE_URL,
      headers: referer ? { Referer: referer } : undefined,
    });
  }

  /**
   * Searches public-transit paths between two coordinates.
   *
   * @param sx Origin longitude.
   * @param sy Origin latitude.
   * @param ex Destination longitude.
   * @param ey Destination latitude.
   */
  async searchTransitPath(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
  ): Promise<OdsayResponse> {
    const res = await this.http.get<OdsayResponse>(
      "/v1/api/searchPubTransPathT",
      {
        params: { apiKey: this.apiKey, SX: sx, SY: sy, EX: ex, EY: ey, OPT: 0 },
      },
    );
    return res.data;
  }
}

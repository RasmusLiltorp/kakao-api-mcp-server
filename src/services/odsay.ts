import axios from "axios";
import { ODSAY_BASE_URL, REQUEST_TIMEOUT_MS } from "../constants.js";
import type { OdsayResponse } from "../types.js";

/**
 * Client for the ODsay public-transit routing API.
 *
 * ODsay keys registered against a web URI are validated against the request's
 * Referer header, so the referer is sent with every call.
 */
export class OdsayClient {
  constructor(
    private readonly apiKey: string,
    private readonly referer: string,
  ) {}

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
    const res = await axios.get<OdsayResponse>(
      `${ODSAY_BASE_URL}/v1/api/searchPubTransPathT`,
      {
        params: { apiKey: this.apiKey, SX: sx, SY: sy, EX: ex, EY: ey, OPT: 0 },
        headers: { Referer: this.referer },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
    return res.data;
  }
}

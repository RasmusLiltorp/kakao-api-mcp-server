import type { KakaoClient } from "./services/kakao.js";
import type { OdsayClient } from "./services/odsay.js";

/** Dependencies passed to every tool registration function. */
export interface ToolContext {
  kakao: KakaoClient;
  /** null when no ODsay API key is configured. */
  odsay: OdsayClient | null;
}

import type { GobangClient } from "./services/gobang.js";
import type { KakaoClient } from "./services/kakao.js";
import type { OdsayClient } from "./services/odsay.js";

/** Dependencies passed to every tool registration function. */
export interface ToolContext {
  kakao: KakaoClient;
  /** null when no ODsay API key is configured. */
  odsay: OdsayClient | null;
  /** gobang.kr 1인가구 housing listings (no API key required). */
  gobang: GobangClient;
}

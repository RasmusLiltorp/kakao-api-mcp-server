import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import type { AppConfig } from "./config.js";
import type { ToolContext } from "./context.js";
import { KakaoClient } from "./services/kakao.js";
import { OdsayClient } from "./services/odsay.js";
import { logger } from "./logger.js";
import { registerSearchPlaces } from "./tools/places.js";
import { registerCoordToAddress } from "./tools/address.js";
import { registerFindRoute } from "./tools/route.js";
import { registerFindTransitRoute } from "./tools/transit.js";
import { registerDaumSearchTools } from "./tools/daum.js";

/**
 * Builds the MCP server: constructs the API clients from configuration and
 * registers every tool.
 */
export function createServer(config: AppConfig): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  const ctx: ToolContext = {
    kakao: new KakaoClient(config.kakaoApiKey),
    odsay: config.odsayApiKey
      ? new OdsayClient(config.odsayApiKey, config.odsayReferer)
      : null,
  };

  if (!ctx.odsay) {
    logger.info(
      "ODsay API key not set; odsay_find_transit_route will return an error until configured.",
    );
  }

  registerSearchPlaces(server, ctx);
  registerCoordToAddress(server, ctx);
  registerFindRoute(server, ctx);
  registerFindTransitRoute(server, ctx);
  registerDaumSearchTools(server, ctx);

  return server;
}

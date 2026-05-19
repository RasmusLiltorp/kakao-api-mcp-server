#!/usr/bin/env node
/**
 * korea-travel-mcp
 *
 * MCP server for Korean travel and local search:
 *  - Kakao Map place search and coordinate-to-address conversion
 *  - Kakao Mobility car routing
 *  - ODsay public-transit routing
 *  - Daum web / image / blog / cafe search
 *
 * Fork of jeong-sik/kakao-api-mcp-server.
 */
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";
import { runHttp, runStdio } from "./transport.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);

  if (config.mode === "http") {
    await runHttp(server, config.port);
  } else {
    await runStdio(server);
  }
}

main().catch((error: unknown) => {
  logger.error(
    "Fatal error during startup:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});

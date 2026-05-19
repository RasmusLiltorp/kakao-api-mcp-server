import express from "express";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME } from "./constants.js";
import { logger } from "./logger.js";

/** Connects the server over stdio (for local clients such as Claude Desktop). */
export async function runStdio(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info(`${SERVER_NAME} running via stdio.`);
}

/**
 * Serves the MCP server over stateless streamable HTTP at POST /mcp.
 *
 * A fresh transport is created per request so concurrent requests cannot
 * collide on request IDs.
 */
export async function runHttp(server: McpServer, port: number): Promise<void> {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(port, () => {
    logger.info(`${SERVER_NAME} running on http://localhost:${port}/mcp`);
  });
}

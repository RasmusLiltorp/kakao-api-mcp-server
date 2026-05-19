import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ToolContext } from "../context.js";
import { SearchPlacesSchema } from "../schemas.js";
import { describeApiError } from "../services/errors.js";
import { render } from "../services/format.js";
import { logger } from "../logger.js";

type Input = z.infer<typeof SearchPlacesSchema>;

/** Registers the kakao_search_places tool. */
export function registerSearchPlaces(
  server: McpServer,
  ctx: ToolContext,
): void {
  server.registerTool(
    "kakao_search_places",
    {
      title: "Search places on Kakao Map",
      description:
        "Search for places (businesses, landmarks, stations) on Kakao Map by " +
        "keyword. Optionally bias results toward a center coordinate with a " +
        "radius. Read-only.\n\n" +
        "Returns, per place: name, address, category, phone (when available), " +
        "a Kakao Map detail URL, and coordinates. Use this to resolve a place " +
        "name to a coordinate before calling routing tools.",
      inputSchema: SearchPlacesSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: Input) => {
      try {
        const data = await ctx.kakao.searchKeyword({
          query: input.keyword,
          x: input.x,
          y: input.y,
          radius: input.radius,
        });
        const places = data.documents ?? [];
        if (places.length === 0) {
          return {
            content: [
              { type: "text", text: `No places found for "${input.keyword}".` },
            ],
          };
        }

        const structured = {
          query: input.keyword,
          total_count: data.meta?.total_count ?? places.length,
          count: places.length,
          places: places.map((p) => ({
            name: p.place_name,
            address: p.address_name,
            road_address: p.road_address_name || undefined,
            category: p.category_name,
            phone: p.phone || undefined,
            url: p.place_url,
            x: p.x,
            y: p.y,
          })),
        };

        const markdown = [
          `# Place search: "${input.keyword}"`,
          "",
          `Found ${structured.total_count} places (showing ${places.length}).`,
          "",
          ...places.map((p) => {
            const lines = [
              `## ${p.place_name}`,
              `- Address: ${p.address_name}`,
              `- Category: ${p.category_name}`,
            ];
            if (p.phone) lines.push(`- Phone: ${p.phone}`);
            lines.push(`- Detail: ${p.place_url}`);
            return lines.join("\n");
          }),
        ].join("\n");

        return {
          content: [
            {
              type: "text",
              text: render(input.response_format, markdown, structured),
            },
          ],
        };
      } catch (error) {
        logger.error(
          "kakao_search_places failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [
            { type: "text", text: describeApiError(error, "Place search failed") },
          ],
          isError: true,
        };
      }
    },
  );
}

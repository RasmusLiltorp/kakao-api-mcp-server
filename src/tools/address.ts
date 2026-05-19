import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ToolContext } from "../context.js";
import {
  CoordToAddressSchema,
  CoordToRegionSchema,
  SearchAddressSchema,
} from "../schemas.js";
import { describeApiError } from "../services/errors.js";
import { render } from "../services/format.js";
import { logger } from "../logger.js";

type CoordToAddressInput = z.infer<typeof CoordToAddressSchema>;
type SearchAddressInput = z.infer<typeof SearchAddressSchema>;
type CoordToRegionInput = z.infer<typeof CoordToRegionSchema>;

const GEO_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Registers the geocoding tools: coord-to-address, address search, coord-to-region. */
export function registerGeoTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "kakao_coord_to_address",
    {
      title: "Convert coordinate to address",
      description:
        "Convert a WGS84 longitude/latitude coordinate into a Korean address. " +
        "Read-only. Returns both the road-name address and the lot-number " +
        "(jibun) address when available.",
      inputSchema: CoordToAddressSchema.shape,
      annotations: GEO_ANNOTATIONS,
    },
    async (input: CoordToAddressInput) => {
      try {
        const data = await ctx.kakao.coordToAddress(input.x, input.y);
        const doc = data.documents?.[0];
        if (!doc) {
          return {
            content: [
              {
                type: "text",
                text: `No address found for coordinate (${input.x}, ${input.y}).`,
              },
            ],
          };
        }
        const structured = {
          x: input.x,
          y: input.y,
          road_address: doc.road_address?.address_name ?? null,
          lot_address: doc.address?.address_name ?? null,
          building_name: doc.road_address?.building_name ?? null,
        };
        const markdown = [
          `# Address for (${input.x}, ${input.y})`,
          "",
          `- Road address: ${structured.road_address ?? "not available"}`,
          `- Lot address: ${structured.lot_address ?? "not available"}`,
          ...(structured.building_name
            ? [`- Building: ${structured.building_name}`]
            : []),
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
          "kakao_coord_to_address failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [
            {
              type: "text",
              text: describeApiError(error, "Address conversion failed"),
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "kakao_search_address",
    {
      title: "Search an address for its coordinate",
      description:
        "Look up a Korean address (road-name or lot-number) and return its " +
        "WGS84 coordinate. Read-only. This is the inverse of " +
        "kakao_coord_to_address: use it to geocode an address string before " +
        "calling routing tools.",
      inputSchema: SearchAddressSchema.shape,
      annotations: GEO_ANNOTATIONS,
    },
    async (input: SearchAddressInput) => {
      try {
        const data = await ctx.kakao.searchAddress(input.query, input.page);
        const docs = data.documents ?? [];
        if (docs.length === 0) {
          return {
            content: [
              { type: "text", text: `No address found for "${input.query}".` },
            ],
          };
        }
        const total = data.meta?.total_count ?? docs.length;
        const structured = {
          query: input.query,
          total_count: total,
          count: docs.length,
          addresses: docs.map((d) => ({
            address: d.address_name,
            road_address: d.road_address?.address_name ?? null,
            x: d.x,
            y: d.y,
          })),
        };
        const markdown = [
          `# Address search: "${input.query}"`,
          "",
          `Found ${total} matches (showing ${docs.length}).`,
          "",
          ...docs.map((d, i) =>
            [
              `## ${i + 1}. ${d.address_name}`,
              d.road_address ? `- Road: ${d.road_address.address_name}` : "",
              `- Coordinate: (${d.x}, ${d.y})`,
            ]
              .filter((l) => l !== "")
              .join("\n"),
          ),
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
          "kakao_search_address failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [
            { type: "text", text: describeApiError(error, "Address search failed") },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "kakao_coord_to_region",
    {
      title: "Convert coordinate to administrative region",
      description:
        "Convert a WGS84 coordinate into its Korean administrative region " +
        "(시/도, 시/군/구, 읍/면/동). Read-only. Returns both the " +
        "administrative (행정동) and legal (법정동) region names and codes.",
      inputSchema: CoordToRegionSchema.shape,
      annotations: GEO_ANNOTATIONS,
    },
    async (input: CoordToRegionInput) => {
      try {
        const data = await ctx.kakao.coordToRegion(input.x, input.y);
        const docs = data.documents ?? [];
        if (docs.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No region found for coordinate (${input.x}, ${input.y}).`,
              },
            ],
          };
        }
        const structured = {
          x: input.x,
          y: input.y,
          regions: docs.map((d) => ({
            type: d.region_type === "H" ? "administrative" : "legal",
            name: d.address_name,
            level1: d.region_1depth_name,
            level2: d.region_2depth_name,
            level3: d.region_3depth_name,
            code: d.code,
          })),
        };
        const markdown = [
          `# Region for (${input.x}, ${input.y})`,
          "",
          ...structured.regions.map(
            (r) => `- ${r.type}: ${r.name} (code ${r.code})`,
          ),
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
          "kakao_coord_to_region failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [
            {
              type: "text",
              text: describeApiError(error, "Region conversion failed"),
            },
          ],
          isError: true,
        };
      }
    },
  );
}

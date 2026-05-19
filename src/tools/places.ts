import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ToolContext } from "../context.js";
import type { KakaoPlace } from "../types.js";
import { SearchByCategorySchema, SearchPlacesSchema } from "../schemas.js";
import { describeApiError } from "../services/errors.js";
import { render } from "../services/format.js";
import { logger } from "../logger.js";

type SearchInput = z.infer<typeof SearchPlacesSchema>;
type CategoryInput = z.infer<typeof SearchByCategorySchema>;

const CATEGORY_LABELS: Record<string, string> = {
  MT1: "large supermarket",
  CS2: "convenience store",
  PK6: "parking lot",
  OL7: "gas station",
  SW8: "subway station",
  BK9: "bank",
  CT1: "culture facility",
  AG2: "real-estate agency",
  PO3: "public institution",
  AT4: "tourist attraction",
  AD5: "accommodation",
  FD6: "restaurant",
  CE7: "cafe",
  HP8: "hospital",
  PM9: "pharmacy",
  SC4: "school",
  AC5: "academy",
};

/** Shapes a raw Kakao place document into a flat structured object. */
function toStructuredPlace(p: KakaoPlace): Record<string, unknown> {
  return {
    name: p.place_name,
    address: p.address_name,
    road_address: p.road_address_name || undefined,
    category: p.category_name,
    phone: p.phone || undefined,
    url: p.place_url,
    x: p.x,
    y: p.y,
  };
}

/** Renders a place list as markdown. */
function placesMarkdown(heading: string, places: KakaoPlace[]): string {
  return [
    heading,
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
}

const PLACE_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Registers kakao_search_places and kakao_search_by_category. */
export function registerPlaceTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "kakao_search_places",
    {
      title: "Search places on Kakao Map",
      description:
        "Search for places (businesses, landmarks, stations) on Kakao Map by " +
        "keyword. Optionally bias results toward a center coordinate with a " +
        "radius, and paginate with 'page'. Read-only.\n\n" +
        "Returns, per place: name, address, category, phone, a Kakao Map " +
        "detail URL, and coordinates. Use this to resolve a place name to a " +
        "coordinate before calling routing tools.",
      inputSchema: SearchPlacesSchema.shape,
      annotations: PLACE_ANNOTATIONS,
    },
    async (input: SearchInput) => {
      try {
        const data = await ctx.kakao.searchKeyword({
          query: input.keyword,
          x: input.x,
          y: input.y,
          radius: input.radius,
          page: input.page,
          size: input.size,
        });
        const places = data.documents ?? [];
        if (places.length === 0) {
          return {
            content: [
              { type: "text", text: `No places found for "${input.keyword}".` },
            ],
          };
        }

        const total = data.meta?.total_count ?? places.length;
        const structured = {
          query: input.keyword,
          total_count: total,
          page: input.page,
          count: places.length,
          has_more: data.meta ? !data.meta.is_end : false,
          places: places.map(toStructuredPlace),
        };
        const markdown = placesMarkdown(
          `# Place search: "${input.keyword}"\n\nFound ${total} places (page ${input.page}, showing ${places.length}).`,
          places,
        );
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

  server.registerTool(
    "kakao_search_by_category",
    {
      title: "Search places by category near a point",
      description:
        "Find all places of a given category within a radius of a coordinate " +
        "on Kakao Map (for example every cafe or pharmacy nearby). Read-only.\n\n" +
        "Use kakao_search_places first to turn a place name into a " +
        "coordinate, then pass that coordinate here. Returns the same per-place " +
        "fields as kakao_search_places.",
      inputSchema: SearchByCategorySchema.shape,
      annotations: PLACE_ANNOTATIONS,
    },
    async (input: CategoryInput) => {
      try {
        const data = await ctx.kakao.searchByCategory({
          categoryGroupCode: input.category_group_code,
          x: input.x,
          y: input.y,
          radius: input.radius,
          page: input.page,
        });
        const places = data.documents ?? [];
        const label = CATEGORY_LABELS[input.category_group_code] ?? "place";
        if (places.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No ${label}s found within ${input.radius}m of (${input.x}, ${input.y}).`,
              },
            ],
          };
        }

        const total = data.meta?.total_count ?? places.length;
        const structured = {
          category_group_code: input.category_group_code,
          category: label,
          center: { x: input.x, y: input.y },
          radius_m: input.radius,
          total_count: total,
          page: input.page,
          count: places.length,
          has_more: data.meta ? !data.meta.is_end : false,
          places: places.map(toStructuredPlace),
        };
        const markdown = placesMarkdown(
          `# ${label}s within ${input.radius}m of (${input.x}, ${input.y})\n\nFound ${total} (page ${input.page}, showing ${places.length}).`,
          places,
        );
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
          "kakao_search_by_category failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [
            {
              type: "text",
              text: describeApiError(error, "Category search failed"),
            },
          ],
          isError: true,
        };
      }
    },
  );
}

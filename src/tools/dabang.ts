import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ResponseFormat } from "../schemas.js";
import {
  DABANG_ROOM_FLOORS,
  DABANG_ROOM_TYPES,
  DABANG_SELLING_TYPES,
  DabangClient,
  buildFilters,
  type DabangArea,
  type DabangRegion,
  type DabangRoom,
} from "../services/dabang.js";
import { describeApiError } from "../services/errors.js";
import { render } from "../services/format.js";
import { logger } from "../logger.js";

const responseFormat = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe(
    "Output format: 'markdown' for human-readable text or 'json' for structured data",
  );

const DabangSearchRegionSchema = z
  .object({
    keyword: z
      .string()
      .min(1)
      .max(100)
      .describe('Korean place/region name, e.g. "강남구" or "역삼동"'),
    response_format: responseFormat,
  })
  .strict();

const DabangSearchListingsSchema = z
  .object({
    region_code: z
      .string()
      .optional()
      .describe(
        'Region code from dabang_search_region, e.g. "11680101" (역삼동). ' +
          "Use exactly one area: region_code, a bounding box, subway_id, or univ_id.",
      ),
    sw_lat: z.number().optional().describe("Bounding box: south-west latitude"),
    sw_lng: z.number().optional().describe("Bounding box: south-west longitude"),
    ne_lat: z.number().optional().describe("Bounding box: north-east latitude"),
    ne_lng: z.number().optional().describe("Bounding box: north-east longitude"),
    subway_id: z.string().optional().describe("Dabang subway station id"),
    univ_id: z.string().optional().describe("Dabang university id"),
    selling_types: z
      .array(z.enum(DABANG_SELLING_TYPES))
      .optional()
      .describe(
        "Deal types to include: MONTHLY_RENT (월세), LEASE (전세/jeonse). " +
          "Omit for both.",
      ),
    room_types: z
      .array(z.enum(DABANG_ROOM_TYPES))
      .optional()
      .describe(
        "Room categories: ONE_ROOM (원룸), TWO_ROOM (투룸), THREE_ROOM, " +
          "OFFICETEL (오피스텔), APT (아파트). Defaults to ONE_ROOM + TWO_ROOM.",
      ),
    room_floors: z
      .array(z.enum(DABANG_ROOM_FLOORS))
      .optional()
      .describe(
        "Floor types: GROUND_FIRST (1층), GROUND_SECOND_OVER (2층 이상), " +
          "SEMI_BASEMENT (반지하), ROOFTOP (옥탑). Omit for all.",
      ),
    min_deposit: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Minimum deposit (보증금) in 만원 (10,000 KRW)"),
    max_deposit: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Maximum deposit (보증금) in 만원 (10,000 KRW)"),
    min_price: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Minimum monthly rent / lease amount (월세/전세) in 만원"),
    max_price: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Maximum monthly rent / lease amount (월세/전세) in 만원"),
    min_size: z
      .number()
      .min(0)
      .optional()
      .describe("Minimum size in 평 (pyeong, ≈3.3 m²)"),
    max_size: z
      .number()
      .min(0)
      .optional()
      .describe("Maximum size in 평 (pyeong, ≈3.3 m²)"),
    page: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Result page number (1-based)"),
    response_format: responseFormat,
  })
  .strict();

type SearchRegionInput = z.infer<typeof DabangSearchRegionSchema>;
type SearchListingsInput = z.infer<typeof DabangSearchListingsSchema>;

const SELLING_TYPE_LABEL: Record<string, string> = {
  MONTHLY_RENT: "월세",
  LEASE: "전세",
};

/** Resolves the area selector from the input, or returns an error message. */
function resolveArea(input: SearchListingsInput): DabangArea | string {
  const hasBox =
    input.sw_lat !== undefined &&
    input.sw_lng !== undefined &&
    input.ne_lat !== undefined &&
    input.ne_lng !== undefined;
  const provided = [
    Boolean(input.region_code),
    hasBox,
    Boolean(input.subway_id),
    Boolean(input.univ_id),
  ].filter(Boolean).length;

  if (provided === 0) {
    return (
      "Provide exactly one area: region_code (from dabang_search_region), all " +
      "four bounding-box coordinates (sw_lat, sw_lng, ne_lat, ne_lng), " +
      "subway_id, or univ_id."
    );
  }
  if (provided > 1) {
    return "Provide only one area (region_code, bounding box, subway_id, or univ_id), not several.";
  }
  if (input.region_code) return { type: "region", code: input.region_code };
  if (hasBox) {
    return {
      type: "bbox",
      bbox: {
        sw: { lat: input.sw_lat as number, lng: input.sw_lng as number },
        ne: { lat: input.ne_lat as number, lng: input.ne_lng as number },
      },
    };
  }
  if (input.subway_id) return { type: "subway", id: input.subway_id };
  return { type: "univ", id: input.univ_id as string };
}

/** Splits a "deposit/rent" priceTitle (만원) into its two parts. */
function parsePrice(priceTitle?: string): {
  deposit?: string;
  rent?: string;
} {
  if (!priceTitle) return {};
  const parts = priceTitle.split("/").map((p) => p.trim());
  if (parts.length === 2) return { deposit: parts[0], rent: parts[1] };
  return { deposit: parts[0] };
}

/** Reduces a room to a compact structured object. */
function summariseRoom(r: DabangRoom): Record<string, unknown> {
  const { deposit, rent } = parsePrice(r.priceTitle);
  return {
    id: r.id,
    title: r.roomTitle,
    room_type: r.roomTypeName,
    price_type: r.priceTypeName,
    deposit_manwon: deposit,
    rent_manwon: rent,
    description: r.roomDesc,
    dong: r.dongName,
    approx_lat: r.randomLocation?.lat,
    approx_lng: r.randomLocation?.lng,
    image: r.imgUrlList?.[0],
    is_direct: r.isDirect || undefined,
    has_pano: r.isPano || undefined,
  };
}

const COORD_NOTE =
  "Coordinates are approximate (Dabang jitters them for privacy). Full " +
  "address, contact, and listing detail require the Dabang app/site and are " +
  "login-gated — not available through this tool.";

/** Registers the Dabang (다방) read-only search tools. */
export function registerDabangTools(server: McpServer): void {
  const client = new DabangClient();

  server.registerTool(
    "dabang_search_region",
    {
      title: "Resolve a Korean place name on Dabang (다방)",
      description:
        "Resolve a Korean place/region name (동/구/시) to Dabang region " +
        "matches, each with a region code and coordinates. Use the returned " +
        "code with dabang_search_listings. Read-only, no login.",
      inputSchema: DabangSearchRegionSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: SearchRegionInput) => {
      try {
        const data = await client.searchRegion(input.keyword);
        const list = data.result?.list ?? [];
        const structured = {
          keyword: input.keyword,
          count: list.length,
          results: list.map((r: DabangRegion) => ({
            code: r.code,
            name: r.name,
            full_name: r.fullName,
            city: r.parentCityName,
            state: r.parentStateName,
            longitude: r.location?.[0],
            latitude: r.location?.[1],
          })),
        };
        const markdown =
          list.length === 0
            ? `# Dabang 지역 검색: "${input.keyword}"\n\nNo matches.`
            : [
                `# Dabang 지역 검색: "${input.keyword}"`,
                "",
                "| code | 지역 | 좌표 (lat, lng) |",
                "| --- | --- | --- |",
                ...list.map(
                  (r) =>
                    `| ${r.code} | ${r.fullName ?? r.name} | ${
                      r.location ? `${r.location[1]}, ${r.location[0]}` : "?"
                    } |`,
                ),
              ].join("\n");
        return {
          content: [
            { type: "text", text: render(input.response_format, markdown, structured) },
          ],
        };
      } catch (error) {
        logger.error(
          "dabang_search_region failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [{ type: "text", text: describeApiError(error, "Region search failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "dabang_search_listings",
    {
      title: "Search Dabang (다방) room listings",
      description:
        "Search 원룸/투룸 (and 오피스텔/아파트) rental listings on Dabang " +
        "(다방). Read-only, no login. Specify exactly one area — region_code " +
        "(from dabang_search_region), a bounding box, subway_id, or univ_id — " +
        "and filter by deal type (월세/전세), room type, deposit, rent, size, " +
        "and floor, with pagination. Prices are in 만원 (10,000 KRW). " +
        "NOTE: this is search-only; full address, contact, and listing detail " +
        "are login-gated on Dabang and cannot be fetched here. Coordinates " +
        "returned are approximate (jittered).",
      inputSchema: DabangSearchListingsSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: SearchListingsInput) => {
      const area = resolveArea(input);
      if (typeof area === "string") {
        return { content: [{ type: "text", text: area }], isError: true };
      }
      try {
        const filters = buildFilters({
          sellingTypeList: input.selling_types,
          roomTypeList: input.room_types,
          roomFloorList: input.room_floors,
          depositRange:
            input.min_deposit !== undefined || input.max_deposit !== undefined
              ? { min: input.min_deposit, max: input.max_deposit }
              : undefined,
          priceRange:
            input.min_price !== undefined || input.max_price !== undefined
              ? { min: input.min_price, max: input.max_price }
              : undefined,
          pyeongRange:
            input.min_size !== undefined || input.max_size !== undefined
              ? { min: input.min_size, max: input.max_size }
              : undefined,
        });
        const data = await client.searchRooms({
          area,
          filters,
          page: input.page,
          zoom: 15,
        });
        const result = data.result;
        const rooms = result?.roomList ?? [];
        const total = result?.total ?? 0;
        const hasMore = result?.hasMore ?? false;

        const structured = {
          total,
          has_more: hasMore,
          page: input.page,
          note: COORD_NOTE,
          count: rooms.length,
          results: rooms.map(summariseRoom),
        };

        const markdown =
          rooms.length === 0
            ? `# Dabang 매물 검색\n\nNo listings matched.`
            : [
                "# Dabang 매물 검색",
                "",
                `Total ${total.toLocaleString()} match(es); showing ${rooms.length} on page ${input.page}` +
                  `${hasMore ? " (more available)" : ""}. Prices in 만원 (10,000 KRW).`,
                "",
                ...rooms.map((r, i) => roomMarkdown(r, i + 1)),
                "",
                `> ${COORD_NOTE}`,
              ].join("\n");
        return {
          content: [
            { type: "text", text: render(input.response_format, markdown, structured) },
          ],
        };
      } catch (error) {
        logger.error(
          "dabang_search_listings failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [{ type: "text", text: describeApiError(error, "Listing search failed") }],
          isError: true,
        };
      }
    },
  );

  logger.info("Registered dabang tools (search-only: region, listings).");
}

/** Renders one room as a markdown block. */
function roomMarkdown(r: DabangRoom, index: number): string {
  const { deposit, rent } = parsePrice(r.priceTitle);
  const priceType = r.priceTypeName ?? SELLING_TYPE_LABEL.MONTHLY_RENT;
  const lines = [`## ${index}. ${r.roomTitle ?? "(제목 없음)"} (${r.roomTypeName ?? "?"})`];
  if (deposit || rent) {
    const price = rent ? `${deposit}/${rent}` : deposit;
    lines.push(`- ${priceType}: ${price} 만원`);
  }
  if (r.roomDesc) lines.push(`- ${r.roomDesc}`);
  if (r.dongName) lines.push(`- 위치: ${r.dongName}`);
  if (r.randomLocation) {
    lines.push(`- 좌표(근사): ${r.randomLocation.lat}, ${r.randomLocation.lng}`);
  }
  if (r.isDirect) lines.push("- 직거래");
  if (r.imgUrlList?.[0]) lines.push(`- ${r.imgUrlList[0]}`);
  return lines.join("\n");
}

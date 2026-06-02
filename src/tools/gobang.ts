import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ToolContext } from "../context.js";
import type {
  GobangHouseDetail,
  GobangHouseSummary,
  GobangPlace,
  GobangSido,
} from "../types.js";
import {
  GOBANG_LOCATION_REQUIRED,
  GobangCountSchema,
  GobangDetailSchema,
  GobangNearbySchema,
  GobangRegionsSchema,
  GobangSearchPlacesSchema,
  GobangSearchSchema,
  gobangHasLocation,
} from "../schemas.js";
import type { GobangFilter, GobangHouseType } from "../services/gobang.js";
import { describeApiError } from "../services/errors.js";
import { render } from "../services/format.js";
import { logger } from "../logger.js";

type SearchInput = z.infer<typeof GobangSearchSchema>;
type CountInput = z.infer<typeof GobangCountSchema>;
type DetailInput = z.infer<typeof GobangDetailSchema>;
type NearbyInput = z.infer<typeof GobangNearbySchema>;
type PlacesInput = z.infer<typeof GobangSearchPlacesSchema>;
type RegionsInput = z.infer<typeof GobangRegionsSchema>;

const HOUSE_TYPE_LABEL: Record<string, string> = {
  GOSIWON: "고시원",
  ONE_ROOM_TEL: "원룸텔",
  ONE_TWO_ROOM: "원룸/투룸",
  SHARE_HOUSE: "쉐어하우스",
  CO_LIVING: "코리빙",
  OFFICETEL: "오피스텔",
};

const GENDER_LABEL: Record<string, string> = {
  MALE: "남성전용",
  FEMALE: "여성전용",
  ALL: "남녀공용",
};

function placeUrl(no: number): string {
  return `https://gobang.kr/place/${no}`;
}

function typeLabels(types?: string[]): string {
  if (!types || types.length === 0) return "?";
  return types.map((t) => HOUSE_TYPE_LABEL[t] ?? t).join(", ");
}

/** "36~41만원" or "36만원" or "" when unknown. */
function range(min?: number, max?: number, unit = "만원"): string {
  if (min === undefined && max === undefined) return "";
  if (min !== undefined && max !== undefined && min !== max) {
    return `${min}~${max}${unit}`;
  }
  return `${min ?? max}${unit}`;
}

/** Maps snake_case schema filter fields to the client's camelCase filter. */
function toFilter(input: {
  sido_code?: string;
  dongli_code?: string;
  sw_lat?: number;
  ne_lat?: number;
  sw_lng?: number;
  ne_lng?: number;
  house_types?: readonly string[];
  gender?: "ALL" | "MALE" | "FEMALE";
  min_price?: number;
  max_price?: number;
  min_deposit?: number;
  max_deposit?: number;
  min_age?: number;
  max_age?: number;
  keyword?: string;
}): GobangFilter {
  return {
    sidoCode: input.sido_code,
    dongliCode: input.dongli_code,
    swLat: input.sw_lat,
    neLat: input.ne_lat,
    swLng: input.sw_lng,
    neLng: input.ne_lng,
    houseTypes: input.house_types as GobangHouseType[] | undefined,
    gender: input.gender,
    minPrice: input.min_price,
    maxPrice: input.max_price,
    minDeposit: input.min_deposit,
    maxDeposit: input.max_deposit,
    minAge: input.min_age,
    maxAge: input.max_age,
    keyword: input.keyword,
  };
}

/** Reduces a listing summary to a compact structured object. */
function summarise(h: GobangHouseSummary): Record<string, unknown> {
  const subway = h.nearSubways?.[0];
  return {
    no: h.no,
    name: h.name,
    types: h.houseTypes?.map((t) => HOUSE_TYPE_LABEL[t] ?? t),
    monthly_rent: range(h.minPrice, h.maxPrice),
    deposit: range(h.minDeposit, h.maxDeposit),
    location: h.eupmyeondongFullName ?? h.eupmyeondongName,
    nearest_subway: subway
      ? `${subway.name}${subway.distance ? ` ${Math.round(subway.distance * 1000)}m` : ""}`
      : undefined,
    tags: h.tags?.slice(0, 6).map((t) => t.name),
    has_tour_video: h.hasTourVideo || undefined,
    review_count: h.reviewCount || undefined,
    url: placeUrl(h.no),
  };
}

/** Renders one listing as a markdown block. */
function houseMarkdown(h: GobangHouseSummary, index: number): string {
  const s = summarise(h);
  const lines = [`## ${index}. ${h.name} (${typeLabels(h.houseTypes)})`];
  const rent = range(h.minPrice, h.maxPrice);
  if (rent) lines.push(`- 월세: ${rent}${range(h.minDeposit, h.maxDeposit) ? ` / 보증금 ${range(h.minDeposit, h.maxDeposit)}` : ""}`);
  if (s.location) lines.push(`- 위치: ${s.location as string}`);
  if (s.nearest_subway) lines.push(`- 지하철: ${s.nearest_subway as string}`);
  if (s.tags && (s.tags as string[]).length) lines.push(`- 태그: ${(s.tags as string[]).join(", ")}`);
  if (h.hasTourVideo) lines.push("- 영상 투어 있음");
  lines.push(`- ${placeUrl(h.no)}`);
  return lines.join("\n");
}

function listText(
  title: string,
  houses: GobangHouseSummary[],
  extra: Record<string, unknown>,
  format: SearchInput["response_format"],
): string {
  const structured = { ...extra, count: houses.length, results: houses.map(summarise) };
  if (houses.length === 0) {
    return render(format, `# ${title}\n\nNo listings matched.`, structured);
  }
  const markdown = [
    `# ${title}`,
    "",
    `Showing ${houses.length} listing(s). Prices are monthly rent / deposit in 만원 (10,000 KRW).`,
    "",
    ...houses.map((h, i) => houseMarkdown(h, i + 1)),
  ].join("\n");
  return render(format, markdown, structured);
}

/** Registers the gobang.kr listing tools (unauthenticated search surface). */
export function registerGobangTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "gobang_search_listings",
    {
      title: "Search gobang.kr housing listings",
      description:
        "Search 1인가구 (single-person) housing listings on gobang.kr — 고시원, " +
        "원룸텔, 원룸/투룸, 쉐어하우스, 코리빙, 오피스텔. Read-only, no login. " +
        "Requires a location (sido_code or dongli_code from gobang_regions / " +
        "gobang_search_places, or a bounding box) and supports filtering by " +
        "house type, gender, monthly rent, deposit, and tenant age, with " +
        "pagination. Prices are in 만원 (10,000 KRW).",
      inputSchema: GobangSearchSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: SearchInput) => {
      if (!gobangHasLocation(input)) {
        return {
          content: [{ type: "text", text: GOBANG_LOCATION_REQUIRED }],
          isError: true,
        };
      }
      try {
        const data = await ctx.gobang.searchHouses({
          ...toFilter(input),
          pageNo: input.page,
          pageSize: input.page_size,
        });
        const houses = data.result ?? [];
        return {
          content: [
            {
              type: "text",
              text: listText(
                "gobang.kr 매물 검색",
                houses,
                { page: input.page, page_size: input.page_size },
                input.response_format,
              ),
            },
          ],
        };
      } catch (error) {
        logger.error(
          "gobang_search_listings failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [{ type: "text", text: describeApiError(error, "Listing search failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "gobang_count_listings",
    {
      title: "Count gobang.kr listings",
      description:
        "Count how many gobang.kr listings match a filter, without fetching " +
        "them — useful to gauge a region or to refine filters before searching. " +
        "Takes the same location and filter parameters as gobang_search_listings. " +
        "Read-only.",
      inputSchema: GobangCountSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: CountInput) => {
      if (!gobangHasLocation(input)) {
        return {
          content: [{ type: "text", text: GOBANG_LOCATION_REQUIRED }],
          isError: true,
        };
      }
      try {
        const data = await ctx.gobang.countHouses(toFilter(input));
        const count = data.result ?? 0;
        return {
          content: [
            {
              type: "text",
              text: render(
                input.response_format,
                `${count.toLocaleString()} listing(s) match the given filter.`,
                { count },
              ),
            },
          ],
        };
      } catch (error) {
        logger.error(
          "gobang_count_listings failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [{ type: "text", text: describeApiError(error, "Listing count failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "gobang_listing_detail",
    {
      title: "Get a gobang.kr listing's detail",
      description:
        "Fetch the full detail of one gobang.kr listing by its number (the id " +
        "in a gobang.kr/place/<no> URL, also returned by the search tools). " +
        "Returns address, contact, gender/age policy, price/deposit, tags, and " +
        "nearby subways and schools. Read-only.",
      inputSchema: GobangDetailSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: DetailInput) => {
      try {
        const data = await ctx.gobang.getHouse(input.house_no);
        const h = data.result;
        if (!h) {
          return {
            content: [
              { type: "text", text: `No listing found with number ${input.house_no}.` },
            ],
            isError: true,
          };
        }
        return {
          content: [
            { type: "text", text: detailText(h, input.response_format) },
          ],
        };
      } catch (error) {
        logger.error(
          "gobang_listing_detail failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [{ type: "text", text: describeApiError(error, "Listing detail failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "gobang_listings_nearby",
    {
      title: "Find gobang.kr listings near a coordinate",
      description:
        "Find gobang.kr listings near a latitude/longitude, within the 0-500m " +
        "or 500-1000m band. Pair with gobang_search_places (or the kakao " +
        "geocoding tools) to turn a place name into coordinates first. Supports " +
        "the same house type, gender, and price filters. Read-only.",
      inputSchema: GobangNearbySchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: NearbyInput) => {
      try {
        const data = await ctx.gobang.nearbyHouses({
          ...toFilter(input),
          latitude: input.latitude,
          longitude: input.longitude,
          band: input.band,
          pageNo: input.page,
          pageSize: input.page_size,
        });
        const houses = data.result ?? [];
        return {
          content: [
            {
              type: "text",
              text: listText(
                `gobang.kr 주변 매물 (${input.band}m)`,
                houses,
                { latitude: input.latitude, longitude: input.longitude, band: input.band, page: input.page },
                input.response_format,
              ),
            },
          ],
        };
      } catch (error) {
        logger.error(
          "gobang_listings_nearby failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [{ type: "text", text: describeApiError(error, "Nearby listing search failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "gobang_search_places",
    {
      title: "Resolve a place/subway/region name on gobang.kr",
      description:
        "Resolve a place, subway station, or region name to coordinates and " +
        "metadata using gobang.kr's own place search. Use the returned x " +
        "(longitude) and y (latitude) with gobang_listings_nearby. Read-only.",
      inputSchema: GobangSearchPlacesSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: PlacesInput) => {
      try {
        const data = await ctx.gobang.searchPlaces(input.keyword);
        const items = data.result?.items ?? [];
        const structured = {
          keyword: input.keyword,
          count: items.length,
          results: items.map((p: GobangPlace) => ({
            name: p.placeName,
            category: p.category,
            line: p.line,
            longitude: p.x,
            latitude: p.y,
          })),
        };
        const markdown =
          items.length === 0
            ? `# Place search: "${input.keyword}"\n\nNo matches.`
            : [
                `# Place search: "${input.keyword}"`,
                "",
                ...items.map(
                  (p, i) =>
                    `${i + 1}. ${p.placeName ?? "?"}` +
                    `${p.line ? ` (${p.line})` : p.category ? ` [${p.category}]` : ""}` +
                    `${p.y !== undefined && p.x !== undefined ? ` — lat ${p.y}, lng ${p.x}` : ""}`,
                ),
              ].join("\n");
        return {
          content: [
            { type: "text", text: render(input.response_format, markdown, structured) },
          ],
        };
      } catch (error) {
        logger.error(
          "gobang_search_places failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [{ type: "text", text: describeApiError(error, "Place search failed") }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "gobang_regions",
    {
      title: "List gobang.kr regions",
      description:
        "List gobang.kr's top-level regions (시/도) with their sido_code and " +
        "current listing count. Use a sido_code with gobang_search_listings or " +
        "gobang_count_listings. Read-only.",
      inputSchema: GobangRegionsSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: RegionsInput) => {
      try {
        const data = await ctx.gobang.listSidos();
        const sidos = data.result ?? [];
        const structured = {
          count: sidos.length,
          regions: sidos.map((s: GobangSido) => ({
            sido_code: s.sidoCode,
            name: s.sidoName,
            full_name: s.sidoFullName,
            listing_count: s.houseCount,
          })),
        };
        const markdown = [
          "# gobang.kr 지역 (시/도)",
          "",
          "| sido_code | 지역 | 매물 수 |",
          "| --- | --- | --- |",
          ...sidos.map(
            (s) => `| ${s.sidoCode} | ${s.sidoName} | ${(s.houseCount ?? 0).toLocaleString()} |`,
          ),
        ].join("\n");
        return {
          content: [
            { type: "text", text: render(input.response_format, markdown, structured) },
          ],
        };
      } catch (error) {
        logger.error(
          "gobang_regions failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [{ type: "text", text: describeApiError(error, "Region list failed") }],
          isError: true,
        };
      }
    },
  );

  logger.info(
    "Registered gobang tools (search, count, detail, nearby, places, regions).",
  );
}

/** Renders a full listing detail as markdown. */
function detailText(
  h: GobangHouseDetail,
  format: DetailInput["response_format"],
): string {
  const structured = {
    no: h.no,
    name: h.name,
    types: h.houseTypes?.map((t) => HOUSE_TYPE_LABEL[t] ?? t),
    address: h.addrFullBunji,
    address_detail: h.addrDetail,
    monthly_rent: range(h.minPrice, h.maxPrice),
    deposit: range(h.minDeposit, h.maxDeposit),
    gender: h.gender ? (GENDER_LABEL[h.gender] ?? h.gender) : undefined,
    age_range:
      h.minAge !== undefined || h.maxAge !== undefined
        ? `${h.minAge ?? "?"}~${h.maxAge ?? "?"}`
        : undefined,
    total_floor: h.totalFloor,
    tel: h.telNo ?? h.virtualTelNo,
    tags: h.tags?.map((t) => t.name),
    near_subways: h.nearSubways?.map(
      (s) => `${s.name}${s.distance ? ` ${Math.round(s.distance * 1000)}m` : ""}${s.line ? ` (${s.line})` : ""}`,
    ),
    near_schools: h.nearSchools?.map((s) => s.name).filter(Boolean),
    info: h.houseInfo,
    notice: h.notice,
    latitude: h.latitude,
    longitude: h.longitude,
    url: placeUrl(h.no),
  };

  const lines = [`# ${h.name} (${typeLabels(h.houseTypes)})`, ""];
  if (structured.address) lines.push(`- 주소: ${structured.address}${h.addrDetail ? ` ${h.addrDetail}` : ""}`);
  const rent = range(h.minPrice, h.maxPrice);
  if (rent) lines.push(`- 월세: ${rent}`);
  const dep = range(h.minDeposit, h.maxDeposit);
  if (dep) lines.push(`- 보증금: ${dep}`);
  if (structured.gender) lines.push(`- 성별: ${structured.gender}`);
  if (structured.age_range) lines.push(`- 연령: ${structured.age_range}`);
  if (h.totalFloor) lines.push(`- 총 ${h.totalFloor}층`);
  if (structured.tel) lines.push(`- 연락처: ${structured.tel}`);
  if (h.tags?.length) lines.push(`- 태그: ${h.tags.map((t) => t.name).join(", ")}`);
  if (structured.near_subways?.length) {
    lines.push(`- 지하철: ${structured.near_subways.join(" · ")}`);
  }
  if (structured.near_schools?.length) {
    lines.push(`- 학교: ${structured.near_schools.join(", ")}`);
  }
  if (h.houseInfo) lines.push("", h.houseInfo);
  lines.push("", placeUrl(h.no));
  return render(format, lines.join("\n"), structured);
}

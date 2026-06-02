import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ResponseFormat } from "../schemas.js";
import { describeApiError } from "../services/errors.js";
import { render } from "../services/format.js";
import {
  type ZigbangDomain,
  type ZigbangItemDetail,
  type ZigbangSalesType,
  ZIGBANG_DOMAIN_LABEL,
  ZIGBANG_DOMAINS,
  ZIGBANG_SALES_TYPES,
  ZigbangClient,
  encodeGeohash,
} from "../services/zigbang.js";
import { logger } from "../logger.js";

/** Output-format field shared by every tool (mirrors src/schemas.ts). */
const responseFormat = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe(
    "Output format: 'markdown' for human-readable text or 'json' for structured data",
  );

const propertyType = z
  .enum(ZIGBANG_DOMAINS)
  .default("oneroom")
  .describe(
    "Property type: oneroom 원룸, officetel 오피스텔, villa 빌라. Default oneroom.",
  );

const salesTypes = z
  .array(z.enum(ZIGBANG_SALES_TYPES))
  .optional()
  .describe(
    "Deal types to include: 전세 (jeonse / lump-sum deposit), 월세 (monthly " +
      "rent), 매매 (purchase). Omit for all.",
  );

const ZigbangSearchPlacesSchema = z
  .object({
    keyword: z
      .string()
      .min(1)
      .max(100)
      .describe('Place, subway, region, or apartment name, e.g. "강남역" or "역삼동"'),
    response_format: responseFormat,
  })
  .strict();

const ZigbangSearchListingsSchema = z
  .object({
    geohash: z
      .string()
      .min(1)
      .max(12)
      .optional()
      .describe(
        "Geohash cell to search (e.g. \"wydm9\" ≈ central Seoul). Provide this " +
          "OR latitude+longitude.",
      ),
    latitude: z
      .number()
      .optional()
      .describe("Centre latitude (WGS84); used with longitude to compute a geohash"),
    longitude: z
      .number()
      .optional()
      .describe("Centre longitude (WGS84); used with latitude to compute a geohash"),
    precision: z
      .number()
      .int()
      .min(3)
      .max(8)
      .default(5)
      .describe("Geohash precision when computed from lat/lng (5 ≈ ~5km cell)"),
    property_type: propertyType,
    deposit_min: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Minimum deposit (보증금) in 만원 (10,000 KRW)"),
    deposit_max: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Maximum deposit (보증금) in 만원 (10,000 KRW)"),
    rent_min: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Minimum monthly rent (월세) in 만원 (10,000 KRW)"),
    rent_max: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Maximum monthly rent (월세) in 만원 (10,000 KRW)"),
    sales_types: salesTypes,
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(15)
      .describe("Number of listings to detail and return, fetched in area order (1-30)"),
    response_format: responseFormat,
  })
  .strict();

const ZigbangDetailSchema = z
  .object({
    item_id: z
      .number()
      .int()
      .positive()
      .describe("Listing itemId (also returned by zigbang_search_listings)"),
    response_format: responseFormat,
  })
  .strict();

type SearchPlacesInput = z.infer<typeof ZigbangSearchPlacesSchema>;
type SearchListingsInput = z.infer<typeof ZigbangSearchListingsSchema>;
type DetailInput = z.infer<typeof ZigbangDetailSchema>;

const LOCATION_REQUIRED =
  "Provide either a geohash, or both latitude and longitude.";

function listingUrl(domain: ZigbangDomain, itemId: number): string {
  return `https://www.zigbang.com/home/${domain}/items/${itemId}`;
}

/** "24000만원" formatted with thousands separators, or "" when unknown. */
function man(value?: number): string {
  if (value === undefined || value === null) return "";
  return `${value.toLocaleString()}만원`;
}

/** "전세 2.4억" style price summary. */
function priceLine(item: ZigbangItemDetail): string {
  const sales = item.salesType ?? "";
  const deposit = item.price?.deposit;
  const rent = item.price?.rent;
  if (sales === "월세") {
    return `월세 ${man(deposit)}/${man(rent)}`.replace("만원/", "/");
  }
  return `${sales} ${man(deposit)}`.trim();
}

function sizeText(item: ZigbangItemDetail): string | undefined {
  const m2 = item.area?.전용면적M2 ?? item.area?.계약면적M2;
  return m2 !== undefined ? `${m2}㎡` : undefined;
}

function floorText(item: ZigbangItemDetail): string | undefined {
  const f = item.floor;
  if (!f?.floor) return undefined;
  return f.allFloors ? `${f.floor}/${f.allFloors}층` : `${f.floor}층`;
}

/** Reduces a detailed item to a compact structured object. */
function summarise(
  item: ZigbangItemDetail,
  domain: ZigbangDomain,
): Record<string, unknown> {
  const loc = item.location ?? item.randomLocation;
  return {
    item_id: item.itemId,
    title: item.title,
    sales_type: item.salesType,
    service_type: item.serviceType,
    room_type: item.roomType,
    deposit: item.price?.deposit,
    rent: item.price?.rent,
    price: priceLine(item),
    size_m2: item.area?.전용면적M2 ?? item.area?.계약면적M2,
    floor: floorText(item),
    manage_cost: item.manageCost?.amount,
    address: item.addressOrigin?.fullText ?? item.jibunAddress,
    latitude: loc?.lat,
    longitude: loc?.lng,
    url: listingUrl(domain, item.itemId),
  };
}

/** Renders one listing summary as a markdown block. */
function listingMarkdown(
  item: ZigbangItemDetail,
  domain: ZigbangDomain,
  index: number,
): string {
  const lines = [`## ${index}. ${item.title ?? `매물 ${item.itemId}`}`];
  const price = priceLine(item);
  if (price) lines.push(`- 가격: ${price}`);
  const type = [item.serviceType, item.roomType].filter(Boolean).join(" · ");
  if (type) lines.push(`- 유형: ${type}`);
  const size = sizeText(item);
  if (size) lines.push(`- 전용면적: ${size}`);
  const floor = floorText(item);
  if (floor) lines.push(`- 층: ${floor}`);
  const addr = item.addressOrigin?.fullText ?? item.jibunAddress;
  if (addr) lines.push(`- 위치: ${addr}`);
  if (item.manageCost?.amount) lines.push(`- 관리비: ${man(item.manageCost.amount)}`);
  lines.push(`- ${listingUrl(domain, item.itemId)}`);
  return lines.join("\n");
}

/** Registers the Zigbang (직방) listing tools (anonymous, read-only). */
export function registerZigbangTools(server: McpServer): void {
  const client = new ZigbangClient();

  server.registerTool(
    "zigbang_search_places",
    {
      title: "Resolve a place/subway/region name on Zigbang",
      description:
        "Resolve a place, subway station, region, or apartment name to " +
        "coordinates and metadata using Zigbang's (직방) own place search. Use " +
        "the returned latitude/longitude with zigbang_search_listings. " +
        "Read-only, no login.",
      inputSchema: ZigbangSearchPlacesSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: SearchPlacesInput) => {
      try {
        const data = await client.searchPlaces(input.keyword);
        const items = data.items ?? [];
        const structured = {
          keyword: input.keyword,
          count: items.length,
          results: items.map((p) => ({
            id: p.id,
            type: p.type,
            name: p.name,
            hint: p.hint,
            description: p.description,
            latitude: p.lat,
            longitude: p.lng,
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
                    `${i + 1}. ${p.name} [${p.type}]` +
                    `${p.hint ? ` (${p.hint})` : ""}` +
                    ` — lat ${p.lat}, lng ${p.lng}`,
                ),
              ].join("\n");
        return {
          content: [
            { type: "text", text: render(input.response_format, markdown, structured) },
          ],
        };
      } catch (error) {
        logger.error(
          "zigbang_search_places failed:",
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
    "zigbang_search_listings",
    {
      title: "Search Zigbang housing listings in an area",
      description:
        "Search Zigbang (직방) rental/sale listings within a geohash cell. " +
        "Provide a geohash, or a latitude+longitude (a geohash is computed at " +
        "the given precision, default 5 ≈ ~5km cell). Filter by property_type " +
        "(oneroom/officetel/villa), deposit/rent range (만원), and sales_types " +
        "(전세/월세/매매). The area endpoint returns only IDs, so this details " +
        "the first `limit` items (default 15, max 30) — it does NOT detail " +
        "every item in the cell. Read-only, no login.",
      inputSchema: ZigbangSearchListingsSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: SearchListingsInput) => {
      let geohash = input.geohash;
      if (!geohash) {
        if (input.latitude === undefined || input.longitude === undefined) {
          return {
            content: [{ type: "text", text: LOCATION_REQUIRED }],
            isError: true,
          };
        }
        geohash = encodeGeohash(input.latitude, input.longitude, input.precision);
      }
      const domain = input.property_type;
      try {
        const area = await client.listArea(domain, geohash, {
          depositMin: input.deposit_min,
          depositMax: input.deposit_max,
          rentMin: input.rent_min,
          rentMax: input.rent_max,
          salesTypes: input.sales_types as ZigbangSalesType[] | undefined,
        });
        const ids = (area.items ?? []).slice(0, input.limit).map((i) => i.itemId);
        const details = await Promise.all(
          ids.map((id) =>
            client
              .getItem(id)
              .then((d) => d.item)
              .catch(() => undefined),
          ),
        );
        const items = details.filter(
          (i): i is ZigbangItemDetail => i !== undefined,
        );
        const structured = {
          geohash,
          property_type: domain,
          total_in_cell: area.items?.length ?? 0,
          detailed: items.length,
          results: items.map((i) => summarise(i, domain)),
        };
        const markdown =
          items.length === 0
            ? `# Zigbang ${ZIGBANG_DOMAIN_LABEL[domain]} 검색 (geohash ${geohash})\n\nNo listings matched.`
            : [
                `# Zigbang ${ZIGBANG_DOMAIN_LABEL[domain]} 검색 (geohash ${geohash})`,
                "",
                `Cell has ${area.items?.length ?? 0} listing(s); showing detail ` +
                  `for ${items.length}. Prices are deposit/rent in 만원 (10,000 KRW).`,
                "",
                ...items.map((i, idx) => listingMarkdown(i, domain, idx + 1)),
              ].join("\n");
        return {
          content: [
            { type: "text", text: render(input.response_format, markdown, structured) },
          ],
        };
      } catch (error) {
        logger.error(
          "zigbang_search_listings failed:",
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
    "zigbang_listing_detail",
    {
      title: "Get a Zigbang listing's detail",
      description:
        "Fetch the full detail of one Zigbang (직방) listing by its itemId (also " +
        "returned by zigbang_search_listings). Returns deal type, price, size, " +
        "floor, address, options, management cost, nearby subways, and agent " +
        "contact. Read-only, no login.",
      inputSchema: ZigbangDetailSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: DetailInput) => {
      try {
        const data = await client.getItem(input.item_id);
        const item = data.item;
        if (!item) {
          return {
            content: [
              { type: "text", text: `No listing found with itemId ${input.item_id}.` },
            ],
            isError: true,
          };
        }
        return {
          content: [
            { type: "text", text: detailText(data, input.response_format) },
          ],
        };
      } catch (error) {
        logger.error(
          "zigbang_listing_detail failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [{ type: "text", text: describeApiError(error, "Listing detail failed") }],
          isError: true,
        };
      }
    },
  );

  logger.info("Registered zigbang tools (search_places, search_listings, listing_detail).");
}

/** Renders a full listing detail as markdown. */
function detailText(
  data: { item?: ZigbangItemDetail; agent?: { agentTitle?: string; agentName?: string; agentPhone?: string }; subways?: { name: string; description?: string }[] },
  format: DetailInput["response_format"],
): string {
  const item = data.item as ZigbangItemDetail;
  // Detail tools currently only call /v3/items/{id} for oneroom-style URLs; the
  // service type is the most reliable label, so default the URL domain to oneroom.
  const domain: ZigbangDomain =
    item.serviceType === "오피스텔"
      ? "officetel"
      : item.serviceType === "빌라"
        ? "villa"
        : "oneroom";
  const loc = item.location ?? item.randomLocation;
  const subways = (data.subways ?? []).map(
    (s) => `${s.name}${s.description ? ` (${s.description})` : ""}`,
  );
  const structured = {
    ...summarise(item, domain),
    description: item.description,
    options: item.options,
    movein_date: item.moveinDate,
    direction: item.roomDirection,
    elevator: item.elevator,
    parking: item.parkingAvailableText,
    bathroom_count: item.bathroomCount,
    near_subways: subways,
    agent: data.agent
      ? {
          title: data.agent.agentTitle,
          name: data.agent.agentName,
          phone: data.agent.agentPhone,
        }
      : undefined,
  };

  const lines = [`# ${item.title ?? `매물 ${item.itemId}`}`, ""];
  const price = priceLine(item);
  if (price) lines.push(`- 가격: ${price}`);
  const type = [item.serviceType, item.roomType].filter(Boolean).join(" · ");
  if (type) lines.push(`- 유형: ${type}`);
  const size = sizeText(item);
  if (size) lines.push(`- 전용면적: ${size}`);
  const floor = floorText(item);
  if (floor) lines.push(`- 층: ${floor}`);
  const addr = item.addressOrigin?.fullText ?? item.jibunAddress;
  if (addr) lines.push(`- 위치: ${addr}`);
  if (item.manageCost?.amount) lines.push(`- 관리비: ${man(item.manageCost.amount)}`);
  if (item.moveinDate) lines.push(`- 입주: ${item.moveinDate}`);
  if (item.roomDirection) lines.push(`- 방향: ${item.roomDirection}`);
  if (item.options?.length) lines.push(`- 옵션: ${item.options.join(", ")}`);
  if (subways.length) lines.push(`- 지하철: ${subways.join(" · ")}`);
  if (data.agent?.agentTitle) {
    lines.push(
      `- 중개사: ${data.agent.agentTitle}${data.agent.agentPhone ? ` (${data.agent.agentPhone})` : ""}`,
    );
  }
  if (loc?.lat !== undefined) lines.push(`- 좌표: ${loc.lat}, ${loc.lng}`);
  if (item.description) lines.push("", item.description);
  lines.push("", listingUrl(domain, item.itemId));
  return render(format, lines.join("\n"), structured);
}

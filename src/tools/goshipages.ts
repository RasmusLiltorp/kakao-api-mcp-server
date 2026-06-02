import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ResponseFormat } from "../schemas.js";
import {
  GoshipagesClient,
  type GoshipagesListingDetail,
  type GoshipagesListingSummary,
  type GoshipagesRoomType,
} from "../services/goshipages.js";
import { describeApiError } from "../services/errors.js";
import { render } from "../services/format.js";
import { logger } from "../logger.js";

const responseFormat = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe(
    "Output format: 'markdown' for human-readable text or 'json' for structured data",
  );

const SearchPlacesSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(100)
      .describe(
        'A place, subway station, region, or listing name to look up, e.g. "Sinchon" or "Hongdae"',
      ),
    response_format: responseFormat,
  })
  .strict();

const SearchListingsSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'A place/area/subway name to search around, e.g. "Sinchon". Resolved ' +
          "to a destination automatically. Provide this OR destn_id.",
      ),
    destn_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        "A destination id from a previous goshipages_search_places resolution " +
          "(the predID of a subway/region/area prediction). Provide this OR query.",
      ),
    gender: z
      .enum(["any", "male", "female"])
      .optional()
      .describe(
        "Client-side filter on the listing's gender policy: 'male' (male-only) " +
          "or 'female' (female-only). Omit for any.",
      ),
    quarantine_ok: z
      .boolean()
      .optional()
      .describe("Client-side filter: only listings marked quarantine-friendly"),
    min_monthly_krw: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Client-side filter: minimum monthly rate in KRW (e.g. 300000). " +
          "Matches listings whose monthly range reaches at least this.",
      ),
    max_monthly_krw: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Client-side filter: maximum monthly rate in KRW (e.g. 500000). " +
          "Matches listings whose monthly range starts at or below this.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("Maximum number of listings to return (1-50)"),
    response_format: responseFormat,
  })
  .strict();

const ListingDetailSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(200)
      .describe(
        'The listing slug from a search result, e.g. "hue-residence" ' +
          "(the path in a goshipages.com/<slug> URL)",
      ),
    response_format: responseFormat,
  })
  .strict();

type SearchPlacesInput = z.infer<typeof SearchPlacesSchema>;
type SearchListingsInput = z.infer<typeof SearchListingsSchema>;
type ListingDetailInput = z.infer<typeof ListingDetailSchema>;

const PRED_TYPE_LABEL: Record<string, string> = {
  subway: "Subway station",
  region: "Region",
  area: "Area",
  listing: "Listing",
};

/** Listing-level gender policy (0-3). */
const LISTING_GENDER_LABEL: Record<number, string> = {
  0: "Mixed (male & female share common areas)",
  1: "Mixed (separate male/female areas)",
  2: "Male only",
  3: "Female only",
};

/** Room-type gender policy (0-2). */
const ROOM_GENDER_LABEL: Record<number, string> = {
  0: "Male & female",
  1: "Male only",
  2: "Female only",
};

function listingUrl(slug: string): string {
  return `https://goshipages.com/${slug}`;
}

/** Converts a thousands-of-KRW value to full KRW. */
function toKrw(thousands: number | null | undefined): number | undefined {
  return thousands === null || thousands === undefined
    ? undefined
    : thousands * 1000;
}

/** "₩310,000–650,000" or "₩310,000" or "" when unknown. */
function krwRange(min?: number, max?: number): string {
  if (min === undefined && max === undefined) return "";
  if (min !== undefined && max !== undefined && min !== max) {
    return `₩${min.toLocaleString()}–${max.toLocaleString()}`;
  }
  return `₩${(min ?? max ?? 0).toLocaleString()}`;
}

/** Collects the enabled keys across a listing's option bool-maps. */
function listAmenities(
  options: Record<string, Record<string, boolean>> | null,
): string[] {
  if (!options) return [];
  const out: string[] = [];
  for (const group of Object.values(options)) {
    for (const [key, on] of Object.entries(group)) {
      if (on) out.push(key);
    }
  }
  return out;
}

function summariseListing(l: GoshipagesListingSummary): Record<string, unknown> {
  const monthly = krwRange(
    toKrw(l.monthlyRate?.min),
    toKrw(l.monthlyRate?.max),
  );
  const nightly = krwRange(
    toKrw(l.nightlyRate?.min),
    toKrw(l.nightlyRate?.max),
  );
  return {
    name: l.name,
    slug: l.slug,
    monthly_rate: monthly || undefined,
    nightly_rate: nightly || undefined,
    quarantine_ok: l.quarOK ?? undefined,
    latitude: l.latlon?.[0],
    longitude: l.latlon?.[1],
    image: l.imageURL ?? undefined,
    image_count: l.imageCount ?? undefined,
    url: listingUrl(l.slug),
  };
}

function listingMarkdown(l: GoshipagesListingSummary, index: number): string {
  const lines = [`## ${index}. ${l.name}`];
  const monthly = krwRange(toKrw(l.monthlyRate?.min), toKrw(l.monthlyRate?.max));
  const nightly = krwRange(toKrw(l.nightlyRate?.min), toKrw(l.nightlyRate?.max));
  if (monthly) lines.push(`- Monthly: ${monthly}`);
  if (nightly) lines.push(`- Nightly: ${nightly}`);
  if (l.quarOK) lines.push("- Quarantine-friendly");
  if (l.latlon) lines.push(`- Location: ${l.latlon[0]}, ${l.latlon[1]}`);
  lines.push(`- ${listingUrl(l.slug)}`);
  return lines.join("\n");
}

/** Registers the Goshipages stays tools (anonymous, read-only). */
export function registerGoshipagesTools(server: McpServer): void {
  const client = new GoshipagesClient();

  server.registerTool(
    "goshipages_search_places",
    {
      title: "Search Goshipages destinations",
      description:
        "Autocomplete a place, subway station, region, area, or listing name on " +
        "goshipages.com — a foreigner-facing Korean stays platform (goshiwon, " +
        "goshitel, livingtel, share-house, guesthouse). Returns predictions so " +
        "you can pick a destination to search around; pass a prediction's name " +
        "or pred_id to goshipages_search_listings. English-facing. Read-only.",
      inputSchema: SearchPlacesSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: SearchPlacesInput) => {
      try {
        const predictions = await client.predictDestinations(input.query);
        const structured = {
          query: input.query,
          count: predictions.length,
          results: predictions.map((p) => ({
            name: p.text1,
            subtitle: p.text2 ?? undefined,
            type: p.predType,
            pred_src: p.predSrc,
            pred_id: p.predID,
          })),
        };
        const markdown =
          predictions.length === 0
            ? `# Destination search: "${input.query}"\n\nNo matches.`
            : [
                `# Destination search: "${input.query}"`,
                "",
                ...predictions.map(
                  (p, i) =>
                    `${i + 1}. ${p.text1}` +
                    `${p.text2 ? ` — ${p.text2}` : ""}` +
                    ` [${PRED_TYPE_LABEL[p.predType] ?? p.predType}]`,
                ),
              ].join("\n");
        return {
          content: [
            { type: "text", text: render(input.response_format, markdown, structured) },
          ],
        };
      } catch (error) {
        logger.error(
          "goshipages_search_places failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [
            { type: "text", text: describeApiError(error, "Destination search failed") },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "goshipages_search_listings",
    {
      title: "Search Goshipages stays",
      description:
        "Search stays on goshipages.com around a destination — pass either a " +
        "place/area name in `query` (resolved automatically via autocomplete) " +
        "or a `destn_id`. Rates are in KRW. The platform only filters by " +
        "destination, so gender, monthly-rate, and quarantine filters are " +
        "applied client-side over the results. Returns summaries (name, monthly/" +
        "nightly rate, location, slug, URL). Read-only.",
      inputSchema: SearchListingsSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: SearchListingsInput) => {
      if (!input.query && !input.destn_id) {
        return {
          content: [
            { type: "text", text: "Provide either `query` (a place name) or `destn_id`." },
          ],
          isError: true,
        };
      }
      try {
        let destnID = input.destn_id;
        let resolvedFrom: string | undefined;
        if (!destnID) {
          const predictions = await client.predictDestinations(input.query as string);
          // Prefer a non-listing prediction (subway/region/area) as a search anchor.
          const best =
            predictions.find((p) => p.predType !== "listing") ?? predictions[0];
          if (!best) {
            return {
              content: [
                {
                  type: "text",
                  text: `No destination matched "${input.query}". Try goshipages_search_places to refine.`,
                },
              ],
              isError: true,
            };
          }
          destnID = await client.resolveDestination(
            best.predSrc,
            best.predID,
            input.query as string,
          );
          resolvedFrom = best.text1;
        }

        const result = await client.searchListings(destnID);
        let listings = result.listings;

        // Client-side filtering (the server filters only by destination). Note:
        // the search summary carries no gender field — that lives only in the
        // detail page — so the gender filter can't be applied here (see note in
        // the markdown header); we filter on rate and quarantine only.
        const minK = input.min_monthly_krw;
        const maxK = input.max_monthly_krw;
        if (minK !== undefined) {
          listings = listings.filter((l) => {
            const max = toKrw(l.monthlyRate?.max);
            return max === undefined || max >= minK;
          });
        }
        if (maxK !== undefined) {
          listings = listings.filter((l) => {
            const min = toKrw(l.monthlyRate?.min);
            return min === undefined || min <= maxK;
          });
        }
        if (input.quarantine_ok) {
          listings = listings.filter((l) => l.quarOK === true);
        }

        const totalMatched = listings.length;
        listings = listings.slice(0, input.limit);

        const bounds = result.destn?.Bounds;
        const structured = {
          destination: result.destn?.Name ?? resolvedFrom,
          destn_id: destnID,
          viewport: bounds
            ? { sw: bounds.SW, ne: bounds.NE }
            : undefined,
          matched: totalMatched,
          shown: listings.length,
          results: listings.map(summariseListing),
        };

        const header = [
          `# Goshipages stays${result.destn?.Name ? ` near ${result.destn.Name}` : ""}`,
          "",
        ];
        if (input.gender && input.gender !== "any") {
          header.push(
            "_Note: listing-level gender policy is only available in " +
              "goshipages_listing_detail, so the gender filter is not applied " +
              "to this summary list._",
            "",
          );
        }
        const markdown =
          listings.length === 0
            ? [...header, "No stays matched the filters."].join("\n")
            : [
                ...header,
                `Showing ${listings.length} of ${totalMatched} matching stay(s). Rates in KRW.`,
                "",
                ...listings.map((l, i) => listingMarkdown(l, i + 1)),
              ].join("\n");
        return {
          content: [
            { type: "text", text: render(input.response_format, markdown, structured) },
          ],
        };
      } catch (error) {
        logger.error(
          "goshipages_search_listings failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [
            { type: "text", text: describeApiError(error, "Stay search failed") },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "goshipages_listing_detail",
    {
      title: "Get a Goshipages stay's detail",
      description:
        "Fetch the full detail of one goshipages.com stay by its slug (from a " +
        "search result, the path in a goshipages.com/<slug> URL). Returns " +
        "address, decoded gender policy, phones, languages spoken/written, " +
        "amenities, gallery images, and per-room-type info (size in m², beds, " +
        "private bath/shower, monthly/nightly rate in KRW, shared, gender). " +
        "Read-only.",
      inputSchema: ListingDetailSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: ListingDetailInput) => {
      try {
        const detail = await client.getListingDetail(input.slug);
        if (!detail) {
          return {
            content: [
              {
                type: "text",
                text: `No stay detail could be read for slug "${input.slug}".`,
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            { type: "text", text: detailText(detail, input.response_format) },
          ],
        };
      } catch (error) {
        logger.error(
          "goshipages_listing_detail failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [
            { type: "text", text: describeApiError(error, "Stay detail failed") },
          ],
          isError: true,
        };
      }
    },
  );

  logger.info("Registered goshipages tools (search_places, search_listings, listing_detail).");
}

/** m² (1 decimal) from a dm² value, or undefined. */
function toM2(sizeDm2: number | null): number | undefined {
  return sizeDm2 === null || sizeDm2 === undefined
    ? undefined
    : Math.round(sizeDm2) / 100;
}

function summariseRoomType(r: GoshipagesRoomType): Record<string, unknown> {
  return {
    name: r.name,
    description: r.description ?? undefined,
    size_m2: toM2(r.sizeDm2),
    beds: r.numBeds ?? undefined,
    max_guests: r.maxGuests ?? undefined,
    shared: r.isShared,
    gender:
      r.gender !== null && r.gender !== undefined
        ? (ROOM_GENDER_LABEL[r.gender] ?? r.gender)
        : undefined,
    window: r.window ?? undefined,
    private_toilet: r.hasPrivateToilet ?? undefined,
    private_shower: r.hasPrivateShower ?? undefined,
    monthly_rate: r.monthlyStayOK ? toKrw(r.monthlyRate?.amt) : undefined,
    nightly_rate: r.nightlyStayOK ? toKrw(r.nightlyRate?.amt) : undefined,
    facilities: r.facilities
      ? Object.entries(r.facilities)
          .filter(([, on]) => on)
          .map(([k]) => k)
      : undefined,
  };
}

function detailText(
  d: GoshipagesListingDetail,
  format: ListingDetailInput["response_format"],
): string {
  const amenities = listAmenities(d.options);
  const structured = {
    name: d.name,
    slug: d.slug,
    address: d.address ?? undefined,
    latitude: d.location?.lat,
    longitude: d.location?.lon,
    gender:
      d.gender !== null && d.gender !== undefined
        ? (LISTING_GENDER_LABEL[d.gender] ?? d.gender)
        : undefined,
    quarantine_ok: d.quarOK ?? undefined,
    phones: [d.landPhone, d.mobilePhone].filter(Boolean) as string[],
    languages_spoken: d.langsSpoken ?? undefined,
    languages_written: d.langsWritten ?? undefined,
    description: d.descr ?? undefined,
    amenities: amenities.length ? amenities : undefined,
    room_types: (d.roomTypes ?? []).map(summariseRoomType),
    gallery: d.gallery ?? undefined,
    url: listingUrl(d.slug),
  };

  const lines = [`# ${d.name}`, ""];
  if (d.address) lines.push(`- Address: ${d.address}`);
  if (d.location) lines.push(`- Location: ${d.location.lat}, ${d.location.lon}`);
  if (structured.gender) lines.push(`- Gender: ${structured.gender as string}`);
  if (d.quarOK) lines.push("- Quarantine-friendly");
  if (structured.phones.length) lines.push(`- Phone: ${structured.phones.join(" / ")}`);
  if (d.langsSpoken?.length) lines.push(`- Languages spoken: ${d.langsSpoken.join(", ")}`);
  if (d.langsWritten?.length) lines.push(`- Languages written: ${d.langsWritten.join(", ")}`);
  if (amenities.length) lines.push(`- Amenities: ${amenities.join(", ")}`);
  if (d.descr) lines.push("", d.descr);

  if (d.roomTypes?.length) {
    lines.push("", "## Room types");
    for (const r of d.roomTypes) {
      const parts: string[] = [`### ${r.name}`];
      const m2 = toM2(r.sizeDm2);
      const meta: string[] = [];
      if (m2 !== undefined) meta.push(`${m2} m²`);
      if (r.numBeds) meta.push(`${r.numBeds} bed(s)`);
      if (r.isShared) meta.push("shared");
      if (r.gender !== null && r.gender !== undefined) {
        meta.push(ROOM_GENDER_LABEL[r.gender] ?? String(r.gender));
      }
      if (meta.length) parts.push(`- ${meta.join(" · ")}`);
      const monthly = r.monthlyStayOK ? toKrw(r.monthlyRate?.amt) : undefined;
      const nightly = r.nightlyStayOK ? toKrw(r.nightlyRate?.amt) : undefined;
      if (monthly !== undefined) parts.push(`- Monthly: ₩${monthly.toLocaleString()}`);
      if (nightly !== undefined) parts.push(`- Nightly: ₩${nightly.toLocaleString()}`);
      const bath: string[] = [];
      if (r.hasPrivateToilet) bath.push("private toilet");
      if (r.hasPrivateShower) bath.push("private shower");
      if (bath.length) parts.push(`- Bathroom: ${bath.join(", ")}`);
      lines.push(parts.join("\n"));
    }
  }

  if (d.gallery?.length) {
    lines.push("", `## Gallery (${d.gallery.length})`, ...d.gallery.map((u) => `- ${u}`));
  }
  lines.push("", listingUrl(d.slug));
  return render(format, lines.join("\n"), structured);
}

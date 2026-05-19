import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ToolContext } from "../context.js";
import type { OdsayError, OdsayPath, OdsaySubPath } from "../types.js";
import { FindTransitRouteSchema } from "../schemas.js";
import { geocodePlace } from "../services/geocode.js";
import { describeApiError } from "../services/errors.js";
import { formatDistance, formatDuration, render } from "../services/format.js";
import { logger } from "../logger.js";

type Input = z.infer<typeof FindTransitRouteSchema>;

/** Describes a single leg of a transit path as a human-readable line. */
function describeLeg(leg: OdsaySubPath): string | null {
  const lane = leg.lane?.[0] ?? {};
  const from = leg.startName ?? "?";
  const to = leg.endName ?? "?";
  const mins = leg.sectionTime ?? 0;
  switch (leg.trafficType) {
    case 3: // walk
      if (mins <= 0) return null;
      return `🚶 도보 ${mins}분${
        typeof leg.distance === "number" ? ` (${formatDistance(leg.distance)})` : ""
      }`;
    case 1: // subway
      return `🚇 ${lane.name ?? "지하철"}: ${from} → ${to} (${leg.stationCount ?? "?"}개 역, ${mins}분)`;
    case 2: // bus
      return `🚌 ${lane.busNo ?? "버스"}: ${from} → ${to} (${leg.stationCount ?? "?"}개 정류장, ${mins}분)`;
    case 4: // intercity train
      return `🚆 ${lane.name ?? "기차"}: ${from} → ${to} (${mins}분)`;
    default:
      return `➡️ ${from} → ${to} (${mins}분)`;
  }
}

function extractOdsayError(error: OdsayError[] | OdsayError): string {
  const e = Array.isArray(error) ? error[0] : error;
  const code = e?.code ?? "";
  const message = e?.message ?? e?.msg ?? "unknown error";
  return `(${code}) ${message}`;
}

interface RouteOption {
  total_time_min: number;
  fare_won?: number;
  total_walk_m?: number;
  transfers: number;
  legs: string[];
}

/** Reduces an ODsay path to a flat, sortable route option. */
function toRouteOption(path: OdsayPath): RouteOption {
  const info = path.info ?? {};
  const busCount = info.busTransitCount ?? 0;
  const subwayCount = info.subwayTransitCount ?? 0;
  return {
    total_time_min: info.totalTime ?? Number.MAX_SAFE_INTEGER,
    fare_won: info.payment ?? info.totalPayment,
    total_walk_m: info.totalWalk,
    transfers: Math.max(0, busCount + subwayCount - 1),
    legs: (path.subPath ?? [])
      .map(describeLeg)
      .filter((line): line is string => line !== null),
  };
}

/** Registers the odsay_find_transit_route tool. */
export function registerFindTransitRoute(
  server: McpServer,
  ctx: ToolContext,
): void {
  server.registerTool(
    "odsay_find_transit_route",
    {
      title: "Find the fastest public-transit routes",
      description:
        "Find public-transit routes (bus, subway, intercity train) between " +
        "two place names using the ODsay API. Read-only.\n\n" +
        "Returns up to 'max_results' route options sorted fastest-first, each " +
        "with total duration, fare, transfers, total walking distance, and a " +
        "step-by-step leg breakdown. The option with the fewest transfers is " +
        "flagged. Requires an ODsay API key; without one the tool returns an " +
        "explanatory error.",
      inputSchema: FindTransitRouteSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: Input) => {
      if (!ctx.odsay) {
        return {
          content: [
            {
              type: "text",
              text:
                "Public-transit routing is unavailable: no ODsay API key is " +
                "configured. Set the ODSAY_API_KEY environment variable or " +
                "pass --odsay-api-key.",
            },
          ],
          isError: true,
        };
      }

      try {
        // geocodePlace is cached, so re-routing the same origin costs no
        // extra API calls.
        const [origin, destination] = await Promise.all([
          geocodePlace(ctx.kakao, input.origin),
          geocodePlace(ctx.kakao, input.destination),
        ]);
        if (!origin?.x || !origin?.y) {
          return {
            content: [
              { type: "text", text: `Origin "${input.origin}" was not found.` },
            ],
            isError: true,
          };
        }
        if (!destination?.x || !destination?.y) {
          return {
            content: [
              {
                type: "text",
                text: `Destination "${input.destination}" was not found.`,
              },
            ],
            isError: true,
          };
        }

        const data = await ctx.odsay.searchTransitPath(
          Number(origin.x),
          Number(origin.y),
          Number(destination.x),
          Number(destination.y),
        );

        if (data.error) {
          return {
            content: [
              {
                type: "text",
                text: `Transit search failed: ${extractOdsayError(data.error)}.`,
              },
            ],
            isError: true,
          };
        }

        const paths = data.result?.path ?? [];
        if (paths.length === 0) {
          return {
            content: [
              {
                type: "text",
                text:
                  `No public-transit route found from "${input.origin}" to ` +
                  `"${input.destination}". The points may be too close or in ` +
                  "an area without transit data.",
              },
            ],
          };
        }

        // Rank every path by total time, fastest first, then keep the top N.
        const options = paths
          .map(toRouteOption)
          .sort((a, b) => a.total_time_min - b.total_time_min)
          .slice(0, input.max_results);

        // Index of the shown option with the fewest transfers.
        let fewestTransfersIdx = 0;
        for (let i = 1; i < options.length; i += 1) {
          if (options[i].transfers < options[fewestTransfersIdx].transfers) {
            fewestTransfersIdx = i;
          }
        }

        const structured = {
          origin: origin.place_name,
          destination: destination.place_name,
          option_count: options.length,
          fastest: options[0],
          options: options.map((o, i) => ({
            ...o,
            fewest_transfers: i === fewestTransfersIdx,
          })),
        };

        const markdown = [
          `# Transit routes: ${origin.place_name} -> ${destination.place_name}`,
          "",
          `${options.length} option(s), fastest first.`,
          "",
          ...options.map((o, i) => {
            const tags = [i === 0 ? "fastest" : ""]
              .concat(i === fewestTransfersIdx ? "fewest transfers" : "")
              .filter((t) => t !== "");
            const header = `## Option ${i + 1}${
              tags.length ? ` (${tags.join(", ")})` : ""
            }`;
            const lines = [
              header,
              `- Total time: ${formatDuration(o.total_time_min * 60)}`,
            ];
            if (typeof o.fare_won === "number") {
              lines.push(`- Fare: ${o.fare_won.toLocaleString()}원`);
            }
            if (typeof o.total_walk_m === "number") {
              lines.push(`- Total walk: ${formatDistance(o.total_walk_m)}`);
            }
            lines.push(`- Transfers: ${o.transfers}`);
            lines.push("- Legs:");
            lines.push(...o.legs.map((leg) => `  - ${leg}`));
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
          "odsay_find_transit_route failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [
            {
              type: "text",
              text: describeApiError(error, "Transit route search failed"),
            },
          ],
          isError: true,
        };
      }
    },
  );
}

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

function buildStructured(
  origin: string,
  destination: string,
  path: OdsayPath,
): Record<string, unknown> {
  const info = path.info ?? {};
  const busCount = info.busTransitCount ?? 0;
  const subwayCount = info.subwayTransitCount ?? 0;
  return {
    origin,
    destination,
    total_time_min: info.totalTime,
    fare_won: info.payment ?? info.totalPayment,
    total_walk_m: info.totalWalk,
    transfers: Math.max(0, busCount + subwayCount - 1),
    legs: (path.subPath ?? [])
      .map((leg) => describeLeg(leg))
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
      title: "Find a public-transit route",
      description:
        "Find a public-transit route (bus, subway, intercity train) between " +
        "two place names using the ODsay API. Read-only.\n\n" +
        "Returns total duration, fare, number of transfers, total walking " +
        "distance, and a step-by-step leg breakdown. Requires an ODsay API " +
        "key to be configured; without one the tool returns an explanatory " +
        "error.",
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

        const path = data.result?.path?.[0];
        if (!path) {
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

        const structured = buildStructured(
          origin.place_name,
          destination.place_name,
          path,
        );
        const markdown = [
          `# Transit route: ${origin.place_name} -> ${destination.place_name}`,
          "",
          typeof structured.total_time_min === "number"
            ? `- Total time: ${formatDuration((structured.total_time_min as number) * 60)}`
            : "",
          typeof structured.fare_won === "number"
            ? `- Fare: ${(structured.fare_won as number).toLocaleString()}원`
            : "",
          typeof structured.total_walk_m === "number"
            ? `- Total walk: ${formatDistance(structured.total_walk_m as number)}`
            : "",
          `- Transfers: ${structured.transfers}`,
          "",
          "## Legs",
          ...(structured.legs as string[]).map((leg) => `- ${leg}`),
        ]
          .filter((line) => line !== "")
          .join("\n");

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

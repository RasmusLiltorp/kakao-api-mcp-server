import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import type { ToolContext } from "../context.js";
import type { KakaoPlace, MobilityRoute } from "../types.js";
import { FindRouteSchema } from "../schemas.js";
import { geocodePlace } from "../services/geocode.js";
import { describeApiError } from "../services/errors.js";
import { formatDistance, formatDuration, render } from "../services/format.js";
import { logger } from "../logger.js";

type Input = z.infer<typeof FindRouteSchema>;

const MODE_NAMES: Record<Input["transportation_type"], string> = {
  car: "자동차",
  public: "대중교통",
  walk: "도보",
};

function coord(place: KakaoPlace): string {
  return `${place.x},${place.y}`;
}

function mapUrl(origin: KakaoPlace, destination: KakaoPlace): string {
  const s = encodeURIComponent(origin.place_name);
  const e = encodeURIComponent(destination.place_name);
  return `https://map.kakao.com/?sName=${s}&eName=${e}`;
}

interface CarRouteSummary {
  distance_m?: number;
  duration_s?: number;
  taxi_fare?: number;
  toll_fare?: number;
  traffic?: { smooth: number; slow: number; heavy: number; congested: number };
}

/** Reduces a raw Kakao Mobility route into a flat summary. */
function summariseCarRoute(
  route: MobilityRoute,
  includeTraffic: boolean,
): CarRouteSummary {
  const summary = route.summary ?? {};
  const result: CarRouteSummary = {
    distance_m: summary.distance,
    duration_s: summary.duration,
    taxi_fare: summary.fare?.taxi,
    toll_fare: summary.fare?.toll,
  };

  if (includeTraffic && Array.isArray(route.sections)) {
    let total = 0;
    let congested = 0;
    let heavy = 0;
    let slow = 0;
    for (const section of route.sections) {
      for (const road of section.roads ?? []) {
        if (
          typeof road.distance !== "number" ||
          typeof road.traffic_state !== "number"
        ) {
          continue;
        }
        total += road.distance;
        if (road.traffic_state === 4) congested += road.distance;
        else if (road.traffic_state === 3) heavy += road.distance;
        else if (road.traffic_state === 2) slow += road.distance;
      }
    }
    if (total > 0) {
      const pct = (n: number): number => Math.round((n / total) * 100);
      const c = pct(congested);
      const h = pct(heavy);
      const s = pct(slow);
      result.traffic = { congested: c, heavy: h, slow: s, smooth: 100 - c - h - s };
    }
  }
  return result;
}

/** Registers the kakao_find_route tool. */
export function registerFindRoute(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "kakao_find_route",
    {
      title: "Find a driving route",
      description:
        "Find a car route between two place names using the Kakao Mobility " +
        "API. Read-only.\n\n" +
        "Only the 'car' travel mode returns a computed route (distance, " +
        "duration, estimated taxi fare, tolls, and an optional live-traffic " +
        "summary). The 'public' and 'walk' modes are not computed here: for " +
        "public transit use the odsay_find_transit_route tool instead.",
      inputSchema: FindRouteSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input: Input) => {
      try {
        const [origin, destination] = await Promise.all([
          geocodePlace(ctx.kakao, input.origin),
          geocodePlace(ctx.kakao, input.destination),
        ]);
        if (!origin) {
          return {
            content: [
              { type: "text", text: `Origin "${input.origin}" was not found.` },
            ],
            isError: true,
          };
        }
        if (!destination) {
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

        // Non-car modes: be honest rather than returning a fake result.
        if (input.transportation_type !== "car") {
          const note =
            input.transportation_type === "public"
              ? "kakao_find_route computes car routes only. For public-transit " +
                "directions (duration, transfers, fare) use the " +
                "odsay_find_transit_route tool."
              : "kakao_find_route computes car routes only. Walking-route " +
                "calculation is not supported.";
          const structured = {
            origin: origin.place_name,
            destination: destination.place_name,
            transportation_type: input.transportation_type,
            computed: false,
            note,
            map_url: mapUrl(origin, destination),
          };
          const markdown = [
            `# Route: ${origin.place_name} -> ${destination.place_name}`,
            "",
            `Travel mode: ${MODE_NAMES[input.transportation_type]}`,
            "",
            note,
            "",
            `Kakao Map: ${structured.map_url}`,
          ].join("\n");
          return {
            content: [
              {
                type: "text",
                text: render(input.response_format, markdown, structured),
              },
            ],
          };
        }

        // Car mode: geocode any waypoints first.
        let waypointParam: string | undefined;
        if (input.waypoints && input.waypoints.length > 0) {
          const resolved = await Promise.all(
            input.waypoints.map(async (name) => ({
              name,
              place: await geocodePlace(ctx.kakao, name),
            })),
          );
          const missing = resolved.filter((w) => !w.place).map((w) => w.name);
          if (missing.length > 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `These waypoints were not found: ${missing.join(", ")}.`,
                },
              ],
              isError: true,
            };
          }
          waypointParam = resolved
            .map((w) => coord(w.place as KakaoPlace))
            .join("|");
        }

        const response = await ctx.kakao.directions({
          origin: coord(origin),
          destination: coord(destination),
          waypoints: waypointParam,
          priority: input.priority,
          trafficInfo: input.traffic_info,
        });
        const route = response.routes?.[0];
        if (!route || route.result_code !== 0) {
          const reason = route?.result_msg ?? "no route returned";
          return {
            content: [
              {
                type: "text",
                text:
                  `Could not compute a car route from "${input.origin}" to ` +
                  `"${input.destination}" (${reason}). ` +
                  `Kakao Map: ${mapUrl(origin, destination)}`,
              },
            ],
          };
        }

        const summary = summariseCarRoute(route, input.traffic_info);
        const structured = {
          origin: origin.place_name,
          destination: destination.place_name,
          transportation_type: "car" as const,
          computed: true,
          ...summary,
          map_url: mapUrl(origin, destination),
        };

        const lines = [
          `# Route: ${origin.place_name} -> ${destination.place_name}`,
          "",
          "Travel mode: 자동차",
        ];
        if (typeof summary.distance_m === "number") {
          lines.push(`- Distance: ${formatDistance(summary.distance_m)}`);
        }
        if (typeof summary.duration_s === "number") {
          lines.push(`- Duration: ${formatDuration(summary.duration_s)}`);
        }
        if (typeof summary.taxi_fare === "number") {
          lines.push(`- Estimated taxi fare: ${summary.taxi_fare.toLocaleString()}원`);
        }
        if (typeof summary.toll_fare === "number" && summary.toll_fare > 0) {
          lines.push(`- Tolls: ${summary.toll_fare.toLocaleString()}원`);
        }
        if (summary.traffic) {
          lines.push(
            "",
            "## Traffic",
            `- 원활: ${summary.traffic.smooth}%`,
            `- 서행: ${summary.traffic.slow}%`,
            `- 지체: ${summary.traffic.heavy}%`,
            `- 정체: ${summary.traffic.congested}%`,
          );
        }
        lines.push("", `Kakao Map: ${structured.map_url}`);

        return {
          content: [
            {
              type: "text",
              text: render(input.response_format, lines.join("\n"), structured),
            },
          ],
        };
      } catch (error) {
        logger.error(
          "kakao_find_route failed:",
          error instanceof Error ? error.message : String(error),
        );
        return {
          content: [
            { type: "text", text: describeApiError(error, "Route search failed") },
          ],
          isError: true,
        };
      }
    },
  );
}

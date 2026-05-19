import { z } from "zod";

/** Output format shared by every tool. */
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json",
}

const responseFormat = z
  .nativeEnum(ResponseFormat)
  .default(ResponseFormat.MARKDOWN)
  .describe(
    "Output format: 'markdown' for human-readable text or 'json' for structured data",
  );

export const SearchPlacesSchema = z
  .object({
    keyword: z
      .string()
      .min(1)
      .max(200)
      .describe('Search keyword, e.g. "강남역 맛집"'),
    x: z.number().optional().describe("Longitude (WGS84) of the search center"),
    y: z.number().optional().describe("Latitude (WGS84) of the search center"),
    radius: z
      .number()
      .int()
      .min(0)
      .max(20000)
      .optional()
      .describe("Search radius in meters from the center coordinate (0-20000)"),
    response_format: responseFormat,
  })
  .strict();

export const CoordToAddressSchema = z
  .object({
    x: z.number().describe("Longitude (WGS84)"),
    y: z.number().describe("Latitude (WGS84)"),
    response_format: responseFormat,
  })
  .strict();

export const FindRouteSchema = z
  .object({
    origin: z.string().min(1).describe('Origin place name, e.g. "강남역"'),
    destination: z
      .string()
      .min(1)
      .describe('Destination place name, e.g. "코엑스"'),
    waypoints: z
      .array(z.string())
      .max(5)
      .optional()
      .describe("Optional waypoint place names, in order (max 5)"),
    transportation_type: z
      .enum(["car", "public", "walk"])
      .default("car")
      .describe(
        "Travel mode. Only 'car' returns a computed route. For public transit " +
          "use the odsay_find_transit_route tool instead.",
      ),
    priority: z
      .enum(["RECOMMEND", "TIME", "DISTANCE"])
      .default("RECOMMEND")
      .describe("Route preference for car routing"),
    traffic_info: z
      .boolean()
      .default(true)
      .describe("Include a live traffic summary for car routes"),
    response_format: responseFormat,
  })
  .strict();

export const FindTransitRouteSchema = z
  .object({
    origin: z
      .string()
      .min(1)
      .describe('Origin place name, e.g. "중앙대학교"'),
    destination: z
      .string()
      .min(1)
      .describe('Destination place name, e.g. "세종특별자치시청"'),
    response_format: responseFormat,
  })
  .strict();

export const DaumSearchSchema = z
  .object({
    query: z.string().min(1).max(200).describe("Search query"),
    sort: z
      .enum(["accuracy", "recency"])
      .optional()
      .describe("Result ordering: 'accuracy' (relevance) or 'recency' (newest)"),
    page: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(1)
      .describe("Result page number (1-50)"),
    size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Results per page (1-50)"),
    response_format: responseFormat,
  })
  .strict();

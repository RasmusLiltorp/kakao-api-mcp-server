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
    page: z
      .number()
      .int()
      .min(1)
      .max(45)
      .default(1)
      .describe("Result page number (1-45)"),
    size: z
      .number()
      .int()
      .min(1)
      .max(15)
      .default(15)
      .describe("Results per page (1-15)"),
    response_format: responseFormat,
  })
  .strict();

/** Kakao place category group codes accepted by kakao_search_by_category. */
export const CATEGORY_GROUP_CODES = [
  "MT1", // large supermarket
  "CS2", // convenience store
  "PK6", // parking lot
  "OL7", // gas station
  "SW8", // subway station
  "BK9", // bank
  "CT1", // culture facility
  "AG2", // real-estate agency
  "PO3", // public institution
  "AT4", // tourist attraction
  "AD5", // accommodation
  "FD6", // restaurant
  "CE7", // cafe
  "HP8", // hospital
  "PM9", // pharmacy
  "SC4", // school
  "AC5", // academy
] as const;

export const SearchByCategorySchema = z
  .object({
    category_group_code: z
      .enum(CATEGORY_GROUP_CODES)
      .describe(
        "Kakao category group code: MT1 supermarket, CS2 convenience store, " +
          "PK6 parking, OL7 gas station, SW8 subway station, BK9 bank, " +
          "CT1 culture, AG2 real-estate agency, PO3 public institution, " +
          "AT4 tourist attraction, AD5 accommodation, FD6 restaurant, " +
          "CE7 cafe, HP8 hospital, PM9 pharmacy, SC4 school, AC5 academy",
      ),
    x: z.number().describe("Longitude (WGS84) of the search center"),
    y: z.number().describe("Latitude (WGS84) of the search center"),
    radius: z
      .number()
      .int()
      .min(0)
      .max(20000)
      .default(1000)
      .describe("Search radius in meters from the center (0-20000)"),
    page: z
      .number()
      .int()
      .min(1)
      .max(45)
      .default(1)
      .describe("Result page number (1-45)"),
    response_format: responseFormat,
  })
  .strict();

export const SearchAddressSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(200)
      .describe('Address to look up, e.g. "서울 동작구 흑석로 84"'),
    page: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(1)
      .describe("Result page number (1-30)"),
    response_format: responseFormat,
  })
  .strict();

export const CoordToRegionSchema = z
  .object({
    x: z.number().describe("Longitude (WGS84)"),
    y: z.number().describe("Latitude (WGS84)"),
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
    max_results: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(3)
      .describe("Number of route options to return, fastest first (1-5)"),
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

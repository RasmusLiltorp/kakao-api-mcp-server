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

/** gobang.kr listing categories. */
export const GOBANG_HOUSE_TYPES = [
  "GOSIWON",
  "ONE_ROOM_TEL",
  "ONE_TWO_ROOM",
  "SHARE_HOUSE",
  "CO_LIVING",
  "OFFICETEL",
] as const;

const houseTypes = z
  .array(z.enum(GOBANG_HOUSE_TYPES))
  .optional()
  .describe(
    "Listing categories to include: GOSIWON 고시원, ONE_ROOM_TEL 원룸텔, " +
      "ONE_TWO_ROOM 원룸/투룸, SHARE_HOUSE 쉐어하우스, CO_LIVING 코리빙, " +
      "OFFICETEL 오피스텔. Omit for all types.",
  );

const gender = z
  .enum(["ALL", "MALE", "FEMALE"])
  .optional()
  .describe("Restrict by allowed gender: MALE (남성전용), FEMALE (여성전용), or ALL");

/** Filters shared by gobang search and count. */
const gobangFilterShape = {
  sido_code: z
    .string()
    .optional()
    .describe('Region: top-level 시/도 code from gobang_regions, e.g. "11" (서울)'),
  dongli_code: z
    .string()
    .optional()
    .describe('Region: 읍/면/동 (dongli) code, e.g. "1168010800" (논현동)'),
  sw_lat: z.number().optional().describe("Bounding box: south-west latitude"),
  ne_lat: z.number().optional().describe("Bounding box: north-east latitude"),
  sw_lng: z.number().optional().describe("Bounding box: south-west longitude"),
  ne_lng: z.number().optional().describe("Bounding box: north-east longitude"),
  house_types: houseTypes,
  gender,
  min_price: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Minimum monthly rent in 만원 (10,000 KRW)"),
  max_price: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Maximum monthly rent in 만원 (10,000 KRW)"),
  min_deposit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Minimum deposit in 만원 (10,000 KRW)"),
  max_deposit: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Maximum deposit in 만원 (10,000 KRW)"),
  min_age: z.number().int().optional().describe("Minimum tenant age allowed"),
  max_age: z.number().int().optional().describe("Maximum tenant age allowed"),
  keyword: z
    .string()
    .optional()
    .describe("Free-text keyword to match within the region"),
};

/** True if a location filter (region or full bounding box) is present. */
export function gobangHasLocation(v: {
  sido_code?: string;
  dongli_code?: string;
  sw_lat?: number;
  ne_lat?: number;
  sw_lng?: number;
  ne_lng?: number;
}): boolean {
  const box =
    v.sw_lat !== undefined &&
    v.ne_lat !== undefined &&
    v.sw_lng !== undefined &&
    v.ne_lng !== undefined;
  return Boolean(v.sido_code) || Boolean(v.dongli_code) || box;
}

export const GOBANG_LOCATION_REQUIRED =
  "Provide a location: sido_code, dongli_code, or all four bounding-box " +
  "coordinates (sw_lat, ne_lat, sw_lng, ne_lng).";

export const GobangSearchSchema = z
  .object({
    ...gobangFilterShape,
    page: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Result page number (1-based)"),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(15)
      .describe("Results per page (1-50)"),
    response_format: responseFormat,
  })
  .strict();

export const GobangCountSchema = z
  .object({
    ...gobangFilterShape,
    response_format: responseFormat,
  })
  .strict();

export const GobangDetailSchema = z
  .object({
    house_no: z
      .number()
      .int()
      .positive()
      .describe("Listing number, e.g. 8122 (the id in a gobang.kr/place/<no> URL)"),
    response_format: responseFormat,
  })
  .strict();

export const GobangNearbySchema = z
  .object({
    latitude: z.number().describe("Centre latitude (WGS84)"),
    longitude: z.number().describe("Centre longitude (WGS84)"),
    band: z
      .enum(["0-500", "500-1000"])
      .default("0-500")
      .describe("Distance band from the centre, in metres"),
    house_types: houseTypes,
    gender,
    min_price: z.number().int().min(0).optional().describe("Min monthly rent in 만원"),
    max_price: z.number().int().min(0).optional().describe("Max monthly rent in 만원"),
    min_deposit: z.number().int().min(0).optional().describe("Min deposit in 만원"),
    max_deposit: z.number().int().min(0).optional().describe("Max deposit in 만원"),
    page: z.number().int().min(1).default(1).describe("Result page number (1-based)"),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(15)
      .describe("Results per page (1-50)"),
    response_format: responseFormat,
  })
  .strict();

export const GobangSearchPlacesSchema = z
  .object({
    keyword: z
      .string()
      .min(1)
      .max(100)
      .describe('Place, subway, or region name, e.g. "사당역" or "강남구"'),
    response_format: responseFormat,
  })
  .strict();

export const GobangRegionsSchema = z
  .object({ response_format: responseFormat })
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

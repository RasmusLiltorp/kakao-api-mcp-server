import type { AxiosInstance } from "axios";
import { CACHE_TTL } from "../constants.js";
import { createHttpClient } from "./http.js";
import { TtlCache } from "./cache.js";

/** Base URL for the Goshipages site and its anonymous read API. */
const GOSHIPAGES_BASE_URL = "https://goshipages.com";

/** Browser-like UA; some edge/CDN layers reject empty or non-browser agents. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Standard envelope returned by every Goshipages read endpoint. */
interface Envelope<T> {
  ok: boolean;
  data: T;
}

/** One autocomplete prediction from /api/Destn/Predict/List. */
export interface GoshipagesPrediction {
  predSrc: string;
  predID: string;
  predType: "subway" | "listing" | "region" | "area" | string;
  text1: string;
  text2: string | null;
  locale: string | null;
}

/** A min/max rate pair, in thousands of KRW (e.g. 310 = ₩310,000). */
export interface GoshipagesRateRange {
  min: number | null;
  max: number | null;
}

/** A listing summary from /api/Listing/Search. */
export interface GoshipagesListingSummary {
  innID: string;
  name: string;
  slug: string;
  quarOK: boolean | null;
  imageURL: string | null;
  imageCount: number | null;
  /** [lat, lon] */
  latlon: [number, number] | null;
  /** Rates in thousands of KRW. */
  monthlyRate: GoshipagesRateRange | null;
  nightlyRate: GoshipagesRateRange | null;
}

/** Destination metadata returned alongside the listings. */
export interface GoshipagesDestn {
  Name: string;
  Addr: string | null;
  Bounds: { SW: [number, number]; NE: [number, number] } | null;
  Markers: { Name: string; LatLon: [number, number] }[] | null;
}

export interface GoshipagesSearchResult {
  listings: GoshipagesListingSummary[];
  destn: GoshipagesDestn | null;
}

/** A single rate amount from a listing-detail room type. */
export interface GoshipagesRate {
  /** Amount in thousands of KRW (e.g. 650 = ₩650,000). */
  amt: number;
  cur: string;
}

/** A room type from the server-rendered listing detail. */
export interface GoshipagesRoomType {
  name: string;
  description: string | null;
  nightlyStayOK: boolean;
  nightlyRate: GoshipagesRate | null;
  monthlyStayOK: boolean;
  monthlyRate: GoshipagesRate | null;
  /** Floor area in dm² (divide by 100 for m²). */
  sizeDm2: number | null;
  numBeds: number | null;
  isShared: boolean;
  maxGuests: number | null;
  /** 0 female&male, 1 male only, 2 female only. */
  gender: number | null;
  window: boolean | null;
  hasPrivateToilet: boolean | null;
  hasPrivateShower: boolean | null;
  facilities: Record<string, boolean> | null;
  gallery: string[] | null;
}

/** Full listing detail scraped from the SSR `LISTING = {…}` assignment. */
export interface GoshipagesListingDetail {
  innID: string;
  name: string;
  slug: string;
  address: string | null;
  location: { lat: number; lon: number } | null;
  quarOK: boolean | null;
  landPhone: string | null;
  mobilePhone: string | null;
  /** 0 share common, 1 separate areas, 2 male only, 3 female only. */
  gender: number | null;
  langsWritten: string[] | null;
  langsSpoken: string[] | null;
  descr: string | null;
  options: Record<string, Record<string, boolean>> | null;
  coverImg: string | null;
  gallery: string[] | null;
  roomTypes: GoshipagesRoomType[] | null;
}

/**
 * Extracts the `LISTING = {…};` object server-rendered into a Goshipages
 * listing page. Brace-balances through the JSON (respecting string literals)
 * so a `}` inside a value or a trailing `;` doesn't truncate it early.
 */
export function parseListingFromPage(
  html: string,
): GoshipagesListingDetail | undefined {
  const match = html.match(/LISTING\s*=\s*/);
  if (!match || match.index === undefined) return undefined;
  const start = match.index + match[0].length;
  if (html[start] !== "{") return undefined;

  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < html.length; i += 1) {
    const c = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return undefined;

  try {
    return JSON.parse(html.slice(start, end)) as GoshipagesListingDetail;
  } catch {
    return undefined;
  }
}

/**
 * Client for the public (anonymous) parts of goshipages.com — a
 * foreigner-facing Korean stays platform (goshiwon / goshitel / livingtel /
 * share-house / guesthouse).
 *
 * The read endpoints are POST + JSON and need no auth (only Content-Type and a
 * browser-like User-Agent). `CachedHttpClient` only caches GETs, so POST goes
 * through the raw axios instance and responses are memoised here in a short
 * TTL cache keyed by path + body, for politeness.
 */
export class GoshipagesClient {
  private readonly client: AxiosInstance;
  private readonly postCache = new TtlCache<unknown>(CACHE_TTL.LISTING);
  private readonly pageCache = new TtlCache<string>(CACHE_TTL.LISTING);

  constructor() {
    this.client = createHttpClient({
      baseURL: GOSHIPAGES_BASE_URL,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
    });
  }

  /** POSTs a JSON body, unwraps the `{ok, data}` envelope, with TTL caching. */
  private async post<T>(path: string, body: unknown, ttlMs: number): Promise<T> {
    const key = `${path}:${JSON.stringify(body)}`;
    const cached = this.postCache.get(key);
    if (cached !== undefined) return cached as T;
    const res = await this.client.post<Envelope<T>>(path, body);
    const data = res.data?.data;
    this.postCache.set(key, data, ttlMs);
    return data;
  }

  /** Autocomplete destinations (subway / listing / region / area). */
  async predictDestinations(query: string): Promise<GoshipagesPrediction[]> {
    const data = await this.post<GoshipagesPrediction[] | null>(
      "/api/Destn/Predict/List",
      { query },
      CACHE_TTL.SEARCH,
    );
    return data ?? [];
  }

  /** Resolves a prediction to a destination id usable with searchListings. */
  async resolveDestination(
    predSrc: string,
    predID: string,
    query: string,
  ): Promise<string> {
    return this.post<string>(
      "/api/Destn/Predict/Query",
      { predSrc, predID, query },
      CACHE_TTL.SEARCH,
    );
  }

  /** Searches listings around a resolved destination id. */
  async searchListings(destnID: string): Promise<GoshipagesSearchResult> {
    const data = await this.post<GoshipagesSearchResult | null>(
      "/api/Listing/Search",
      { destnID },
      CACHE_TTL.LISTING,
    );
    return data ?? { listings: [], destn: null };
  }

  /** Full-size image URLs for a listing. */
  async listingImages(innID: string): Promise<string[]> {
    const data = await this.post<string[] | null>(
      "/api/Listing/Images",
      { innID },
      CACHE_TTL.LISTING,
    );
    return data ?? [];
  }

  /**
   * Full detail for one listing, scraped from the server-rendered
   * goshipages.com/<slug> page (the `LISTING = {…}` inline assignment).
   */
  async getListingDetail(
    slug: string,
  ): Promise<GoshipagesListingDetail | undefined> {
    const cached = this.pageCache.get(slug);
    const html =
      cached ??
      (await this.client.get<string>(`/${slug}`, { responseType: "text" })).data;
    if (!cached) this.pageCache.set(slug, html, CACHE_TTL.LISTING);
    return parseListingFromPage(html);
  }
}

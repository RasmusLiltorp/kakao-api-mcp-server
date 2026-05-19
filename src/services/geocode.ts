import type { KakaoClient } from "./kakao.js";
import type { KakaoPlace } from "../types.js";
import { TtlCache } from "./cache.js";

// Place names resolve to stable coordinates, so results are cached for an hour
// to avoid repeated keyword-search calls (for example when the route and
// transit tools geocode the same origin).
const geocodeCache = new TtlCache<KakaoPlace | null>(60 * 60 * 1000);

/**
 * Resolves a place name to its best-matching Kakao place (with coordinates).
 * Results are cached in-process.
 *
 * @returns The first matching place, or null when nothing matches.
 */
export async function geocodePlace(
  kakao: KakaoClient,
  query: string,
): Promise<KakaoPlace | null> {
  const cached = geocodeCache.get(query);
  if (cached !== undefined) return cached;

  const data = await kakao.searchKeyword({ query });
  const place = data.documents?.[0] ?? null;
  geocodeCache.set(query, place);
  return place;
}

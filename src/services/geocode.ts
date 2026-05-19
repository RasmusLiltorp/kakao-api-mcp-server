import type { KakaoClient } from "./kakao.js";
import type { KakaoPlace } from "../types.js";

/**
 * Resolves a place name to its best-matching Kakao place (with coordinates).
 *
 * @returns The first matching place, or null when nothing matches.
 */
export async function geocodePlace(
  kakao: KakaoClient,
  query: string,
): Promise<KakaoPlace | null> {
  const data = await kakao.searchKeyword({ query });
  return data.documents?.[0] ?? null;
}

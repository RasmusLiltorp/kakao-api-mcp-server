import { CHARACTER_LIMIT } from "../constants.js";
import { ResponseFormat } from "../schemas.js";

/** Formats a distance in meters as a human-readable string. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/** Formats a duration in seconds as a human-readable Korean string. */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
}

/** Strips Daum search highlight tags (<b>...</b>) from a string. */
export function stripHighlightTags(text: string): string {
  return text.replace(/<\/?b>/g, "");
}

/** Truncates a string to CHARACTER_LIMIT, appending a notice when cut. */
export function applyCharacterLimit(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return (
    text.slice(0, CHARACTER_LIMIT) +
    `\n\n[Response truncated at ${CHARACTER_LIMIT} characters. ` +
    `Narrow the query or reduce 'size' to see more.]`
  );
}

/**
 * Renders a result as either pre-built markdown or pretty-printed JSON,
 * depending on the requested response format, then enforces the character
 * limit.
 */
export function render(
  format: ResponseFormat,
  markdown: string,
  structured: unknown,
): string {
  const text =
    format === ResponseFormat.JSON
      ? JSON.stringify(structured, null, 2)
      : markdown;
  return applyCharacterLimit(text);
}

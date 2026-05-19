import axios from "axios";

/**
 * Converts an unknown error from an outbound API call into a clear, actionable
 * message that helps the agent decide what to do next.
 *
 * @param error   The thrown value.
 * @param context Short human-readable description of the failed operation.
 */
export function describeApiError(error: unknown, context: string): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const apiMessage = (
      error.response?.data as { message?: string } | undefined
    )?.message;

    if (status === 401 || status === 403) {
      return `${context}: authentication failed (HTTP ${status}). Verify the API key is valid and the required service is enabled in the developer console.`;
    }
    if (status === 429) {
      return `${context}: rate limit exceeded (HTTP 429). Wait before retrying.`;
    }
    if (status === 404) {
      return `${context}: resource not found (HTTP 404).`;
    }
    if (error.code === "ECONNABORTED") {
      return `${context}: the request timed out. Try again.`;
    }
    if (status) {
      return `${context}: API request failed (HTTP ${status})${
        apiMessage ? ` - ${apiMessage}` : ""
      }.`;
    }
    return `${context}: network error - ${error.message}.`;
  }
  if (error instanceof Error) {
    return `${context}: ${error.message}.`;
  }
  return `${context}: an unknown error occurred.`;
}

import axios, {
  type AxiosInstance,
  type CreateAxiosDefaults,
  type InternalAxiosRequestConfig,
} from "axios";
import { REQUEST_TIMEOUT_MS } from "../constants.js";
import { logger } from "../logger.js";

const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

interface RetryConfig extends InternalAxiosRequestConfig {
  retryCount?: number;
}

/**
 * Creates an axios instance with a default timeout and automatic retry, with
 * exponential backoff, on rate-limit (429) and transient server errors.
 */
export function createHttpClient(
  options: CreateAxiosDefaults = {},
): AxiosInstance {
  const client = axios.create({ timeout: REQUEST_TIMEOUT_MS, ...options });

  client.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      if (!axios.isAxiosError(error) || !error.config) {
        return Promise.reject(error);
      }
      const config = error.config as RetryConfig;
      const status = error.response?.status;
      const retryable =
        (status !== undefined && RETRYABLE_STATUS.has(status)) ||
        error.code === "ECONNABORTED";

      config.retryCount ??= 0;
      if (retryable && config.retryCount < MAX_RETRIES) {
        config.retryCount += 1;
        const delayMs = 500 * 2 ** (config.retryCount - 1);
        logger.info(
          `Retrying request (attempt ${config.retryCount}/${MAX_RETRIES}) after ${delayMs}ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return client(config);
      }
      return Promise.reject(error);
    },
  );

  return client;
}

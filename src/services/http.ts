import axios, {
  type AxiosInstance,
  type CreateAxiosDefaults,
  type InternalAxiosRequestConfig,
} from "axios";
import { REQUEST_TIMEOUT_MS } from "../constants.js";
import { logger } from "../logger.js";
import { TtlCache } from "./cache.js";

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

export interface CachedGetOptions<T> {
  /** Time-to-live for this response in the cache. */
  ttlMs: number;
  /** Optional predicate; the response is cached only when it returns true. */
  cacheIf?: (data: T) => boolean;
}

/**
 * Wraps an axios instance with a GET response cache and in-flight request
 * coalescing. Two effects, both of which cut API calls:
 *  - A repeated GET with identical url + params is served from cache.
 *  - Concurrent identical GETs share a single underlying request.
 */
export class CachedHttpClient {
  private readonly cache = new TtlCache<unknown>(0);
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly client: AxiosInstance) {}

  async get<T>(
    url: string,
    params: Record<string, unknown> | undefined,
    options: CachedGetOptions<T>,
  ): Promise<T> {
    const key = `${url}?${JSON.stringify(params ?? {})}`;

    const cached = this.cache.get(key);
    if (cached !== undefined) return cached as T;

    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const request = this.client
      .get<T>(url, { params })
      .then((res) => {
        if (!options.cacheIf || options.cacheIf(res.data)) {
          this.cache.set(key, res.data, options.ttlMs);
        }
        return res.data;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, request);
    return request;
  }
}

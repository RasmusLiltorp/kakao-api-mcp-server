/** A minimal in-memory cache with per-entry time-to-live expiry. */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expires: number }>();

  /** @param defaultTtlMs TTL applied by set() when no override is given. */
  constructor(private readonly defaultTtlMs: number) {}

  /** Returns the cached value, or undefined when absent or expired. */
  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Stores a value, optionally overriding the default TTL for this entry. */
  set(key: string, value: V, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expires: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }
}

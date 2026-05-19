/** A minimal in-memory cache with per-entry time-to-live expiry. */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expires: number }>();

  constructor(private readonly ttlMs: number) {}

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

  set(key: string, value: V): void {
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }
}

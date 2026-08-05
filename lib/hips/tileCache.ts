/**
 * A byte-capped FIFO cache for tile bodies served by the /api/hips route.
 *
 * Every tile otherwise comes off networked disk on every request from every
 * viewer, since the pod serves all tile traffic itself. Tiles at a given
 * path are immutable — new processings get new paths — so nothing here ever
 * needs invalidating, and FIFO is enough: the win is not re-reading the
 * hot survey's tiles, not perfect retention.
 *
 * Insertion order of a Map is its iteration order, which is the whole
 * eviction mechanism.
 */

export interface TileCache {
  get(key: string): Buffer | undefined;
  set(key: string, body: Buffer): void;
  /** current total of cached bytes, exposed for tests */
  size(): number;
}

export const createTileCache = (maxBytes: number): TileCache => {
  const entries = new Map<string, Buffer>();
  let total = 0;

  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    // disabled: a no-op cache keeps the route free of conditionals
    return {
      get: () => undefined,
      set: () => undefined,
      size: () => 0,
    };
  }

  return {
    get(key) {
      return entries.get(key);
    },

    set(key, body) {
      if (entries.has(key)) {
        return;
      }

      // never let one oversized file (an Allsky preview, say) flush
      // everything else out
      if (body.byteLength > maxBytes / 8) {
        return;
      }

      entries.set(key, body);
      total += body.byteLength;

      while (total > maxBytes) {
        const oldest = entries.keys().next();

        if (oldest.done) {
          break;
        }

        const oldestBody = entries.get(oldest.value);

        entries.delete(oldest.value);
        total -= oldestBody?.byteLength ?? 0;
      }
    },

    size() {
      return total;
    },
  };
};

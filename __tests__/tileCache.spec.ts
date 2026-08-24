import { describe, expect, it } from "vitest";
import { createTileCache } from "@/lib/hips/tileCache";

const tile = (fill: string, bytes: number) => Buffer.alloc(bytes, fill);

describe(createTileCache, () => {
  it("returns what was cached", () => {
    const cache = createTileCache(1024);
    const body = tile("a", 100);

    cache.set("a", body);

    expect(cache.get("a")).toBe(body);
    expect(cache.get("missing")).toBeUndefined();
  });

  it("evicts oldest-first once over the byte cap", () => {
    // entries must sit under the oversized-entry guard (an eighth of the
    // cap) for eviction, rather than refusal, to be what is exercised
    const cache = createTileCache(800);

    for (let i = 0; i < 10; i += 1) {
      cache.set(`tile-${i}`, tile(`${i}`, 100));
    }

    expect(cache.get("tile-0")).toBeUndefined();
    expect(cache.get("tile-1")).toBeUndefined();
    expect(cache.get("tile-2")).toBeDefined();
    expect(cache.get("tile-9")).toBeDefined();
    expect(cache.size()).toBe(800);
  });

  it("refuses an entry big enough to flush everything else", () => {
    const cache = createTileCache(800);

    cache.set("small", tile("s", 50));
    // over an eighth of the cap
    cache.set("huge", tile("h", 200));

    expect(cache.get("huge")).toBeUndefined();
    expect(cache.get("small")).toBeDefined();
  });

  it("does nothing when disabled", () => {
    const cache = createTileCache(0);

    cache.set("a", tile("a", 10));

    expect(cache.get("a")).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  it("keeps the first body for a repeated key without double counting", () => {
    const cache = createTileCache(1000);
    const first = tile("1", 100);

    cache.set("a", first);
    cache.set("a", tile("2", 100));

    expect(cache.get("a")).toBe(first);
    expect(cache.size()).toBe(100);
  });
});

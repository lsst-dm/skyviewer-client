import { describe, expect, it } from "vitest";
import {
  angularSeparation,
  parseSkymap,
  tractsInView,
} from "@/lib/skymap/tracts";

// three tracts from the real lsst_cells_v2 dump: one straddling RA 0 near
// the equator, one at high declination, and the south polar cap
const example = {
  name: "lsst_cells_v2",
  polygon: "inner",
  edgeSamples: 1,
  tractCount: 3,
  tracts: [
    [
      9469,
      [0.0, 0.7438],
      [
        [0.83316, -0.08944],
        [359.16678, -0.08944],
        [359.16647, 1.57694],
        [0.83347, 1.57694],
      ],
    ],
    [
      16571,
      [0.0, 49.83471],
      [
        [1.26986, 48.9945],
        [358.73005, 48.99449],
        [358.68553, 50.66062],
        [1.31438, 50.66062],
      ],
    ],
    [
      0,
      [0.0, -90.0],
      [
        [135.0, -88.82169],
        [225.00191, -88.82165],
        [315.0, -88.82162],
        [44.99809, -88.82165],
      ],
    ],
  ],
};

describe(angularSeparation, () => {
  it("measures along a great circle, not in coordinate space", () => {
    // a degree of right ascension is a degree on the sky at the equator and
    // half of one at 60 degrees declination
    expect(angularSeparation([0, 0], [1, 0])).toBeCloseTo(1, 6);
    expect(angularSeparation([0, 60], [1, 60])).toBeCloseTo(0.5, 3);
  });

  it("crosses right ascension zero without going the long way round", () => {
    expect(angularSeparation([359.5, 0], [0.5, 0])).toBeCloseTo(1, 6);
  });

  it("is zero for a point against itself", () => {
    expect(angularSeparation([186.2, 7], [186.2, 7])).toBe(0);
  });
});

describe(parseSkymap, () => {
  it("reads a dump and measures the widest tract", () => {
    const skymap = parseSkymap(example);

    expect(skymap.name).toBe("lsst_cells_v2");
    expect(skymap.polygon).toBe("inner");
    expect(skymap.tracts).toHaveLength(3);
    expect(skymap.tracts[0]).toEqual({
      id: 9469,
      centre: [0.0, 0.7438],
      vertices: example.tracts[0][2],
    });
    // the polar tract's corners sit 1.178 degrees from the pole, the widest
    // centre-to-corner reach in this skymap
    expect(skymap.tractRadius).toBeCloseTo(1.1784, 3);
  });

  it("drops a malformed tract rather than the whole skymap", () => {
    const skymap = parseSkymap({
      ...example,
      tracts: [
        example.tracts[0],
        [9470, [0, 0], [[1, 2]]], // too few vertices to be a boundary
        ["9471", [0, 0], example.tracts[0][2]], // id is not a number
        [9472, [0, "nope"], example.tracts[0][2]], // centre is not a point
        example.tracts[1],
      ],
    });

    expect(skymap.tracts.map(({ id }) => id)).toEqual([9469, 16571]);
  });

  it("rejects a document that is not a skymap at all", () => {
    expect(() => parseSkymap(null)).toThrow();
    expect(() => parseSkymap({ name: "x" })).toThrow();
    expect(() => parseSkymap({ name: "x", tracts: [] })).toThrow();
  });
});

describe(tractsInView, () => {
  const skymap = parseSkymap(example);

  it("keeps a tract whose centre is in view", () => {
    const visible = tractsInView(skymap, [0, 0.7438], 0.1);

    expect(visible.map(({ id }) => id)).toEqual([9469]);
  });

  it("keeps a tract whose centre is outside the view but whose corner is not", () => {
    // the view stops well short of tract 16571's centre at dec 49.83, but
    // its lower edge at dec 48.99 is inside
    const visible = tractsInView(skymap, [0, 47.9], 1.2);

    expect(visible.map(({ id }) => id)).toEqual([16571]);
  });

  it("drops everything when the view is nowhere near", () => {
    expect(tractsInView(skymap, [180, 0], 5)).toEqual([]);
  });

  it("finds the polar tract from over the pole", () => {
    const visible = tractsInView(skymap, [123, -89.9], 0.5);

    expect(visible.map(({ id }) => id)).toEqual([0]);
  });
});

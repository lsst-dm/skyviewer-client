/**
 * Tract geometry for a skymap, as dumped by `scripts/dump-skymap-tracts.py`.
 *
 * Nothing here ties a skymap to a survey, deliberately. The HiPS carry no
 * skymap provenance — no `prov_progenitor`, no `obs_collection`, and
 * `creator_did` is a stale template on some surveys (both Virgo fields
 * declare an ECDFS did) — so there is nothing to key an automatic choice
 * off, and guessing would draw a confidently wrong grid over a coadd built
 * on something else. Skymaps are offered as grids the user can switch on;
 * how well one lines up with the imagery is for them to judge.
 */

/** `[ra, dec]` in degrees, ICRS. */
export type SkyPoint = [number, number];

export interface Tract {
  id: number;
  centre: SkyPoint;
  /**
   * Corners in order around the tract. Four of them describe the boundary
   * exactly, with no subdivision needed: a tract is a rectangle in its own
   * gnomonic (TAN) tangent plane, gnomonic projection maps great circles to
   * straight lines, so the edges *are* great circles — which is what aladin
   * draws between consecutive vertices.
   *
   * The data says so too. If the edges ran along declination parallels, a
   * tract's northern and southern edges would span equal ranges of right
   * ascension; instead the spans differ by ~1.7% at the median tract and
   * ~25% by |dec| = 82, exactly as a tangent-plane rectangle should.
   *
   * A skymap built on some other projection would break this assumption, and
   * would need dumping with `--edge-samples` to trace its edges properly.
   */
  vertices: Array<SkyPoint>;
}

export interface Skymap {
  name: string;
  /**
   * Which sky polygon the dump was generated from, `inner` or `outer`.
   *
   * Not the difference it sounds like, at least on lsst_cells_v2: the inner
   * polygons already overlap their neighbours by about 11 arcmin — tracts
   * 1.684 degrees wide on centres 1.500 degrees apart — so a grid drawn from
   * either shows a doubled line along every tract edge. That is the skymap's
   * own geometry showing through, not a rendering artefact.
   */
  polygon: string;
  tracts: Array<Tract>;
  /** widest centre-to-corner angle of any tract, in degrees. Culling needs
   * it to know how far outside the view a centre can sit while a corner is
   * still inside it. Measured rather than assumed, so it stays true for
   * skymaps with a different tract size */
  tractRadius: number;
}

const DEGREES = Math.PI / 180;

const isSkyPoint = (value: unknown): value is SkyPoint =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((angle) => typeof angle === "number" && Number.isFinite(angle));

/**
 * Angular separation between two sky positions, in degrees.
 *
 * Haversine rather than the spherical law of cosines: tract centres in a
 * view are a degree or two apart, where the cosine form loses most of its
 * precision to catastrophic cancellation.
 */
export const angularSeparation = (a: SkyPoint, b: SkyPoint): number => {
  const [raA, decA] = [a[0] * DEGREES, a[1] * DEGREES];
  const [raB, decB] = [b[0] * DEGREES, b[1] * DEGREES];
  const sinDec = Math.sin((decB - decA) / 2);
  const sinRa = Math.sin((raB - raA) / 2);
  const haversine =
    sinDec * sinDec + Math.cos(decA) * Math.cos(decB) * sinRa * sinRa;

  return (2 * Math.asin(Math.min(1, Math.sqrt(haversine)))) / DEGREES;
};

/**
 * Reads a dumped skymap, dropping any tract that is not well formed rather
 * than failing the whole file: a single bad row should cost one tract, not
 * the overlay.
 */
export const parseSkymap = (source: unknown): Skymap => {
  if (typeof source !== "object" || source === null) {
    throw new Error("skymap is not an object");
  }

  const { name, polygon, tracts } = source as Record<string, unknown>;

  if (typeof name !== "string" || !Array.isArray(tracts)) {
    throw new Error("skymap is missing name or tracts");
  }

  const parsed: Array<Tract> = [];
  let tractRadius = 0;

  for (const entry of tracts) {
    if (!Array.isArray(entry) || entry.length !== 3) {
      continue;
    }

    const [id, centre, vertices] = entry;

    if (
      typeof id !== "number" ||
      !isSkyPoint(centre) ||
      !Array.isArray(vertices) ||
      vertices.length < 3 ||
      !vertices.every(isSkyPoint)
    ) {
      continue;
    }

    for (const vertex of vertices) {
      tractRadius = Math.max(tractRadius, angularSeparation(centre, vertex));
    }

    parsed.push({ id, centre, vertices });
  }

  if (parsed.length === 0) {
    throw new Error("skymap contains no usable tracts");
  }

  return {
    name,
    polygon: typeof polygon === "string" ? polygon : "inner",
    tracts: parsed,
    tractRadius,
  };
};

/**
 * The tracts whose boundaries can reach a circular field of view, both in
 * degrees. Compares centres and pads by the widest tract, which overselects
 * slightly at the corners — far cheaper than a polygon intersection, and
 * drawing a handful of tracts just outside the view costs nothing.
 */
export const tractsInView = (
  skymap: Skymap,
  centre: SkyPoint,
  radius: number
): Array<Tract> => {
  const reach = radius + skymap.tractRadius;

  return skymap.tracts.filter(
    (tract) => angularSeparation(centre, tract.centre) <= reach
  );
};

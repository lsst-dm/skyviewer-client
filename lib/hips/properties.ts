/**
 * Parsing for a HiPS `properties` file.
 *
 * Surveys normally arrive from the CMS with their display parameters already
 * filled in. A HiPS read off disk has no CMS entry, so the same parameters
 * have to come from the survey itself, which is what `properties` is for:
 * see the HiPS 1.0 standard, section 4.4.
 */

/** the subset of HiPS properties keys this app needs */
export interface HiPSProperties {
  /** deepest order with tiles, from `hips_order` */
  maxOrder?: number;
  /** shallowest order with tiles, from `hips_order_min`. Frequently absent —
   * the fork forces a floor of 3 in that case; see lib/aladin/helpers.ts */
  minOrder?: number;
  imgFormat?: HiPSImageFormat;
  tileSize?: TileSize;
  cooFrame?: CooFrame;
  title?: string;
  /** where the survey suggests opening, from hips_initial_ra/dec/fov. These
   * surveys cover a tiny fraction of the sky — a few hundredths of a degree
   * across — so without them the viewer opens on empty sky with no clue
   * which way to look */
  initialRa?: number;
  initialDec?: number;
  initialFov?: number;
}

const IMG_FORMATS: ReadonlyArray<HiPSImageFormat> = [
  "webp",
  "png",
  "jpeg",
  "fits",
];

const TILE_SIZES: ReadonlyArray<TileSize> = [32, 64, 128, 256, 512];

/**
 * Splits `key = value` lines, ignoring blanks and `#` comments. Values may
 * contain `=`, so only the first one separates. Later keys win, matching the
 * behaviour of the reference implementation.
 */
const parseFields = (source: string): Record<string, string> => {
  const fields: Record<string, string> = {};

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();

    if (key) {
      fields[key] = value;
    }
  }

  return fields;
};

const asOrder = (value?: string): number | undefined => {
  const order = Number(value);

  return Number.isInteger(order) && order >= 0 && order <= 29
    ? order
    : undefined;
};

/**
 * `hips_tile_format` is a space-separated list in preference order, and may
 * name formats aladin cannot draw (fits alongside an image format, say). Take
 * the first one this app supports rather than the first one listed.
 */
const asImgFormat = (value?: string): HiPSImageFormat | undefined => {
  const advertised = value?.trim().toLowerCase().split(/\s+/) ?? [];

  // jpeg is spelled "jpg" in some HiPS; the app's enum uses "jpeg"
  const normalized = advertised.map((format) =>
    format === "jpg" ? "jpeg" : format
  );

  return IMG_FORMATS.find((format) => normalized.includes(format));
};

const asTileSize = (value?: string): TileSize | undefined =>
  TILE_SIZES.find((size) => size === Number(value));

/** these are written in exponent form often enough that parseFloat is not
 * enough on its own; reject anything that is not a finite number */
const asNumber = (value?: string): number | undefined => {
  const parsed = Number(value);

  return value !== undefined && value !== "" && Number.isFinite(parsed)
    ? parsed
    : undefined;
};

/** HiPS spell these as `equatorial`/`galactic`; aladin takes either those or
 * its own aliases, so pass through only what the app's enum accepts */
const asCooFrame = (value?: string): CooFrame | undefined => {
  const frame = value?.trim().toLowerCase();

  if (frame === "equatorial") {
    return "equatorial";
  }

  if (frame === "galactic") {
    return "galactic";
  }

  return undefined;
};

/**
 * Rewrites a properties file's creator_did to the given value, preserving
 * everything else.
 *
 * The staged surveys share a handful of templated creator_did values, but
 * the HiPS standard requires it to uniquely identify a dataset — and aladin
 * takes it at its word: a HiPS's cache id IS its creator_did, and adding a
 * HiPS whose id is already cached silently adopts the cached survey's
 * options instead of its own. Serving each survey a unique value removes
 * the whole collision class at the one place we control the data.
 */
export const withUniqueCreatorDid = (source: string, did: string): string => {
  const line = `creator_did              = ${did}`;
  const replaced = source.replace(/^[ \t]*creator_did[ \t]*=.*$/m, line);

  // no creator_did to replace: prepend one
  return replaced === source ? `${line}\n${source}` : replaced;
};

export const parseHiPSProperties = (source: string): HiPSProperties => {
  const fields = parseFields(source);

  return {
    maxOrder: asOrder(fields.hips_order),
    minOrder: asOrder(fields.hips_order_min),
    imgFormat: asImgFormat(fields.hips_tile_format),
    tileSize: asTileSize(fields.hips_tile_width),
    cooFrame: asCooFrame(fields.hips_frame),
    title: fields.obs_title || undefined,
    initialRa: asNumber(fields.hips_initial_ra),
    initialDec: asNumber(fields.hips_initial_dec),
    initialFov: asNumber(fields.hips_initial_fov),
  };
};

/**
 * Parsing for sky coordinates as people actually write them.
 *
 * Coordinates arrive pasted from papers, catalogues, TOPCAT, SIMBAD, ds9 and
 * colleagues' emails, in whatever notation the source happened to use. This
 * accepts the union of those rather than one blessed format, and returns
 * null for anything it cannot read with confidence — a caller can then fall
 * back to resolving the input as an object name.
 *
 * Handled, in any combination across the two halves:
 *
 *   186.2 7.0             12:30:49.4 +12:23:28     12h30m49.4s+12d23m28s
 *   186.2, -7.0           12 30 49.4 -12 23 28     12h 30m 49.4s +12° 23′ 28″
 *   186.2° 7.0°           12 30 +12 23             RA 186.2 Dec +7.0
 *   ra=186.2 dec=7.0      12h30m +12.5             186.2 +12:23:28
 *
 * A comma (or semicolon, or pipe) between the two axes is taken as the
 * divide between them, which is worth more than it looks: `12 30 49.4, 7.0`
 * is a sexagesimal right ascension beside a decimal declination, and no
 * amount of counting fields would find that boundary on its own.
 *
 * The ambiguous case is a bare sexagesimal right ascension, which is hours
 * by convention (`12 30 49` is 12h30m49s, not 12°30′49″) — except that a
 * leading field above 24 cannot be hours, so it is read as degrees. A bare
 * decimal right ascension is always degrees: `12` is 12°, not 12h. Write
 * `12h` if you mean hours.
 */

export interface SkyCoordinates {
  /** degrees, [0, 360) */
  ra: number;
  /** degrees, [-90, 90] */
  dec: number;
}

interface Token {
  magnitude: number;
  /** whether a literal `-` preceded it, which `magnitude` cannot carry: the
   * sign of `-00 30 00` lives on a field that is numerically zero */
  negative: boolean;
  /** whether a literal `+` or `-` preceded it, which is what marks the start
   * of the declination in `12 30 49 +12 23 28` */
  signed: boolean;
  unit?: "h" | "d" | "m" | "s";
}

/** a signed number with an optional unit; the units are already normalised
 * to letters by the time this runs */
const TOKEN = /([+-])?\s*(\d+(?:\.\d+)?)\s*([hdms])?/g;

const normalise = (input: string): string =>
  input
    // the search box seeds itself with a zero-width space
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    // Unit marks are mapped before NFKC, which mangles two of them: it
    // decomposes ″ into a pair of primes, and turns º into a plain letter o.
    // Mapping first leaves NFKC to do the part it is wanted for, which is
    // folding full-width digits and spaces into ASCII.
    .replace(/[°º∘]/g, "d")
    .replace(/[′’‘`']/g, "m")
    .replace(/[″”“"]/g, "s")
    .normalize("NFKC")
    .toLowerCase()
    // frame and epoch names carry no position
    .replace(/\b(?:j2000(?:\.0)?|b1950|icrs|fk5|fk4|epoch|equinox)\b/g, " ")
    // axis labels, with whatever punctuation and separator follow them
    .replace(/\b(?:right\s*ascension|r\.\s*a\.|ra)\s*[:=]?/g, " ")
    .replace(/\b(?:declination|decl\.?|dec\.?|de)\s*[:=]?/g, " ")
    // a colon only ever separates fields within an axis
    .replace(/:/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Splits the text into numbers, or returns null if anything else is left
 * over — which is how an object name ("M49", "NGC 1234") is rejected rather
 * than mistaken for a position.
 */
const tokenise = (text: string): Array<Token> | null => {
  const tokens: Array<Token> = [];
  let consumed = 0;

  TOKEN.lastIndex = 0;

  for (let match = TOKEN.exec(text); match !== null; match = TOKEN.exec(text)) {
    // anything skipped over between tokens is unparsed text, not a position
    if (text.slice(consumed, match.index).trim() !== "") {
      return null;
    }

    const [whole, sign, magnitude, unit] = match;

    tokens.push({
      magnitude: Number(magnitude),
      negative: sign === "-",
      signed: sign !== undefined,
      unit: unit as Token["unit"],
    });

    consumed = match.index + whole.length;
  }

  return text.slice(consumed).trim() === "" && tokens.length > 0
    ? tokens
    : null;
};

/**
 * Where the declination starts.
 *
 * An explicit sign is the most reliable marker, since a declination is
 * signed far more often than a right ascension is. Units are the next best:
 * they are written consistently within an axis, so a second leading unit —
 * or the first bare field after units — begins the other one. Only when the
 * input carries neither does it fall back to halving, which needs the two
 * axes to be written alike.
 */
const splitAt = (tokens: Array<Token>): number | null => {
  const signed = tokens.findIndex(({ signed }, index) => index > 0 && signed);

  if (signed > 0) {
    return signed;
  }

  // "186.2d 7.0d", "12h30m49s 12d23m28s": a leading unit starts an axis
  const restart = tokens.findIndex(
    ({ unit }, index) => index > 0 && (unit === "h" || unit === "d")
  );

  if (restart > 0) {
    return restart;
  }

  // "12h30m49.42s 7.0": units stopped, so the other axis started
  if (tokens[0].unit !== undefined) {
    const bare = tokens.findIndex(
      ({ unit }, index) => index > 0 && unit === undefined
    );

    if (bare > 0) {
      return bare;
    }
  }

  return tokens.length % 2 === 0 ? tokens.length / 2 : null;
};

/** Converts one axis to degrees, or null if it is not a well formed angle. */
const toDegrees = (tokens: Array<Token>, isRa: boolean): number | null => {
  if (tokens.length === 0 || tokens.length > 3) {
    return null;
  }

  const [first, ...rest] = tokens;

  // only the leading field may be signed: "+12 -23 28" is not an angle
  if (rest.some(({ signed }) => signed)) {
    return null;
  }

  // minutes and seconds are sixtieths, whatever the leading field's unit
  if (rest.some(({ magnitude }) => magnitude >= 60)) {
    return null;
  }

  const inHours =
    first.unit === "h" ||
    // bare sexagesimal right ascension is hours by convention, unless the
    // leading field is too large to be one
    (isRa &&
      first.unit === undefined &&
      rest.length > 0 &&
      first.magnitude <= 24);

  const magnitude = tokens.reduce(
    (total, { magnitude }, index) => total + magnitude / 60 ** index,
    0
  );

  const degrees =
    (first.negative ? -magnitude : magnitude) * (inHours ? 15 : 1);

  return Number.isFinite(degrees) ? degrees : null;
};

/**
 * Builds the position from two axes already separated.
 *
 * Right ascension is wrapped into [0, 360) rather than rejected, so a
 * position written relative to zero ("-10 +5") still lands where it means.
 * Declination is not wrapped: past the pole is a mistake, not a notation.
 */
const build = (
  raTokens: Array<Token>,
  decTokens: Array<Token>
): SkyCoordinates | null => {
  const ra = toDegrees(raTokens, true);
  const dec = toDegrees(decTokens, false);

  if (ra === null || dec === null || dec < -90 || dec > 90) {
    return null;
  }

  return { ra: ((ra % 360) + 360) % 360, dec };
};

/**
 * Splits an angle into whole units, minutes and seconds.
 *
 * Rounds at the seconds' last place and carries upwards, so an angle a
 * whisker under the minute reads as the next minute rather than as sixty
 * seconds of the current one.
 */
const sexagesimalFields = (total: number, decimals: number) => {
  const scale = 10 ** decimals;
  const ticks = Math.round(Math.abs(total) * 3600 * scale);

  return {
    units: Math.floor(ticks / (3600 * scale)),
    minutes: Math.floor(ticks / (60 * scale)) % 60,
    seconds: (ticks % (60 * scale)) / scale,
  };
};

/** two leading digits, so the fields line up when read down a column */
const pad = (value: number, decimals = 0): string =>
  value.toFixed(decimals).padStart(decimals > 0 ? decimals + 3 : 2, "0");

/**
 * The position in decimal degrees.
 *
 * Deliberately not localised, unlike prose: a coordinate is written with a
 * decimal point the world over, and a decimal comma here would both read
 * oddly to an astronomer and, pasted back into the box, be taken as the
 * separator between the two axes.
 */
export const toDecimal = ({ ra, dec }: SkyCoordinates) => ({
  ra: `${ra.toFixed(5)}°`,
  dec: `${dec < 0 ? "-" : "+"}${Math.abs(dec).toFixed(5)}°`,
});

/**
 * The position in sexagesimal, right ascension in hours.
 *
 * Units are written out rather than left as bare colons, because the whole
 * point of reading a position back is to remove doubt: `12 30 49` does not
 * say which axis is counted in hours, and `12h 30m 49.42s` does. Both forms
 * parse back through `parseCoordinates`, so what is shown can be copied
 * straight back into the box.
 */
export const toSexagesimal = ({ ra, dec }: SkyCoordinates) => {
  const hours = sexagesimalFields(ra / 15, 2);
  const degrees = sexagesimalFields(dec, 1);

  return {
    // a shade under 24h rounds up to it, and 24h is not a right ascension
    ra:
      `${pad(hours.units % 24)}h ${pad(hours.minutes)}m ` +
      `${pad(hours.seconds, 2)}s`,
    dec:
      `${dec < 0 ? "-" : "+"}${pad(degrees.units)}° ` +
      `${pad(degrees.minutes)}′ ${pad(degrees.seconds, 1)}″`,
  };
};

/** a comma, semicolon or pipe, which separate the axes rather than the
 * fields within one */
const AXIS_SEPARATOR = /\s*[,;|]\s*/;

/** Reads a position, or returns null if the input is not one. */
export const parseCoordinates = (input: string): SkyCoordinates | null => {
  const text = normalise(input);

  // A comma between the axes says where the split falls, which counting
  // fields cannot always work out: "12 30 49.4, 7.0" is a sexagesimal right
  // ascension beside a decimal declination, and halving its four fields
  // would put two on each side and land somewhere else entirely.
  const halves = text.split(AXIS_SEPARATOR).filter((half) => half !== "");

  if (halves.length === 2) {
    const raTokens = tokenise(halves[0]);
    const decTokens = tokenise(halves[1]);

    if (raTokens && decTokens) {
      const found = build(raTokens, decTokens);

      if (found) {
        return found;
      }
    }
  }

  // no usable comma, or the halves it made were not angles: fall back to
  // reading the whole thing as one run of fields
  const tokens = tokenise(text.replace(/[,;|]/g, " "));

  if (!tokens) {
    return null;
  }

  const split = splitAt(tokens);

  return split === null
    ? null
    : build(tokens.slice(0, split), tokens.slice(split));
};

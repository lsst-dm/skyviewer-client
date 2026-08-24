import { describe, expect, it } from "vitest";
import {
  parseCoordinates,
  toDecimal,
  toSexagesimal,
} from "@/lib/astro/coordinates";

/** the Virgo field the surveys open on, written every way it plausibly
 * arrives: 12h30m49.42s +12°23′28.0″ is 187.70592 +12.39111 */
const VIRGO_RA = 187.70592;
const VIRGO_DEC = 12.39111;

const expectClose = (input: string, ra: number, dec: number, precision = 4) => {
  const parsed = parseCoordinates(input);

  expect(parsed, `failed to parse ${JSON.stringify(input)}`).not.toBeNull();
  expect(parsed!.ra, `ra of ${JSON.stringify(input)}`).toBeCloseTo(
    ra,
    precision
  );
  expect(parsed!.dec, `dec of ${JSON.stringify(input)}`).toBeCloseTo(
    dec,
    precision
  );
};

describe(parseCoordinates, () => {
  it("reads decimal degrees", () => {
    expectClose("186.2 7.0", 186.2, 7);
    expectClose("186.2,7.0", 186.2, 7);
    expectClose("186.2, +7.0", 186.2, 7);
    expectClose("186.2 -7.0", 186.2, -7);
    expectClose("186.2-7.0", 186.2, -7);
    expectClose("  186.2   7   ", 186.2, 7);
    expectClose("186 7", 186, 7);
  });

  it("reads decimal degrees with unit marks", () => {
    expectClose("186.2° 7.0°", 186.2, 7);
    expectClose("186.2d -7.0d", 186.2, -7);
    expectClose("186.2º, +7.0º", 186.2, 7);
  });

  it("reads sexagesimal in every separator it arrives in", () => {
    expectClose("12:30:49.42 +12:23:28.0", VIRGO_RA, VIRGO_DEC);
    expectClose("12 30 49.42 +12 23 28.0", VIRGO_RA, VIRGO_DEC);
    expectClose("12h30m49.42s +12d23m28.0s", VIRGO_RA, VIRGO_DEC);
    expectClose("12h30m49.42s+12d23m28.0s", VIRGO_RA, VIRGO_DEC);
    expectClose("12h 30m 49.42s +12° 23′ 28.0″", VIRGO_RA, VIRGO_DEC);
    expectClose(`12h 30m 49.42s +12° 23' 28.0"`, VIRGO_RA, VIRGO_DEC);
    expectClose("12:30:49.42,+12:23:28.0", VIRGO_RA, VIRGO_DEC);
  });

  it("reads sexagesimal without seconds", () => {
    expectClose("12 30 +12 23", 12.5 * 15, 12 + 23 / 60);
    expectClose("12h30m +12d23m", 12.5 * 15, 12 + 23 / 60);
  });

  it("keeps a negative declination that sits on a zero field", () => {
    // the sign is the only thing distinguishing this from +0:30
    expectClose("12 00 00 -00 30 00", 180, -0.5);
    expectClose("10.0 -00:30:00", 10, -0.5);
  });

  it("takes bare sexagesimal right ascension as hours", () => {
    expectClose("12 30 49.42 +12 23 28.0", VIRGO_RA, VIRGO_DEC);
  });

  it("takes bare decimal right ascension as degrees", () => {
    // 12 alone is 12 degrees; hours need saying so
    expectClose("12 7", 12, 7);
    expectClose("12h 7", 180, 7);
  });

  it("reads a leading field too large to be hours as degrees", () => {
    // 186 cannot be an hour count, so this is degrees, minutes, seconds
    expectClose("186 12 00 +7 30 00", 186.2, 7.5);
  });

  it("mixes notations across the two halves", () => {
    expectClose("186.2 +12:23:28.0", 186.2, VIRGO_DEC);
    expectClose("12h30m49.42s 7.0", VIRGO_RA, 7);
  });

  it("lets a comma settle where the two axes divide", () => {
    // without the comma these four fields would halve into two and two,
    // which is a different position altogether
    expectClose("12 30 49.42, 7.0", VIRGO_RA, 7);
    expectClose("12 30 49.42 , 7.0", VIRGO_RA, 7);
    expectClose("186.2, 12 23 28.0", 186.2, VIRGO_DEC);
    expectClose("12 30 49.42, 12 23 28.0", VIRGO_RA, VIRGO_DEC);
    expectClose("12:30:49.42, +12:23:28.0", VIRGO_RA, VIRGO_DEC);
    expectClose("186.2,7.0", 186.2, 7);
    expectClose("186.2, 7.0,", 186.2, 7);
    expectClose("186.2; 7.0", 186.2, 7);
    expectClose("186.2 | 7.0", 186.2, 7);
    // a comma that separates nothing usable falls back to the field run
    expectClose("12 30 49.42 +12 23 28.0", VIRGO_RA, VIRGO_DEC);
  });

  it("ignores axis labels, frames and epochs", () => {
    expectClose("RA 186.2 Dec 7.0", 186.2, 7);
    expectClose("ra=186.2 dec=-7.0", 186.2, -7);
    expectClose("R.A. 12:30:49.42 Decl. +12:23:28.0", VIRGO_RA, VIRGO_DEC);
    expectClose("186.2 7.0 J2000", 186.2, 7);
    expectClose("ICRS 186.2 7.0", 186.2, 7);
  });

  it("wraps right ascension but never declination", () => {
    expectClose("-10 5", 350, 5);
    expectClose("370 5", 10, 5);
    expect(parseCoordinates("186.2 95")).toBeNull();
    expect(parseCoordinates("186.2 -91")).toBeNull();
  });

  it("rejects object names so they can be resolved instead", () => {
    expect(parseCoordinates("M49")).toBeNull();
    expect(parseCoordinates("NGC 1234")).toBeNull();
    expect(parseCoordinates("Messier 49")).toBeNull();
    expect(parseCoordinates("Andromeda")).toBeNull();
    expect(parseCoordinates("")).toBeNull();
    expect(parseCoordinates("   ")).toBeNull();
  });

  it("rejects malformed angles rather than guessing", () => {
    expect(parseCoordinates("186.2")).toBeNull();
    expect(parseCoordinates("1 2 3 4 5")).toBeNull();
    // minutes and seconds are sixtieths
    expect(parseCoordinates("12 70 00 +12 00 00")).toBeNull();
    expect(parseCoordinates("12 00 00 +12 00 99")).toBeNull();
    // a sign belongs on the leading field only
    expect(parseCoordinates("12 +30 49 +12 23 28")).toBeNull();
    // more fields than an angle has
    expect(parseCoordinates("12 30 49 11 +12 23 28 11")).toBeNull();
  });

  it("survives the zero-width space the search box seeds itself with", () => {
    expectClose("\u200b186.2 7.0", 186.2, 7);
    expectClose("186.2 7.0\u200b", 186.2, 7);
  });
});

describe(toSexagesimal, () => {
  it("writes the units out so neither axis is ambiguous", () => {
    expect(toSexagesimal({ ra: VIRGO_RA, dec: VIRGO_DEC })).toEqual({
      ra: "12h 30m 49.42s",
      dec: "+12° 23′ 28.0″",
    });
  });

  it("pads every field and keeps the sign of a small negative", () => {
    expect(toSexagesimal({ ra: 1.25, dec: -0.5 })).toEqual({
      ra: "00h 05m 00.00s",
      dec: "-00° 30′ 00.0″",
    });
  });

  it("carries the rounding upwards instead of writing sixty", () => {
    // a hair under a whole minute of arc, which must not round to 60.0
    expect(toSexagesimal({ ra: 0, dec: 1 - 1e-9 }).dec).toBe("+01° 00′ 00.0″");
    expect(toSexagesimal({ ra: 15 - 1e-9, dec: 0 }).ra).toBe("01h 00m 00.00s");
  });

  it("wraps rather than writing an impossible 24h", () => {
    // 359.99999 is a shade under a full turn and rounds up to it
    expect(toSexagesimal({ ra: 359.99999, dec: 0 }).ra).toBe("00h 00m 00.00s");
  });
});

describe(toDecimal, () => {
  it("writes a decimal point whatever the locale, and signs the dec", () => {
    expect(toDecimal({ ra: VIRGO_RA, dec: VIRGO_DEC })).toEqual({
      ra: "187.70592°",
      dec: "+12.39111°",
    });
    expect(toDecimal({ ra: 10, dec: -7.5 })).toEqual({
      ra: "10.00000°",
      dec: "-7.50000°",
    });
  });
});

describe("reading a position back", () => {
  // what is shown has to be usable as input, or it is only half an answer
  const positions = [
    { ra: VIRGO_RA, dec: VIRGO_DEC },
    { ra: 0, dec: 0 },
    { ra: 359.99999, dec: -89.9 },
    { ra: 10, dec: -0.5 },
    { ra: 186.2, dec: 7 },
  ];

  /** how far apart two right ascensions are, the short way round: 0 and
   * 360 are the same place, so a plain subtraction would call them a full
   * turn apart */
  const raApart = (a: number, b: number) =>
    Math.abs(((a - b + 540) % 360) - 180);

  it.each(positions)("round trips $ra $dec through sexagesimal", (position) => {
    const { ra, dec } = toSexagesimal(position);
    const parsed = parseCoordinates(`${ra} ${dec}`);

    expect(parsed).not.toBeNull();
    expect(raApart(parsed!.ra, position.ra)).toBeLessThan(1e-3);
    expect(parsed!.dec).toBeCloseTo(position.dec, 3);
  });

  it.each(positions)("round trips $ra $dec through decimal", (position) => {
    const { ra, dec } = toDecimal(position);
    const parsed = parseCoordinates(`${ra} ${dec}`);

    expect(parsed).not.toBeNull();
    expect(raApart(parsed!.ra, position.ra)).toBeLessThan(1e-4);
    expect(parsed!.dec).toBeCloseTo(position.dec, 4);
  });
});

import { describe, expect, it } from "vitest";
import type { DiscoveredSurvey } from "@/lib/hips/discover";
import { toHiPSList, toHiPSListJSON } from "@/lib/hips/hipslist";
import { parseFields, parseHiPSProperties } from "@/lib/hips/properties";

const BASE = "https://usdf-rsp-dev.slac.stanford.edu/skyviewer/api/hips";

// trimmed from an actual survey under /sdf/group/rubin/shared/hips_views
const example = `
creator_did          = ivo://CDS/P/rubin/ltl2/color_gri
obs_title            = LSSTCam ltl2 color_gri
dataproduct_type     = image

hips_order           = 11
hips_tile_format     = webp png
hips_frame           = equatorial
`;

const survey = (
  path: string,
  source = example,
  modifiedAt = Date.UTC(2026, 0, 2, 3, 4, 5)
): DiscoveredSurvey => ({
  path,
  group: path.split("/")[0],
  label: path,
  properties: parseHiPSProperties(source),
  source,
  modifiedAt,
});

/** the records of a list, as the standard defines them: blank-line separated */
const records = (list: string) =>
  list
    .split(/\n\s*\n/)
    .map((record) => record.trim())
    .filter(Boolean);

describe(toHiPSList, () => {
  it("emits one blank-line separated record per survey", () => {
    const list = toHiPSList(
      [survey("LSSTCam/hips/ltl2/color_gri"), survey("HSC/hips/dud/color_gri")],
      BASE
    );

    // the leading comment names the server; the records follow
    expect(records(list)).toHaveLength(3);
    expect(records(list)[0]).toBe(`# HiPS list of ${BASE}`);
    expect(parseFields(records(list)[1]).obs_title).toBe(
      "LSSTCam ltl2 color_gri"
    );
  });

  it("gives every record the four mandatory properties (§5.2)", () => {
    const list = toHiPSList([survey("LSSTCam/hips/ltl2/color_gri")], BASE);
    const fields = parseFields(records(list)[1]);

    expect(fields.creator_did).toBe(
      "ivo://rubin.local/LSSTCam/hips/ltl2/color_gri"
    );
    expect(fields.hips_service_url).toBe(`${BASE}/LSSTCam/hips/ltl2/color_gri`);
    expect(fields.hips_status).toBe("private master unclonable");
    expect(fields.hips_release_date).toBe("2026-01-02T03:04Z");
  });

  it("passes through everything else the survey declares", () => {
    const list = toHiPSList([survey("HSC/hips/dud/color_gri")], BASE);
    const fields = parseFields(records(list)[1]);

    expect(fields.hips_order).toBe("11");
    expect(fields.hips_tile_format).toBe("webp png");
    expect(fields.hips_frame).toBe("equatorial");
  });

  it("keeps the dates the survey states rather than its file's mtime", () => {
    const source = `${example}hips_release_date = 2025-11-27T09:30Z\n`;
    const list = toHiPSList([survey("a/b", source)], BASE);

    expect(parseFields(records(list)[1]).hips_release_date).toBe(
      "2025-11-27T09:30Z"
    );
  });

  it("falls back to the creation date before the file's mtime", () => {
    const source = `${example}hips_creation_date = 2024-06-01T00:00Z\n`;
    const list = toHiPSList([survey("a/b", source)], BASE);

    expect(parseFields(records(list)[1]).hips_release_date).toBe(
      "2024-06-01T00:00Z"
    );
  });

  it("removes the blank lines inside a properties file", () => {
    // a blank line would otherwise split one survey's record into two
    const list = toHiPSList([survey("a/b")], BASE);

    expect(records(list)).toHaveLength(2);
    expect(list).not.toMatch(/\n[ \t]*\n[ \t]*\n/);
  });

  it("declares the server even when it has no surveys", () => {
    expect(toHiPSList([], BASE)).toBe(`# HiPS list of ${BASE}\n`);
  });
});

describe(toHiPSListJSON, () => {
  it("renders each record as a flat object of string values", () => {
    const [record] = toHiPSListJSON(
      [survey("LSSTCam/hips/ltl2/color_gri")],
      BASE
    );

    expect(record).toMatchObject({
      // the CDS aggregator's derived key: creator_did without its scheme
      ID: "rubin.local/LSSTCam/hips/ltl2/color_gri",
      creator_did: "ivo://rubin.local/LSSTCam/hips/ltl2/color_gri",
      hips_service_url: `${BASE}/LSSTCam/hips/ltl2/color_gri`,
      hips_status: "private master unclonable",
      hips_release_date: "2026-01-02T03:04Z",
      obs_title: "LSSTCam ltl2 color_gri",
      // strings, not numbers — the properties file's own spelling, and what
      // the service the standard footnotes emits
      hips_order: "11",
    });
  });

  it("says exactly what the text form says", () => {
    const surveys = [survey("a/b"), survey("c/d")];
    const json = toHiPSListJSON(surveys, BASE);

    // ID aside, the two renderings must not be able to disagree
    records(toHiPSList(surveys, BASE))
      .slice(1)
      .forEach((record, index) => {
        expect(parseFields(record)).toEqual(
          Object.fromEntries(
            Object.entries(json[index]).filter(([key]) => key !== "ID")
          )
        );
      });
  });

  it("is an empty list when no survey is staged", () => {
    expect(toHiPSListJSON([], BASE)).toEqual([]);
  });
});

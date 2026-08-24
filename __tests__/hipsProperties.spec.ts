import { describe, expect, it } from "vitest";
import {
  parseHiPSProperties,
  withFields,
  withUniqueCreatorDid,
} from "@/lib/hips/properties";

// trimmed from an actual survey under /sdf/group/rubin/shared/hips_views
const example = `
creator_did          = ivo://CDS/P/rubin/ltl2/color_gri
obs_title            = LSSTCam ltl2 color_gri
dataproduct_type     = image
hips_order            = 11
hips_order_min       = 3
hips_tile_width      = 512
hips_tile_format     = webp png
hips_frame           = equatorial
hips_initial_ra      = 270.549316406
hips_initial_dec     = -22.8718847973
hips_initial_fov     = 0.0286290534318
# a comment line
`;

describe(parseHiPSProperties, () => {
  it("reads the fields the viewer needs", () => {
    const result = parseHiPSProperties(example);

    expect(result).toEqual({
      maxOrder: 11,
      minOrder: 3,
      tileSize: 512,
      imgFormat: "webp",
      cooFrame: "equatorial",
      title: "LSSTCam ltl2 color_gri",
      initialRa: 270.549316406,
      initialDec: -22.8718847973,
      initialFov: 0.0286290534318,
    });
  });

  it("prefers a format the viewer can draw over the first one listed", () => {
    // fits is listed first but aladin cannot draw it as a base survey here
    const result = parseHiPSProperties("hips_tile_format = fits png");

    expect(result.imgFormat).toBe("png");
  });

  it("accepts jpg as a spelling of jpeg", () => {
    const result = parseHiPSProperties("hips_tile_format = jpg");

    expect(result.imgFormat).toBe("jpeg");
  });

  it("leaves absent fields undefined rather than guessing", () => {
    // hips_order_min is routinely omitted, which is why the fork forces a floor
    const result = parseHiPSProperties("hips_order = 9");

    expect(result.maxOrder).toBe(9);
    expect(result.minOrder).toBeUndefined();
    expect(result.imgFormat).toBeUndefined();
  });

  it("ignores comments, blank lines and unparseable values", () => {
    const result = parseHiPSProperties(
      "# hips_order = 4\n\nhips_order = nope\nhips_tile_width = 7\n"
    );

    expect(result.maxOrder).toBeUndefined();
    expect(result.tileSize).toBeUndefined();
  });

  it("reads exponent-form numbers, which these files use", () => {
    const result = parseHiPSProperties("hips_initial_fov = 2.86e-02");

    expect(result.initialFov).toBeCloseTo(0.0286);
  });

  it("keeps values containing an equals sign intact", () => {
    const result = parseHiPSProperties(
      "obs_title = a = b\nhips_frame = galactic"
    );

    expect(result.title).toBe("a = b");
    expect(result.cooFrame).toBe("galactic");
  });
});

describe(withFields, () => {
  it("replaces in place and adds what is missing, in the order given", () => {
    const result = withFields("hips_order = 9\nobs_title = a\n", {
      obs_title: "b",
      hips_status: "private master unclonable",
      hips_service_url: "https://example.org/a/b",
    });

    expect(result.split("\n").map((line) => line.split(/\s*=/)[0])).toEqual([
      "hips_status",
      "hips_service_url",
      "hips_order",
      "obs_title",
      "",
    ]);
    expect(parseHiPSProperties(result).title).toBe("b");
  });
});

describe(withUniqueCreatorDid, () => {
  it("replaces the existing creator_did and nothing else", () => {
    const result = withUniqueCreatorDid(example, "ivo://rubin.local/a/b");

    expect(result).toContain(
      "creator_did              = ivo://rubin.local/a/b"
    );
    expect(result).not.toContain("ivo://CDS/P/rubin/ltl2");
    // the rest of the file is untouched
    expect(parseHiPSProperties(result)).toEqual(parseHiPSProperties(example));
  });

  it("adds a creator_did when the file has none", () => {
    const result = withUniqueCreatorDid("hips_order = 9\n", "ivo://x/y");

    expect(result).toContain("creator_did              = ivo://x/y");
    expect(parseHiPSProperties(result).maxOrder).toBe(9);
  });
});

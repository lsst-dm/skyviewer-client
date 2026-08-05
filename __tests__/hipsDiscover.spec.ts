import { mkdtemp, mkdir, writeFile, symlink, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discoverSurveys } from "@/lib/hips/discover";

let root: string;

const survey = async (relative: string, body = "hips_order = 11\n") => {
  await mkdir(join(root, relative), { recursive: true });
  await writeFile(join(root, relative, "properties"), body);
};

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "hips-discover-"));

  // the instrument collections: survey at <instrument>/hips/<dataset>/<band>
  await survey("LSSTCam/hips/ltl2/color_gri");
  await survey("LSSTCam/hips/ltl49/color_ugir", "hips_order = 9\n");
  await survey("HSC/hips/dud/color_gri");

  // a user collection at a depth nobody declared in advance
  await survey("u/yusra/DM-54165/DM-54125-hips/color_gri");

  // tile directories below a survey root must not be walked into or reported
  await mkdir(join(root, "LSSTCam/hips/ltl2/color_gri/Norder3/Dir0"), {
    recursive: true,
  });
  await writeFile(
    join(root, "LSSTCam/hips/ltl2/color_gri/Norder3/Dir0/properties"),
    "hips_order = 11\n"
  );

  // a directory that merely looks like a collection but holds no survey
  await mkdir(join(root, "LSSTCam/runs/empty"), { recursive: true });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe(discoverSurveys, () => {
  it("finds surveys wherever they sit, not at a fixed depth", async () => {
    const result = await discoverSurveys(root);

    expect(result.map(({ path }) => path)).toEqual([
      "HSC/hips/dud/color_gri",
      "LSSTCam/hips/ltl2/color_gri",
      "LSSTCam/hips/ltl49/color_ugir",
      "u/yusra/DM-54165/DM-54125-hips/color_gri",
    ]);
  });

  it("stops at a survey root rather than descending into its tiles", async () => {
    const result = await discoverSurveys(root);

    expect(result.filter(({ path }) => path.includes("Norder"))).toHaveLength(
      0
    );
  });

  it("groups by the first path segment and labels by the rest", async () => {
    const result = await discoverSurveys(root);
    const user = result.find(({ group }) => group === "u");

    expect(user?.label).toBe("yusra/DM-54165/DM-54125-hips/color_gri");
  });

  it("reads each survey's own properties", async () => {
    const result = await discoverSurveys(root);

    expect(
      result.find(({ path }) => path.endsWith("ltl49/color_ugir"))?.properties
        .maxOrder
    ).toBe(9);
  });

  it("ignores directories that contain no survey", async () => {
    const result = await discoverSurveys(root);

    expect(result.some(({ path }) => path.includes("runs"))).toBe(false);
  });

  it("respects the depth bound", async () => {
    // the instrument surveys sit at depth 4; the user one at 5, so it drops
    const result = await discoverSurveys(root, 4);

    expect(result.map(({ path }) => path)).toEqual([
      "HSC/hips/dud/color_gri",
      "LSSTCam/hips/ltl2/color_gri",
      "LSSTCam/hips/ltl49/color_ugir",
    ]);
  });

  it("visits a symlinked tree once and does not loop", async () => {
    await symlink(join(root, "HSC"), join(root, "HSC-link"));
    await symlink(root, join(root, "self"));

    const result = await discoverSurveys(root);

    // HSC is reachable twice but reported once, and the self-link terminates
    expect(
      result.filter(({ path }) => path.includes("dud/color_gri"))
    ).toHaveLength(1);
  });
});

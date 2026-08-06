import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiscoveredSurvey } from "@/lib/hips/discover";

const HIPS_DATA_DIR = "/mirror";
const TTL_MS = 5 * 60 * 1000;

const survey = (path: string): DiscoveredSurvey => ({
  path,
  group: path.split("/")[0],
  label: path,
  properties: { maxOrder: 11 },
  source: "hips_order = 11\n",
  modifiedAt: 0,
});

/** a scan the test decides when to finish */
const deferred = () => {
  let release: (surveys: Array<DiscoveredSurvey>) => void = () => {};

  const promise = new Promise<Array<DiscoveredSurvey>>((resolve) => {
    release = resolve;
  });

  return { promise, release };
};

/**
 * Loads a fresh copy of the module under test.
 *
 * It caches in module scope and starts a scan when it loads, so every test
 * needs its own instance rather than a shared one carrying the last test's
 * catalogue.
 */
const load = async (
  discoverSurveys: () => Promise<Array<DiscoveredSurvey>>,
  env: Record<string, string | undefined> = { HIPS_DATA_DIR }
) => {
  vi.resetModules();
  vi.doMock("@/env", () => ({ env }));
  vi.doMock("@/lib/hips/discover", () => ({ discoverSurveys }));

  return import("@/lib/hips/local");
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("@/env");
  vi.doUnmock("@/lib/hips/discover");
});

describe("getSurveyCatalogue", () => {
  it("shares one scan between the boot warm and every waiting caller", async () => {
    // a cold scan is minutes of small reads off a shared filesystem, so
    // requests arriving during it must join it rather than each start one
    const scan = deferred();
    const discoverSurveys = vi.fn(() => scan.promise);
    const { getSurveyCatalogue } = await load(discoverSurveys);

    const waiting = Promise.all([
      getSurveyCatalogue(),
      getSurveyCatalogue(),
      getSurveyCatalogue(),
    ]);

    scan.release([survey("LSSTCam/hips/ltl2/color_gri")]);

    for (const result of await waiting) {
      expect(result.map(({ path }) => path)).toEqual([
        "LSSTCam/hips/ltl2/color_gri",
      ]);
    }

    expect(discoverSurveys).toHaveBeenCalledTimes(1);
  });

  it("serves the cached list without rescanning until it goes stale", async () => {
    vi.spyOn(Date, "now").mockReturnValue(0);

    const discoverSurveys = vi.fn(async () => [survey("HSC/hips/dud/color")]);
    const { getSurveyCatalogue } = await load(discoverSurveys);

    await getSurveyCatalogue();
    await getSurveyCatalogue();

    expect(discoverSurveys).toHaveBeenCalledTimes(1);
  });

  it("refreshes behind the request rather than blocking on a rescan", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(0);
    const refresh = deferred();
    const discoverSurveys = vi
      .fn()
      .mockResolvedValueOnce([survey("HSC/hips/dud/color")])
      .mockReturnValueOnce(refresh.promise);

    const { getSurveyCatalogue } = await load(discoverSurveys);

    expect(await getSurveyCatalogue()).toHaveLength(1);

    clock.mockReturnValue(TTL_MS + 1);

    // the stale list comes back straight away even though the rescan that
    // this call kicked off has not finished — and would not, here, until the
    // test lets it
    expect((await getSurveyCatalogue()).map(({ path }) => path)).toEqual([
      "HSC/hips/dud/color",
    ]);
    expect(discoverSurveys).toHaveBeenCalledTimes(2);

    refresh.release([survey("HSC/hips/dud/color"), survey("LSSTCam/hips/a/b")]);
    await refresh.promise;

    expect((await getSurveyCatalogue()).map(({ path }) => path)).toEqual([
      "HSC/hips/dud/color",
      "LSSTCam/hips/a/b",
    ]);
    // the stale read started the only extra scan there was
    expect(discoverSurveys).toHaveBeenCalledTimes(2);
  });

  it("does not scan at all when no mirror is configured", async () => {
    const discoverSurveys = vi.fn(async () => []);
    const { getSurveyCatalogue } = await load(discoverSurveys, {});

    expect(await getSurveyCatalogue()).toEqual([]);
    expect(discoverSurveys).not.toHaveBeenCalled();
  });
});

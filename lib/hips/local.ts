"server-only";

import { readFile } from "fs/promises";
import { join } from "path";
import { env } from "@/env";
import { withBasePath } from "@/lib/basePath";
import { SurveyLayer } from "@/lib/schema/survey";
import { HiPSProperties, parseHiPSProperties } from "@/lib/hips/properties";
import { DiscoveredSurvey, discoverSurveys } from "@/lib/hips/discover";

/** what the CMS would supply for a survey it knows about, for the fields a
 * HiPS `properties` file does not carry */
const defaults = {
  fovRange: [2, 90],
  fov: 60,
  target: "267.0208333333 -24.7800000000",
  imgFormat: "png" as HiPSImageFormat,
  cooFrame: "ICRS" as CooFrame,
  maxOrder: 11,
  tileSize: 512 as TileSize,
};

/**
 * Scanning the tree means a readdir per directory over a shared filesystem,
 * and the result changes only when someone stages a new survey, so hold it
 * for a while rather than repeating it on every page view.
 */
const CATALOGUE_TTL_MS = 5 * 60 * 1000;

let catalogue: { at: number; surveys: DiscoveredSurvey[] } | null = null;

/** the scan in progress, if any */
let scanning: Promise<DiscoveredSurvey[]> | null = null;

/**
 * Runs a scan, or joins the one already running.
 *
 * Single-flight because a cold scan is slow enough to overlap with itself
 * many times over: the walk is half a second, but reading each survey's
 * `properties` costs a few hundred milliseconds per file the first time the
 * shared filesystem is asked for it, which is minutes across the whole
 * mirror. Without this, every request arriving during that window would
 * start its own full scan.
 */
const scan = (root: string): Promise<DiscoveredSurvey[]> => {
  scanning ??= discoverSurveys(root)
    .then((surveys) => {
      catalogue = { at: Date.now(), surveys };

      return surveys;
    })
    .finally(() => {
      scanning = null;
    });

  return scanning;
};

/**
 * Every survey staged under HIPS_DATA_DIR, cached briefly.
 *
 * Empty when no mirror is configured, which is what makes the CMS surveys
 * the ones that get used.
 */
export const getSurveyCatalogue = async (): Promise<DiscoveredSurvey[]> => {
  const { HIPS_DATA_DIR } = env;

  if (!HIPS_DATA_DIR) {
    return [];
  }

  // nothing scanned yet, so there is no choice but to wait — but on the scan
  // already started at boot, not a new one
  if (!catalogue) {
    return scan(HIPS_DATA_DIR);
  }

  if (Date.now() - catalogue.at >= CATALOGUE_TTL_MS) {
    // refresh behind the request rather than in front of it: the list only
    // changes when someone stages a survey, so a few minutes stale is a much
    // better answer than a page that hangs for the length of a cold scan
    scan(HIPS_DATA_DIR).catch(() => {
      // an unreadable mirror leaves the previous catalogue in place
    });
  }

  return catalogue.surveys;
};

/** builds the viewer's layer for one survey found on disk */
const toLayer = (path: string, properties: HiPSProperties): SurveyLayer => {
  // these surveys cover a tiny fraction of the sky, so the CMS's default
  // target and 60 degree field would open on empty sky. The survey says
  // where to look; only fall back when it does not
  const { initialRa, initialDec, initialFov } = properties;

  const target =
    initialRa !== undefined && initialDec !== undefined
      ? `${initialRa} ${initialDec}`
      : defaults.target;

  const fov = initialFov ?? defaults.fov;

  // the default 2 degree floor would stop the viewer zooming anywhere near a
  // survey a few hundredths of a degree across, so let it go well inside the
  // suggested field
  const fovRange = [
    Math.min(defaults.fovRange[0], fov / 4),
    defaults.fovRange[1],
  ];

  return {
    id: path,
    survey: {
      ...defaults,
      target,
      fov,
      fovRange,
      opacity: 1,
      // the only survey on show: it must not be hideable, and must be drawn
      optionalLayer: false,
      showOnLoad: true,
      id: path,
      title: properties.title ?? path,
      description: null,
      path: withBasePath(`/api/hips/${path}`),
      imgFormat: properties.imgFormat ?? defaults.imgFormat,
      cooFrame: properties.cooFrame ?? defaults.cooFrame,
      maxOrder: properties.maxOrder ?? defaults.maxOrder,
      tileSize: properties.tileSize ?? defaults.tileSize,
    },
  };
};

/** the survey-bearing shape the explorer, embed and skysynth services all
 * produce */
interface PageWithSurveys {
  surveys: SurveyLayer[];
  target: string;
  fov: number;
  fovRange: number[];
}

/**
 * Swaps a page's CMS surveys for the chosen local one, when one is
 * configured.
 *
 * The viewer's opening position comes from these page-level values, not from
 * the survey, so the survey's own initial position (read from its properties
 * file) is hoisted up too — otherwise the CMS entry's target wins and every
 * local survey opens on the same empty patch of sky.
 */
export const withLocalSurvey = async <T extends PageWithSurveys>(
  page: T,
  requested?: string
): Promise<T> => {
  const local = await getLocalSurveyLayer(requested);

  if (!local) return page;

  return {
    ...page,
    surveys: [local],
    target: local.survey.target,
    fov: local.survey.fov,
    fovRange: local.survey.fovRange,
  };
};

/**
 * Resolves which local survey to show.
 *
 * Staff deployments serve private processings the CMS knows nothing about, so
 * its survey list cannot be used: its entries name public datasets
 * (`oceancosmosm18/color_gri` and so on) that do not exist in the mirror, and
 * every tile request would 404.
 *
 * `requested` comes from the URL, so it is untrusted and only honoured when
 * it matches a survey the scan actually found — which also rules out
 * traversal out of the mirror. Falls back to HIPS_SURVEY, then to the first
 * survey found, so a viewer always gets imagery rather than an empty sky.
 *
 * Returns null when nothing local is configured or nothing was found, leaving
 * the CMS surveys in place.
 */
export const getLocalSurveyLayer = async (
  requested?: string
): Promise<SurveyLayer | null> => {
  const { HIPS_DATA_DIR, HIPS_SURVEY } = env;

  if (!HIPS_DATA_DIR) {
    return null;
  }

  const surveys = await getSurveyCatalogue();

  const chosen =
    surveys.find(({ path }) => path === requested) ??
    surveys.find(({ path }) => path === HIPS_SURVEY) ??
    surveys[0];

  if (chosen) {
    return toLayer(chosen.path, chosen.properties);
  }

  // nothing was discovered, but an explicitly configured survey may still be
  // readable — a mirror holding a single survey at its root, say
  if (!HIPS_SURVEY) {
    return null;
  }

  try {
    const source = await readFile(
      join(HIPS_DATA_DIR, HIPS_SURVEY, "properties"),
      "utf8"
    );

    return toLayer(HIPS_SURVEY, parseHiPSProperties(source));
  } catch {
    return null;
  }
};

// Start scanning when the server starts rather than when the first page view
// asks, so that view waits on a scan already in flight instead of beginning
// one. It buys nothing on a warm filesystem cache and minutes on a cold one,
// which is what a freshly scheduled pod gets.
if (env.HIPS_DATA_DIR) {
  scan(env.HIPS_DATA_DIR).catch(() => {
    // a mirror that is not readable yet is retried on the first request
  });
}

"server-only";

import { readFile } from "fs/promises";
import { join } from "path";
import { env } from "@/env";
import { withBasePath } from "@/lib/basePath";
import { SurveyLayer } from "@/lib/schema/survey";
import { HiPSProperties, parseHiPSProperties } from "@/lib/hips/properties";

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
 * Swaps a page's CMS surveys for the configured local one.
 *
 * The viewer's opening position comes from these page-level values, not from
 * the survey, so the survey's own initial position (read from its properties
 * file) is hoisted up too — otherwise the CMS entry's target wins and the
 * survey opens on an empty patch of sky.
 */
export const withLocalSurvey = async <T extends PageWithSurveys>(
  page: T
): Promise<T> => {
  const local = await getLocalSurveyLayer();

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
 * Resolves the local survey to show.
 *
 * Staff deployments serve private processings the CMS knows nothing about, so
 * its survey list cannot be used: its entries name public datasets
 * (`oceancosmosm18/color_gri` and so on) that do not exist in the mirror, and
 * every tile request would 404. HIPS_SURVEY names the survey to show instead.
 *
 * Returns null when nothing local is configured or the survey's `properties`
 * is unreadable, leaving the CMS surveys in place rather than rendering an
 * unexplained empty sky.
 */
export const getLocalSurveyLayer = async (): Promise<SurveyLayer | null> => {
  const { HIPS_DATA_DIR, HIPS_SURVEY } = env;

  if (!HIPS_DATA_DIR || !HIPS_SURVEY) {
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

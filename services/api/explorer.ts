"server-only";
import { z } from "zod/v4";
import { graphql } from "@/gql";
import queryAPI from "@/services/api/client";
import { siteFromLocale } from "@/lib/i18n/site";
import { surveyLayerSchema } from "@/lib/schema/survey";
import { withLocalSurvey } from "@/lib/hips/local";
import { ra, dec, fov } from "@/lib/schema/astro";

const explorerSchema = z
  .object({
    title: z.string().nullable(),
    ra,
    dec,
    fov,
    fovMin: fov,
    fovMax: fov,
    surveys: z.array(surveyLayerSchema),
  })
  .transform(({ fovMin, fovMax, ra, dec, ...output }) => {
    return {
      fovRange: [fovMin, fovMax],
      target: [ra, dec].join(" "),
      ...output,
    };
  });

export const getExplorerPage = async (locale: string) => {
  const site = siteFromLocale(locale);

  const Query = graphql(`
    query ExplorerPage($site: [String]) {
      explorerEntries(site: $site) {
        ... on explorer_explorer_Entry {
          title
          ra
          dec
          fov
          fovMin
          fovMax
          surveys {
            ...SurveyLayer
          }
        }
      }
    }
  `);

  const { data } = await queryAPI({
    query: Query,
    variables: {
      site: [site],
    },
  });

  if (!data || !data.explorerEntries) return;

  const page = explorerSchema.safeParse(data.explorerEntries[0])?.data;

  if (!page) return page;

  // a deployment pinned to a local HiPS shows that survey and nothing else:
  // the CMS list names public datasets absent from the mirror, so leaving it
  // in place would offer surveys whose every tile 404s
  return withLocalSurvey(page);
};

import { FC } from "react";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { env } from "@/env";
import AladinTemplate from "@/components/templates/Aladin";
import Controls from "@/components/molecules/ExplorerControls";
import { getExplorerPage } from "@/services/api/explorer";
import { getSurveyCatalogue } from "@/lib/hips/local";
import CurrentPositionPopover from "@/components/organisms/CurrentPositionPopover";
import AladinMenu from "@/components/organisms/AladinMenu";
import DisplayMenu from "@/components/organisms/AladinMenu/Display";
import SurveysMenu from "@/components/organisms/AladinMenu/Surveys";

interface ExplorerProps extends RootProps {
  searchParams?: { survey?: string };
}

const ExplorerPage: FC<ExplorerProps> = async ({
  params: { locale },
  searchParams,
}) => {
  setRequestLocale(locale);

  const [data, catalogue] = await Promise.all([
    getExplorerPage(locale, searchParams?.survey),
    getSurveyCatalogue(),
  ]);

  if (!data) {
    notFound();
  }

  const { surveys, fovRange, ...configuredOptions } = data;

  const properties = surveys.map(({ survey }) => {
    const absolute = survey.path.startsWith("http")
      ? survey.path
      : `${env.NEXT_PUBLIC_BASE_URL}${survey.path}`;
    const { pathname, origin } = new URL(absolute);

    return new URL(`${pathname}/properties`, origin).toString();
  });

  // the layer the page settled on, which is not necessarily the one asked
  // for: an unknown survey falls back rather than showing an empty sky.
  // Optional because the CMS can deliver an entry with no surveys at all,
  // which should render an empty viewer rather than crash the page
  const selected = surveys[0]?.id;

  return (
    <AladinTemplate
      menu={
        <AladinMenu backgroundColor="primary" {...{ properties, locale }}>
          {catalogue.length > 1 && (
            <SurveysMenu
              selected={selected}
              surveys={catalogue.map(({ path, properties }) => ({
                path,
                title: properties.title,
              }))}
            />
          )}
          <DisplayMenu layers={surveys} debug={env.CLOUD_ENV === "DEV"} />
        </AladinMenu>
      }
      fovRange={fovRange}
      layers={surveys}
      options={configuredOptions}
      initializeWithParams
    >
      <Controls />
      <CurrentPositionPopover />
    </AladinTemplate>
  );
};

export default ExplorerPage;

"use client";
import { FC, useState } from "react";
import { createPortal } from "react-dom";
import { IoMdGlobe } from "react-icons/io";
import clsx from "clsx/lite";
import { Trans, useTranslation } from "react-i18next";
import { useDebounceValue } from "usehooks-ts";
import { useAladin } from "@/contexts/Aladin";
import useAladinEvent from "@/hooks/useAladinEvent";
import IconButton from "@/components/atomic/IconButton";
import {
  EARTH_SURFACE_KM2,
  earthCenters,
  earthRegions,
  type EarthCenter,
  type EarthRegion,
} from "@/fixtures/earthScale";
import styles from "./styles.module.css";

const DEGREE = Math.PI / 180;
const FULL_SPHERE_SR = 4 * Math.PI;
const KM_PER_DEGREE = 111;

/**
 * The area the view would cover if the celestial sphere were the surface of
 * Earth: the viewed fraction of the sky times Earth's surface area. The view
 * is approximated as a fovX by fovY rectangle, clamped to the full sphere.
 */
const equivalentEarthAreaKm2 = (fovX: number, fovY: number) => {
  const solidAngle = Math.min(fovX * DEGREE * (fovY * DEGREE), FULL_SPHERE_SR);

  return (solidAngle / FULL_SPHERE_SR) * EARTH_SURFACE_KM2;
};

const closestRegion = (areaKm2: number): EarthRegion => {
  return earthRegions.reduce((best, region) => {
    const distance = Math.abs(Math.log(region.areaKm2 / areaKm2));
    const bestDistance = Math.abs(Math.log(best.areaKm2 / areaKm2));

    return distance < bestDistance ? region : best;
  });
};

/**
 * OpenStreetMap's embeddable map, anchored on the chosen center and framed so
 * the viewport shows exactly the equivalent Earth area: the map swaps in for
 * the sky at matching scale.
 */
const embedUrl = (center: EarthCenter, areaKm2: number, aspect: number) => {
  const widthKm = Math.sqrt(areaKm2 * aspect);
  const heightKm = Math.sqrt(areaKm2 / aspect);

  const dLat = Math.min(heightKm / KM_PER_DEGREE, 170);
  const dLon = Math.min(
    widthKm / (KM_PER_DEGREE * Math.cos(center.lat * DEGREE)),
    350
  );
  const south = Math.max(center.lat - dLat / 2, -85);
  const north = Math.min(center.lat + dLat / 2, 85);

  const bbox = [
    center.lon - dLon / 2,
    south,
    center.lon + dLon / 2,
    north,
  ].join(",");

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik`;
};

const formatArea = (areaKm2: number) => {
  return areaKm2.toLocaleString(undefined, { maximumSignificantDigits: 3 });
};

interface EarthScaleProps {
  className?: string;
}

const EarthScale: FC<EarthScaleProps> = ({ className }) => {
  const [active, setActive] = useState(false);
  const [center, setCenter] = useState<EarthCenter>(earthCenters[0]);
  const [fov, setFov] = useState<[number, number]>();
  // the iframe reloads on every src change, so follow the zoom at a delay
  const [mapFov, setMapFov] = useDebounceValue<[number, number] | undefined>(
    undefined,
    400
  );
  const { t } = useTranslation();

  const updateFov = (fovX: number, fovY: number) => {
    setFov([fovX, fovY]);
    setMapFov([fovX, fovY]);
  };

  const onLoaded: AdditionalAladinCallbacks["onLoaded"] = ({ aladin }) => {
    updateFov(...aladin.getFov());
  };

  const onZoomChanged = ({
    detail: { fovX, fovY },
  }: AladinEventMap["zoom.changed"]) => {
    updateFov(fovX, fovY);
  };

  useAladinEvent("zoom.changed", onZoomChanged);
  const { aladin } = useAladin({ callbacks: { onLoaded } });

  if (!fov || !aladin) return null;

  const [mapFovX, mapFovY] = mapFov ?? fov;
  const areaKm2 = equivalentEarthAreaKm2(mapFovX, mapFovY);
  const region = closestRegion(areaKm2);

  // rendered into the viewer wrapper so it covers the sky canvas exactly,
  // above it but beneath the controls overlay, in and out of fullscreen
  const wrapper = aladin.view.aladinDiv.parentElement;

  return (
    <>
      {active &&
        wrapper &&
        createPortal(
          <div className={styles.mapView} aria-live="polite">
            <iframe
              className={styles.map}
              src={embedUrl(center, areaKm2, mapFovX / mapFovY)}
              title={t("controls.earth_scale_map", { place: center.name })}
            />
            <div className={styles.caption}>
              <p className={styles.captionText}>
                <Trans
                  i18nKey="controls.earth_scale_caption"
                  values={{
                    place: region.name,
                    area: formatArea(region.areaKm2),
                  }}
                  shouldUnescape={true}
                >
                  At this scale your view of the sky would cover roughly
                  <strong>{region.name}</strong>
                  (~{formatArea(region.areaKm2)} km²)
                </Trans>
              </p>
              <div
                className={styles.centerPicker}
                role="group"
                aria-label={t("controls.earth_scale_centers")}
              >
                {earthCenters.map((option) => (
                  <button
                    key={option.id}
                    className={styles.centerButton}
                    aria-pressed={option.id === center.id}
                    onClick={() => setCenter(option)}
                  >
                    {option.name}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          wrapper
        )}
      <IconButton
        icon={<IoMdGlobe />}
        text={t("controls.earth_scale", {
          context: active ? "close" : "open",
        })}
        aria-pressed={active}
        onClick={() => setActive(!active)}
        className={clsx(active && styles.activeToggle, className)}
      />
    </>
  );
};

EarthScale.displayName = "Molecule.ExplorerControl.EarthScale";

export default EarthScale;

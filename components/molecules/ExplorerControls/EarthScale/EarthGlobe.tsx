"use client";
import { FC, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAladin } from "@/contexts/Aladin";
import staticAladinOptions from "@/fixtures/defaultAladinOptions";
import { earthHiPS, type EarthCenter } from "@/fixtures/earthScale";
import styles from "./styles.module.css";

interface EarthGlobeProps {
  /** whether the globe is wanted; it is built the first time it is */
  enabled: boolean;
  /** the sky view's horizontal field of view, in degrees */
  fov: number;
  /** where on Earth the globe is centered */
  center: EarthCenter;
  /** whether to draw a graticule, matching the sky view's coordinate grid */
  showGrid: boolean;
  /** the sky view's projection, so the two curve identically */
  projection: AladinProjection;
  className?: string;
}

/**
 * The Earth rendered by a second Aladin Lite instance, framed exactly as the
 * sky view is framed. Because the comparison maps the whole celestial sphere
 * onto the whole surface of Earth, matching the field of view degree for
 * degree also matches the area: the globe shows the same fraction of Earth
 * that the sky view shows of the sky, with the same curvature.
 */
const EarthGlobe: FC<EarthGlobeProps> = ({
  enabled,
  fov,
  center,
  showGrid,
  projection,
  className,
}) => {
  const { A } = useAladin();
  const node = useRef<HTMLDivElement>(null);
  const [globe, setGlobe] = useState<Aladin>();
  const { t } = useTranslation();

  // An Aladin Lite instance cannot be torn down: it holds a WebGL context and
  // an unconditional requestAnimationFrame loop for as long as the page lives.
  // Building one per visit to the comparison would run the browser out of
  // contexts, so it is built once, lazily, and then kept and reused.
  useEffect(() => {
    if (globe || !enabled || !A || !node.current) return;

    setGlobe(
      A.aladin(node.current, {
        ...staticAladinOptions,
        survey: earthHiPS.url,
        cooFrame: "ICRSd",
        target: `${center.lon} ${center.lat}`,
        projection,
        fov,
      })
    );
    // the field of view, centre and projection only seed the new instance
    // here; from then on the effects below keep them in step with the sky
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globe, enabled, A]);

  useEffect(() => {
    globe?.setProjection(projection);
  }, [globe, projection]);

  useEffect(() => {
    globe?.setFov(fov);
  }, [globe, fov]);

  useEffect(() => {
    globe?.gotoRaDec(center.lon, center.lat);
  }, [globe, center]);

  useEffect(() => {
    globe?.setCooGrid({ enabled: showGrid });
  }, [globe, showGrid]);

  return (
    <div className={className}>
      {/* Aladin puts its own classes on the element it is given and sizes it
          from that element's box, so it gets a plain one of its own to fill
          rather than the positioned wrapper. */}
      <div
        ref={node}
        className={styles.globeView}
        role="img"
        aria-label={t("controls.earth_scale_globe", { place: center.name })}
      />
    </div>
  );
};

EarthGlobe.displayName = "Molecule.ExplorerControl.EarthScale.EarthGlobe";

export default EarthGlobe;

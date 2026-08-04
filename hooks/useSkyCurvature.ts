"use client";

import { useEffect, useState } from "react";
import { useAladin } from "@/contexts/Aladin";
import useAladinEvent from "@/hooks/useAladinEvent";
import { isSkyCurved } from "@/lib/aladin/curvature";

/**
 * Whether the view is currently pulled back far enough that the sky reads as
 * the surface of a sphere rather than a flat picture. See
 * `lib/aladin/curvature.ts` for where the thresholds come from.
 */
const useSkyCurvature = (): boolean => {
  const { aladin, isLoading } = useAladin();
  const [isCurved, setCurved] = useState(false);

  const update = (fov: number) => {
    setCurved((wasCurved) => isSkyCurved(fov, wasCurved));
  };

  useAladinEvent("zoom.changed", ({ detail: { fovX } }) => update(fovX));

  useEffect(() => {
    if (!isLoading) {
      update(aladin.getFov()[0]);
    }
    // aladin only becomes readable when isLoading flips, and never changes after
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  return isCurved;
};

export default useSkyCurvature;

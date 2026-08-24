"use client";
import { FC, useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";
import { useAladin } from "@/contexts/Aladin";
import useAladinEvent from "@/hooks/useAladinEvent";
import {
  loadSkymap,
  SKYMAP_SOURCES,
  SKYMAP_STORAGE_KEY,
} from "@/lib/skymap/catalogue";
import {
  createSkymapOverlay,
  SkymapOverlay as Overlay,
} from "@/lib/skymap/overlay";

/**
 * Draws the selected skymap's tract grid, if any is selected.
 *
 * Headless, and mounted with the viewer rather than with the menu: the
 * slideout that holds the toggle is free to unmount, and the grid has to
 * keep following the view when it does. The two halves talk through
 * localStorage, which also means a chosen grid survives a reload.
 */
const SkymapOverlay: FC = () => {
  const [selected] = useLocalStorage<string | null>(SKYMAP_STORAGE_KEY, null);
  const { isLoading, aladin, A } = useAladin();
  const [overlay, setOverlay] = useState<Overlay | null>(null);

  useEffect(() => {
    const source = SKYMAP_SOURCES.find(({ id }) => id === selected);

    if (isLoading || !source) {
      return;
    }

    let controller: Overlay | undefined;
    let cancelled = false;

    loadSkymap(source)
      .then((skymap) => {
        // the dumps are megabytes; a toggle off mid-fetch must not draw
        if (cancelled) {
          return;
        }

        controller = createSkymapOverlay({ aladin, A, skymap });
        setOverlay(controller);
      })
      .catch((error) => {
        console.error(`Could not load skymap ${source.id}`, error);
      });

    return () => {
      cancelled = true;
      controller?.destroy();
      setOverlay(null);
    };
  }, [isLoading, selected]);

  useAladinEvent("position.changed", () => overlay?.update());
  useAladinEvent("zoom.changed", () => overlay?.update());

  return null;
};

SkymapOverlay.displayName = "Organism.Aladin.SkymapOverlay";

export default SkymapOverlay;

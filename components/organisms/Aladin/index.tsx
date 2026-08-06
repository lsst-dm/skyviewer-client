/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */
"use client";
import { useSearchParams } from "next/navigation";
import {
  FunctionComponent,
  PropsWithChildren,
  ReactNode,
  RefCallback,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocalStorage, useOnClickOutside } from "usehooks-ts";
import { withBasePath } from "@/lib/basePath";
import staticAladinOptions from "@/fixtures/defaultAladinOptions";
import { clientInitialPosition } from "@/lib/helpers";
import { forceHiPSMinOrder, tameWheelZoom } from "@/lib/aladin/helpers";
import { SurveyLayer } from "@/lib/schema/survey";
import AladinContext, { defaultValue } from "@/contexts/Aladin";
import styles from "./styles.module.css";

// Rubin HiPS only contain tiles for orders 3 and above (plus an order-3 Allsky
// preview), but their properties files do not declare hips_order_min. Without
// it, Aladin requests the non-existent order 0-2 tiles once zoomed out far
// enough and the imagery vanishes; declaring the minimum order makes Aladin
// fall back to the Allsky preview instead, so the covered sky stays visible at
// any zoom level.
const HIPS_MIN_ORDER = 3;

// FoV at which the whole celestial sphere fits comfortably in view, so the
// zoom can always pull back far enough to show the full sky regardless of the
// configured maximum.
const FULL_SKY_FOV = 360;

export interface AladinProps {
  menu?: ReactNode;
  fovRange?: Array<number>;
  options?: AladinOptions;
  disableInteraction?: boolean;
  initializeWithParams?: boolean;
  layers: Array<SurveyLayer>;
  debug?: boolean;
}

/** builds a HiPS for aladin from a survey layer; shared between the mount
 * initialization and the in-place survey swap on navigation */
const hipsFactory =
  (global: A, debug: boolean) =>
  (
    { path, maxOrder, imgFormat, tileSize }: SurveyLayer["survey"],
    { isBase = false } = {}
  ) => {
    const hips = global.HiPS(path, {
      maxOrder,
      imgFormat,
      tileSize,
      successCallback: () => {
        if (debug) {
          console.info("Loaded", path);
        }
      },
      errorCallback: () => {
        if (debug) {
          console.info("Error loading", path);
        }
      },
    });

    // Only the base layer falls back to the Allsky preview: the preview's
    // uncovered cells are opaque black (no alpha channel), which is
    // invisible against the black sky for the base but would black out
    // everything beneath an overlay.
    return isBase ? forceHiPSMinOrder(hips, HIPS_MIN_ORDER) : hips;
  };

export const Aladin: FunctionComponent<PropsWithChildren<AladinProps>> = ({
  children,
  fovRange,
  disableInteraction = false,
  initializeWithParams = false,
  options = {},
  layers,
  menu,
  debug = false,
}) => {
  const searchParams = useSearchParams();
  const zoomRange = fovRange && [fovRange[0], FULL_SKY_FOV];
  const position = clientInitialPosition({ searchParams, fovRange: zoomRange });

  const [savedAladinOptions, setSavedAladinOptions] =
    useLocalStorage<AladinOptions>("aladin-options", {
      cooFrame: staticAladinOptions.cooFrame,
    });

  const A = useRef<A | null>(null);
  const aladin = useRef<Aladin | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  /** which layers the aladin instance is showing, as survey paths — set
   * when initialization completes, compared on every render thereafter */
  const appliedSignature = useRef<string | null>(null);

  const [hasFocus, setFocus] = useState(false);
  const [isLoading, setLoading] = useState(true);

  // aladin initializes once on mount; navigating to another survey
  // re-renders this component with new layers but must swap them into the
  // existing instance through aladin's own API. (Remount-by-key from the
  // server page is not an option: an explicit key was observed serializing
  // as null in the flight payload, so client navigations never remounted.)
  const signature = layers.map(({ survey }) => survey.path).join("|");

  useEffect(() => {
    const instance = aladin.current;
    const global = A.current;

    if (
      isLoading ||
      !instance ||
      !global ||
      // initialization not finished, or nothing actually changed
      appliedSignature.current === null ||
      appliedSignature.current === signature
    ) {
      return;
    }

    appliedSignature.current = signature;

    const [base] = [...layers].reverse();

    if (!base) {
      return;
    }

    const createHiPS = hipsFactory(global, debug);

    instance.setBaseImageLayer(createHiPS(base.survey, { isBase: true }));

    // the new survey's own opening position, hoisted into the page options;
    // without moving there the swap leaves the viewer parked on the old
    // survey's — possibly empty — patch of sky
    const [ra, dec] = (options.target ?? "").split(" ").map(parseFloat);

    if (Number.isFinite(ra) && Number.isFinite(dec)) {
      instance.gotoRaDec(ra, dec);
    }

    if (typeof options.fov === "number") {
      instance.setFov(options.fov);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, isLoading]);

  const onFocus = () => {
    setFocus(true);
  };

  const onBlur = () => {
    setFocus(false);
  };

  useOnClickOutside(ref, onBlur);

  const onMounted = useCallback<RefCallback<HTMLDivElement>>((node) => {
    if (node) {
      if ("serviceWorker" in navigator) {
        // Serves already-seen HiPS tiles from the browser cache without the
        // revalidation round trip the tile server's cache-control demands;
        // see public/hips-tile-cache-sw.js. Purely an optimization, so
        // registration failures are ignored. The base path matters twice
        // over: registering at the wrong path 404s, and a worker registered
        // outside the app's path has too narrow a scope to see the tile
        // requests it exists to cache
        navigator.serviceWorker
          .register(withBasePath("/hips-tile-cache-sw.js"))
          .catch(() => {
            // noop
          });
      }

      import("aladin-lite").then((module) => {
        const global: A = module.default;

        // last layer is the base and the rest stack on top in reverse
        // order. Copy rather than mutate: the Display menu renders from
        // this same array, and re-renders after aladin loads — reversing
        // and splicing it in place made the menu re-draw against a
        // reordered list missing its base entry (empty, for a single
        // survey), so layers silently vanished from the menu
        const [base, ...overlays] = [...layers].reverse();

        global.init.then(() => {
          const createHiPS = hipsFactory(global, debug);

          const instance = global.aladin(node, {
            ...staticAladinOptions,
            ...savedAladinOptions,
            ...options,
            survey: createHiPS(base.survey, { isBase: true }),
            ...(initializeWithParams && position),
          });

          tameWheelZoom(instance);

          if (debug) {
            instance.on("layerChanged", (layer, stack, action) => {
              console.info({ layer, stack, action });
            });
          }

          if (zoomRange) {
            instance.setFoVRange(zoomRange[0], zoomRange[1]);
          }

          overlays.forEach(({ id, survey }) => {
            const { opacity, showOnLoad, optionalLayer } = survey;
            const hips = createHiPS(survey);

            let effectiveOpacity = opacity;
            if (optionalLayer) {
              effectiveOpacity = showOnLoad ? opacity : 0;
            }

            hips.setOpacity(effectiveOpacity);

            instance.setOverlayImageLayer(hips, id);
          });

          if (debug) {
            console.info(instance);
          }

          A.current = global;
          aladin.current = instance;
          ref.current = node;
          appliedSignature.current = signature;
          setLoading(false);
        });
      });
    }

    return () => {
      A.current = null;
      aladin.current = null;
      ref.current = null;
    };
    // exhaustively: debug, initializeWithParams, layers, options, position,
    // savedAladinOptions, signature, zoomRange. All of them are read to build
    // the instance once and must not re-run this: it is a ref callback, so a
    // new identity makes React call it with null and then the node again,
    // building a second aladin. Aladin instances cannot be destroyed (View
    // .redraw re-arms its own requestAnimationFrame and nothing releases the
    // WebGL context), so that leaks contexts until the browser refuses more.
    // Later changes go through the swap effect above instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveOptions = useCallback(
    (options: Partial<AladinOptions>) => {
      // merge through the updater rather than the captured value: this
      // callback is memoized on a stable setter, so it would keep merging
      // into the savedAladinOptions of the render that created it and drop
      // every option saved since
      setSavedAladinOptions((saved) => ({ ...saved, ...options }));
    },
    [setSavedAladinOptions]
  );

  const value = useMemo(() => {
    return isLoading || !aladin.current || !A.current
      ? defaultValue
      : {
          aladin: aladin.current,
          A: A.current,
          hasFocus,
          isLoading,
          saveOptions: handleSaveOptions,
        };
    // the refs are deliberately not dependencies — they are populated during
    // initialization, and isLoading flipping false is what republishes them
  }, [isLoading, hasFocus, handleSaveOptions]);

  return (
    <AladinContext.Provider value={value}>
      {menu}
      <div className={styles.aladinWrapper}>
        <div
          className={styles.aladin}
          data-loaded={!isLoading}
          data-allow-interaction={!disableInteraction}
          ref={onMounted}
          onFocus={onFocus}
          onClick={onFocus}
          onBlur={onBlur}
          role="presentation"
        />
        {children}
      </div>
    </AladinContext.Provider>
  );
};

Aladin.displayName = "Organism.Aladin";

export default Aladin;

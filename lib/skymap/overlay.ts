import { Skymap, tractsInView } from "./tracts";

export const SKYMAP_OVERLAY_NAME = "skymap-tracts";
export const SKYMAP_LABELS_NAME = "skymap-tract-labels";

/**
 * Widest field of view, in degrees, at which the grid is drawn.
 *
 * A tract is under two degrees across, so much past this the grid stops
 * being a grid and turns into a wash of overlapping lines — several
 * thousand polygons for no legible gain. Zoomed out further the overlay
 * simply hides itself.
 */
export const MAX_OVERLAY_FOV = 30;

const OVERLAY_COLOR = "#33c4ff";
const LINE_WIDTH = 1;
const LABEL_FONT = "11px sans-serif";
const LABEL_COLUMN = "tract";
// The label has to hang off a source, and a source draws a marker. 4 is the
// smallest dot aladin will build: its constructor caches every shape at this
// size up front, and the circle comes out with a negative radius below 4,
// throwing out of `A.catalog` before it returns.
const SOURCE_SIZE = 4;

export interface SkymapOverlay {
  /** redraw for the current view; cheap to call on every view event */
  readonly update: () => void;
  readonly destroy: () => void;
}

interface CreateSkymapOverlayProps {
  aladin: Aladin;
  A: A;
  skymap: Skymap;
  showLabels?: boolean;
}

/**
 * Draws a skymap's tract boundaries over the current view, keeping them in
 * step as it moves.
 *
 * Only the tracts that can reach the view are handed to aladin — the full
 * `lsst_cells_v2` grid is nearly nineteen thousand of them, and drawing the
 * ones behind you costs the same as drawing the ones in front.
 */
export const createSkymapOverlay = ({
  aladin,
  A,
  skymap,
  showLabels = true,
}: CreateSkymapOverlayProps): SkymapOverlay => {
  const overlay = A.graphicOverlay({
    name: SKYMAP_OVERLAY_NAME,
    color: OVERLAY_COLOR,
    lineWidth: LINE_WIDTH,
  });

  aladin.addOverlay(overlay);

  const labels = showLabels
    ? A.catalog({
        name: SKYMAP_LABELS_NAME,
        color: OVERLAY_COLOR,
        sourceSize: SOURCE_SIZE,
        shape: "circle",
        displayLabel: true,
        labelColumn: LABEL_COLUMN,
        labelColor: OVERLAY_COLOR,
        labelFont: LABEL_FONT,
      })
    : undefined;

  if (labels) {
    aladin.addCatalog(labels);
  }

  // what the overlay currently holds, so panning within the same set of
  // tracts does not rebuild every polygon on every mouse move
  let drawn: string | null = null;
  let frame: number | null = null;

  const clear = () => {
    overlay.removeAll();
    overlay.reportChange();
    labels?.clear();
  };

  const redraw = () => {
    const [fovX, fovY] = aladin.getFov();

    if (Math.max(fovX, fovY) > MAX_OVERLAY_FOV) {
      if (drawn !== null) {
        drawn = null;
        clear();
      }

      return;
    }

    const [ra, dec] = aladin.getRaDec();
    const visible = tractsInView(skymap, [ra, dec], Math.hypot(fovX, fovY) / 2);
    const signature = visible.map(({ id }) => id).join(",");

    if (signature === drawn) {
      return;
    }

    drawn = signature;
    clear();

    // four corners is the whole boundary: tract edges are great circles,
    // which is what aladin draws between vertices. See `Tract.vertices`.
    visible.forEach(({ vertices }) => {
      overlay.add(A.polygon(vertices, { color: OVERLAY_COLOR }));
    });

    overlay.reportChange();

    labels?.addSources(
      visible.map(({ id, centre: [tractRa, tractDec] }) =>
        A.source(tractRa, tractDec, { [LABEL_COLUMN]: `${id}` })
      )
    );
  };

  // view events fire per mouse move during a drag; coalescing to a frame
  // keeps the polygon rebuild off the critical path of the pan
  const update = () => {
    if (frame === null) {
      frame = requestAnimationFrame(() => {
        frame = null;
        redraw();
      });
    }
  };

  update();

  return {
    update,
    destroy: () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }

      clear();
      aladin.removeOverlay(overlay);

      if (labels) {
        aladin.removeOverlay(labels);
      }
    },
  };
};

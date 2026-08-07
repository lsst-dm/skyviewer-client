import { parseSkymap, Skymap } from "./tracts";
import { withBasePath } from "@/lib/basePath";

/**
 * The skymaps the viewer can overlay.
 *
 * One entry per dump under `public/skymaps/`. Adding a skymap is a run of
 * `scripts/dump-skymap-tracts.py` plus a line here — no survey needs to
 * know about it, and none of them claim to have been built on it.
 */
export interface SkymapSource {
  id: string;
  /** shown in the menu; the skymap's own name, not a friendly rename —
   * anyone reading tract numbers off this overlay needs to know exactly
   * which skymap produced them */
  label: string;
  path: string;
}

/** where the menu records the selected skymap, and where the overlay reads
 * it from; see components/organisms/Aladin/SkymapOverlay */
export const SKYMAP_STORAGE_KEY = "skymap-overlay";

export const SKYMAP_SOURCES: ReadonlyArray<SkymapSource> = [
  {
    id: "lsst_cells_v2",
    label: "lsst_cells_v2",
    path: "/skymaps/lsst_cells_v2.json",
  },
];

/** Parsed skymaps, kept for the life of the page: the dumps are a couple of
 * megabytes each and toggling the overlay should not refetch one. Promises
 * rather than values, so two toggles in quick succession share a request. */
const loaded = new Map<string, Promise<Skymap>>();

export const loadSkymap = ({ id, path }: SkymapSource): Promise<Skymap> => {
  const cached = loaded.get(id);

  if (cached) {
    return cached;
  }

  const request = fetch(withBasePath(path))
    .then((response) => {
      if (!response.ok) {
        throw new Error(`skymap ${id} returned ${response.status}`);
      }

      return response.json();
    })
    .then(parseSkymap)
    .catch((error) => {
      // let a failed load be retried rather than caching the rejection
      loaded.delete(id);

      throw error;
    });

  loaded.set(id, request);

  return request;
};

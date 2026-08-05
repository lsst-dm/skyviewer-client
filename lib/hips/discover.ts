"server-only";

import { readdir, readFile, realpath } from "fs/promises";
import { join, sep } from "path";
import { HiPSProperties, parseHiPSProperties } from "@/lib/hips/properties";

/** a HiPS found on disk, identified by its path relative to the scan root */
export interface DiscoveredSurvey {
  /** path relative to the scan root, e.g. "LSSTCam/hips/ltl2/color_gri" */
  path: string;
  /** first path segment, e.g. "LSSTCam" or "u" — what the surveys are
   * grouped under in the picker */
  group: string;
  /** the rest of the path, which is what distinguishes surveys in a group */
  label: string;
  properties: HiPSProperties;
}

/**
 * How deep to look for surveys.
 *
 * The tree is not uniform: the instrument collections put surveys at
 * `<instrument>/hips/<dataset>/<band>`, but user collections under `u/` are
 * whatever depth their owner chose, e.g.
 * `u/yusra/DM-54165/DM-54125-hips/color_gri`. Scanning to a fixed depth would
 * miss those, so the walk keys on the `properties` file and just needs a
 * bound to stop it descending a mistakenly large tree forever.
 *
 * Counted in path segments: a survey at `a/b/c/d` needs a depth of at least
 * 4 to be found. The instrument collections sit at 4 and the user ones
 * deeper, so this default has room for a couple of levels beyond what is
 * there today.
 */
const DEFAULT_MAX_DEPTH = 6;

/** directories that cannot contain a survey root and are expensive to walk:
 * a HiPS holds thousands of tiles under its Norder directories */
const SKIP = /^(Norder\d+|Allsky.*|\..*)$/;

interface WalkContext {
  root: string;
  maxDepth: number;
  found: DiscoveredSurvey[];
  /** real paths already walked, so symlinked or cyclic trees are visited once */
  seen: Set<string>;
}

const toSurvey = (
  relative: string,
  properties: HiPSProperties
): DiscoveredSurvey => {
  const [group, ...rest] = relative.split(sep);

  return {
    path: relative,
    group,
    // a survey directly under the root has no remainder to distinguish it
    label: rest.length ? rest.join(sep) : group,
    properties,
  };
};

const walk = async (
  context: WalkContext,
  relative: string,
  depth: number
): Promise<void> => {
  const absolute = relative ? join(context.root, relative) : context.root;

  let canonical: string;

  try {
    canonical = await realpath(absolute);
  } catch {
    return;
  }

  if (context.seen.has(canonical)) {
    return;
  }

  context.seen.add(canonical);

  let entries;

  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch {
    // an unreadable directory is not fatal: the rest of the tree still lists
    return;
  }

  // `properties` marks a HiPS root. Surveys do not nest, so stop here rather
  // than descending into the tile directories below
  if (entries.some((entry) => entry.name === "properties" && entry.isFile())) {
    try {
      const source = await readFile(join(absolute, "properties"), "utf8");

      context.found.push(toSurvey(relative, parseHiPSProperties(source)));
    } catch {
      // readable a moment ago, not now — skip it rather than failing the scan
    }

    return;
  }

  if (depth >= context.maxDepth) {
    return;
  }

  await Promise.all(
    entries
      .filter(
        (entry) =>
          (entry.isDirectory() || entry.isSymbolicLink()) &&
          !SKIP.test(entry.name)
      )
      .map((entry) => walk(context, join(relative, entry.name), depth + 1))
  );
};

/**
 * Finds every HiPS below `root`, identified by the `properties` file at a
 * survey root rather than by position in the tree.
 *
 * Returns them sorted by path so the picker's order is stable between scans;
 * `readdir` order is not.
 */
export const discoverSurveys = async (
  root: string,
  maxDepth: number = DEFAULT_MAX_DEPTH
): Promise<DiscoveredSurvey[]> => {
  const context: WalkContext = { root, maxDepth, found: [], seen: new Set() };

  await walk(context, "", 0);

  return context.found.sort((a, b) => a.path.localeCompare(b.path));
};

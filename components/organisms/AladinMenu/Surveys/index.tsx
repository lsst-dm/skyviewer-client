"use client";
import { FC, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IoIosImages } from "react-icons/io";
import Submenu from "../Submenu";
import styles from "./styles.module.css";

/** the shape the page passes down, kept to what the picker renders so the
 * whole properties record is not serialised into the client bundle. Every
 * field here is paid for more than a thousand times over, so the headings and
 * the per-survey labels are both derived from `path` rather than sent */
export interface SurveyChoice {
  path: string;
  title?: string;
  /** the tile format this survey is served as, from its `hips_tile_format`.
   * Worth the bytes: the staged surveys are a mix of png and webp, the two
   * are indistinguishable once drawn, and which one a survey got is the
   * first thing asked about a new staging */
  format?: HiPSImageFormat;
}

interface SurveysMenuProps {
  surveys: Array<SurveyChoice>;
  selected?: string;
}

/** A survey collection, named by the path segments its surveys share. */
interface Collection {
  name: string;
  surveys: Array<SurveyChoice>;
}

/**
 * How many surveys a collection may hold before it is split a level deeper.
 *
 * Loose on purpose: splitting is not free either, and a tighter bound trades
 * one long list for a wall of two-entry headings — at 60 the mirror breaks
 * into 414 collections, 168 of them holding a single survey, against 319 and
 * 92 here.
 */
const MAX_COLLECTION = 100;

/** what distinguishes a survey within its collection: the rest of its path */
const within = (path: string, collection: string): string =>
  path.startsWith(`${collection}/`) ? path.slice(collection.length + 1) : path;

/**
 * Splits surveys into collections named by their first `depth` path segments.
 *
 * A survey with nothing to spare below the split point is named by its parent
 * instead, so a survey never ends up as a collection of one holding itself.
 */
const split = (
  surveys: Array<SurveyChoice>,
  depth: number
): Map<string, Array<SurveyChoice>> => {
  const collections = new Map<string, Array<SurveyChoice>>();

  for (const survey of surveys) {
    const segments = survey.path.split("/");
    const name = segments
      .slice(0, Math.min(depth, segments.length - 1) || 1)
      .join("/");

    collections.set(name, [...(collections.get(name) ?? []), survey]);
  }

  return collections;
};

/**
 * Groups surveys for the picker, subdividing anything too long to scan.
 *
 * The tree is lopsided, so no single split depth works: two segments leaves
 * `LSSTCam/hips` holding hundreds while `LSSTCam/filtered` holds four, and
 * one user owns more surveys than every instrument collection combined.
 * Splitting only where a collection is oversized keeps the shallow parts of
 * the tree shallow and pushes the crowded parts apart.
 *
 * Terminates because `depth` rises towards the longest path in the set;
 * surveys sharing every segment stay together however many of them there are.
 */
const groupSurveys = (
  surveys: Array<SurveyChoice>,
  depth = 2
): Array<Collection> =>
  Array.from(split(surveys, depth), ([name, entries]): Array<Collection> => {
    const deepest = Math.max(
      ...entries.map(({ path }) => path.split("/").length)
    );

    if (entries.length <= MAX_COLLECTION || depth >= deepest) {
      return [{ name, surveys: entries }];
    }

    const deeper = groupSurveys(entries, depth + 1);

    // a split that separated nothing only lengthens the heading
    return deeper.length > 1 ? deeper : [{ name, surveys: entries }];
  })
    .flat()
    .sort((a, b) => a.name.localeCompare(b.name));

const SurveysMenu: FC<SurveysMenuProps> = ({ surveys, selected }) => {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  // switching surveys is a server round trip followed by a full viewer
  // remount, and until the new page commits the old one stays on screen
  // untouched — seconds of apparent dead air after a click. The transition
  // tracks exactly that window so the UI can say so
  const [isPending, startTransition] = useTransition();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => {
    // picking the already-active survey (or one that resolves to it) commits
    // without remounting, so nothing clears the marker for us
    if (!isPending) {
      setPendingPath(null);
    }
  }, [isPending]);

  const collections = useMemo(() => {
    const needle = filter.trim().toLowerCase();

    // match on the full path so a user name, a ticket number or a band all
    // narrow the list, which is the only way to find one of several hundred,
    // and on the format so "webp" lists everything staged in it
    const matching = needle
      ? surveys.filter(({ path, title, format }) =>
          `${path} ${title ?? ""} ${format ?? ""}`
            .toLowerCase()
            .includes(needle)
        )
      : surveys;

    return groupSurveys(matching);
  }, [surveys, filter]);

  const choose = (path: string) => {
    if (isPending) {
      return;
    }

    setPendingPath(path);

    // only the survey goes in the address: anything else lingering there —
    // in particular the target and fov the viewer reads back — belongs to
    // the previous survey, and carrying it over pins every survey to the
    // same patch of sky instead of each opening at its own initial position
    const params = new URLSearchParams({ survey: path });

    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  };

  // the overlay names the survey being loaded by its path, which is what the
  // user just clicked and what the address bar is about to show
  const pendingLabel = pendingPath;

  // grouping never drops entries, so the collections' tally is the number
  // of surveys that matched the filter
  const shown = collections.reduce((n, c) => n + c.surveys.length, 0);

  return (
    <Submenu title="Surveys" cta="Choose a survey" icon={<IoIosImages />}>
      <div className={styles.picker}>
        <input
          type="search"
          className={styles.filter}
          value={filter}
          onChange={({ target }) => setFilter(target.value)}
          placeholder="Filter surveys"
          aria-label="Filter surveys"
        />
        <p className={styles.count}>
          {shown === surveys.length
            ? `${surveys.length} surveys`
            : `${shown} of ${surveys.length} surveys`}
        </p>
        {collections.map(({ name, surveys: entries }) => (
          <details
            key={name}
            className={styles.collection}
            // keep the collection holding the current survey open, and open
            // everything while filtering so matches are not hidden
            open={
              filter.trim().length > 0 ||
              entries.some(({ path }) => path === selected)
            }
          >
            <summary className={styles.summary}>
              {name} <span className={styles.tally}>{entries.length}</span>
            </summary>
            <ul className={styles.list}>
              {entries.map(({ path, title, format }) => (
                <li key={path}>
                  <button
                    type="button"
                    className={styles.survey}
                    aria-current={path === selected}
                    data-pending={path === pendingPath}
                    onClick={() => choose(path)}
                    title={path}
                  >
                    {/* the path-derived label leads because it is unique:
                        re-stagings of a survey share their obs_title, so a
                        title-first list shows runs of identical rows. Only
                        the part below the heading, which is already on
                        screen a few pixels above */}
                    {within(path, name)}
                    {format && (
                      <span
                        className={styles.format}
                        // the visible text is lowercase for the eye; the
                        // label spells out what it is for a screen reader
                        aria-label={`${format} tiles`}
                      >
                        {format}
                      </span>
                    )}
                    {title && <span className={styles.obsTitle}>{title}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        ))}
        {collections.length === 0 && (
          <p className={styles.count}>No surveys match.</p>
        )}
      </div>
      {isPending &&
        pendingLabel &&
        // portaled: the slideout menu is transformed, which would trap a
        // fixed-position child inside it instead of covering the viewport
        createPortal(
          <div className={styles.loadingOverlay} role="status">
            <span className={styles.spinner} aria-hidden="true" />
            <p className={styles.loadingLabel}>Loading {pendingLabel}…</p>
          </div>,
          document.body
        )}
    </Submenu>
  );
};

SurveysMenu.displayName = "Organism.Menu.Surveys";

export default SurveysMenu;

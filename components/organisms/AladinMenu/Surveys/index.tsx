"use client";
import { FC, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { IoIosImages } from "react-icons/io";
import Submenu from "../Submenu";
import styles from "./styles.module.css";

/** the shape the page passes down, kept to what the picker renders so the
 * whole properties record is not serialised into the client bundle */
export interface SurveyChoice {
  path: string;
  group: string;
  label: string;
  title?: string;
}

interface SurveysMenuProps {
  surveys: Array<SurveyChoice>;
  selected?: string;
}

/**
 * A survey collection, and the surveys in it.
 *
 * The user collections hold the overwhelming majority of surveys and are
 * grouped per user rather than lumped under one "u" heading, which would put
 * a hundred-odd entries behind a single control.
 */
interface Collection {
  name: string;
  surveys: Array<SurveyChoice>;
}

const collectionOf = ({ group, label }: SurveyChoice): string =>
  group === "u" ? `u/${label.split("/")[0]}` : group;

const groupSurveys = (surveys: Array<SurveyChoice>): Array<Collection> => {
  const collections = new Map<string, Array<SurveyChoice>>();

  for (const survey of surveys) {
    const name = collectionOf(survey);

    collections.set(name, [...(collections.get(name) ?? []), survey]);
  }

  return Array.from(collections, ([name, entries]) => ({
    name,
    surveys: entries,
  })).sort((a, b) => a.name.localeCompare(b.name));
};

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
    // narrow the list, which is the only way to find one of several hundred
    const matching = needle
      ? surveys.filter(({ path, title }) =>
          `${path} ${title ?? ""}`.toLowerCase().includes(needle)
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

  const pendingLabel = pendingPath
    ? surveys.find(({ path }) => path === pendingPath)?.label ?? pendingPath
    : null;

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
              {entries.map(({ path, label, title }) => (
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
                        title-first list shows runs of identical rows */}
                    {label}
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

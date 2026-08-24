"use client";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import styles from "./styles.module.css";

/**
 * The notations the search box accepts, spelled out.
 *
 * Worth the space: what a viewer accepts is invisible until it refuses
 * something, and a position that will not go in reads as a broken search
 * rather than as the wrong notation. Folded away behind a summary so it is
 * there when wanted and out of the way when not.
 *
 * The examples themselves are notation, identical in every language, so
 * only the family names and the notes are translated.
 */
const FORMATS: ReadonlyArray<{ key: string; examples: Array<string> }> = [
  {
    key: "decimal",
    examples: ["186.2 7.0", "186.2, -7.0", "186.2° -7.0°"],
  },
  {
    key: "sexagesimal",
    examples: [
      "12:30:49.4 +12:23:28",
      "12 30 49.4 +12 23 28",
      "12h30m49.4s +12d23m28s",
      "12h 30m 49.4s +12° 23′ 28″",
    ],
  },
  {
    key: "partial",
    examples: ["12 30 +12 23", "12h30m +12.5"],
  },
  {
    key: "mixed",
    examples: ["186.2 +12:23:28", "12h30m49.4s 7.0"],
  },
  {
    key: "labelled",
    examples: ["RA 186.2 Dec -7.0", "R.A. 12:30:49.4 Decl. +12:23:28"],
  },
  {
    key: "frames",
    examples: ["186.2 7.0 J2000", "ICRS 186.2 7.0"],
  },
];

const NOTES: ReadonlyArray<string> = [
  "hours",
  "degrees",
  "separators",
  "sign",
  "range",
  "zoom",
  "names",
];

const CoordinateHelp: FC = () => {
  const { t } = useTranslation();

  return (
    <details className={styles.help}>
      <summary className={styles.summary}>
        {t("menu.search.coordinates.summary")}
      </summary>
      <div className={styles.body}>
        <p className={styles.intro}>{t("menu.search.coordinates.intro")}</p>
        <dl className={styles.formats}>
          {FORMATS.map(({ key, examples }) => (
            <div className={styles.format} key={key}>
              <dt className={styles.name}>
                {t(`menu.search.coordinates.formats.${key}`)}
              </dt>
              <dd className={styles.examples}>
                {examples.map((example) => (
                  <code className={styles.example} key={example}>
                    {example}
                  </code>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <ul className={styles.notes}>
          {NOTES.map((key) => (
            <li key={key}>{t(`menu.search.coordinates.notes.${key}`)}</li>
          ))}
        </ul>
      </div>
    </details>
  );
};

CoordinateHelp.displayName = "Molecule.Search.CoordinateHelp";

export default CoordinateHelp;

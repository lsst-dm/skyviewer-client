/**
 * The HiPS list this server publishes, as defined by HiPS 1.0 §5.2: a UTF-8
 * file of records in properties syntax, separated by blank lines, one per
 * HiPS the server distributes. The standard suggests building it as the
 * concatenation of the surveys' own `properties` files, which is what this
 * does — every key a survey declares is passed through, and only the four
 * the standard makes mandatory are supplied or corrected here.
 */

import type { DiscoveredSurvey } from "@/lib/hips/discover";
import {
  parseFields,
  surveyCreatorDid,
  withFields,
} from "@/lib/hips/properties";

/**
 * A statement about the copies this server holds, not about the master: the
 * deployment serving a HIPS_DATA_DIR sits behind staff authentication and
 * the surveys under it are unreleased, so they are private and are not to be
 * cloned from here. See the hips_status vocabulary in §4.4.1 — the standard's
 * own default, `public master clonableOnce`, would be a false claim.
 */
const STATUS = "private master unclonable";

/** the date format §4.4.1 gives for hips_release_date: ISO 8601 to the
 * minute, YYYY-mm-ddTHH:MMZ */
const asDate = (at: number): string =>
  `${new Date(at).toISOString().slice(0, 16)}Z`;

/**
 * One record: the survey's properties file with the mandatory keys filled
 * in, and with its blank lines removed — inside a record they would split it
 * in two, which is why §5.2's footnote calls that out.
 */
const toRecord = (survey: DiscoveredSurvey, base: string): string => {
  const declared = parseFields(survey.source);

  const record = withFields(survey.source, {
    // must match what /api/hips serves for this survey's properties: to a
    // client — aladin especially — a differing creator_did is a different HiPS
    creator_did: surveyCreatorDid(survey.path),
    // the master's date, when the survey states one, so a client can still
    // tell a stale copy from a current one. Surveys staged here do not always
    // carry it, and the standard requires a record to have one, so fall back
    // to when the file itself was last written
    hips_release_date:
      declared.hips_release_date ??
      declared.hips_creation_date ??
      asDate(survey.modifiedAt),
    // only this server knows where its copies are reachable
    hips_service_url: `${base}/${survey.path}`,
    hips_status: STATUS,
  });

  return record
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .join("\n");
};

/**
 * Renders the catalogue as a HiPS list.
 *
 * `base` is the absolute URL of this HiPS server — the prefix every survey's
 * path hangs off — because a hips_service_url a client cannot resolve is of
 * no use to it.
 */
export const toHiPSList = (
  surveys: ReadonlyArray<DiscoveredSurvey>,
  base: string
): string =>
  [
    `# HiPS list of ${base}`,
    ...surveys.map((survey) => toRecord(survey, base)),
  ].join("\n\n") + "\n";

/**
 * The same list as JSON, for callers who would rather not write a parser.
 *
 * The standard mandates the text form, and that stays the default — but its
 * own footnote on the CDS aggregator (§5.3) points at a `?fmt=json` variant
 * of the same URL, so this follows that service's shape rather than
 * inventing one: an array of flat objects, keyed by the properties
 * vocabulary, values left as the strings the file holds. The `ID` CDS adds
 * on top is the creator_did without its scheme.
 *
 * Derived from the very records the text form emits, so the two renderings
 * cannot drift apart.
 */
export const toHiPSListJSON = (
  surveys: ReadonlyArray<DiscoveredSurvey>,
  base: string
): Array<Record<string, string>> =>
  surveys.map((survey) => {
    const fields = parseFields(toRecord(survey, base));

    return { ID: fields.creator_did.replace(/^ivo:\/\//, ""), ...fields };
  });

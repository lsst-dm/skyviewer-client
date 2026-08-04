# UI system, styling & dev tooling

## Components

Atomic design under `components/`: `atomic/` → `molecules/` → `organisms/` →
`templates/`, plus non-canonical `pages/`, `global/`, `explorer/`, `svg/`,
`shapes/`. Mixed JS→TS migration in progress (105 `.tsx`, 62 `.js`/`.jsx`) —
new work is `.tsx`. Canonical unit: a directory with `index.tsx` +
`styles.module.css`; legacy components use `index.js` + `_styles.scss`
registered globally (`styles/components/_index.scss`). Conventions: `FC` +
`className` merge via `clsx/lite`; variants via `data-*` attributes; scalar
props forwarded as inline `--custom-properties` (enabled by `types/css.d.ts`);
`displayName` like `Molecule.Controls.Stack` (prefixes inconsistent — don't
build tooling on them).

Building blocks: `atomic/AladinOverlay` (pointer-events-none layer over the
canvas; re-enables events only for interactive descendants — anything else
portaled/rendered there needs explicit `pointer-events`), `molecules/Controls/
Stack` (`position="bottom left"` → data attrs), `atomic/IconButton`
(forwardRef; `text` becomes `title` + visually-hidden span; palette hardcodes
hex, not tokens).

## `@rubin-epo/epo-react-lib`

Rubin EPO's shared UI lib, always deep-imported (`.../IconComposer`,
`Stack`, `SlideoutMenu` — the whole AladinMenu is built on it). Two
load-bearing non-component uses: `styles/styles.scss` forwards its
`dist/style.css`, which supplies **all design tokens** (`--size-spacing-*`,
`--color-font-*`, fluid `clamp()` font sizes) plus reset and
`.visually-hidden` — the repo defines only two tokens of its own
(`styles/abstracts/variables.css`); and it ships an i18next namespace
(`epo-react-lib`) loaded in `lib/i18n/index.ts`. Use
`@/components/svg/IconComposer` (wraps the lib's with custom icons), not the
lib's directly.

## Styling

CSS Modules with **native CSS nesting** (not SCSS) via `postcss.config.js`:
`postcss-preset-env` (stage 2) + global-data + `postcss-custom-media` — the
custom media names (`--tablet`, `--desktop-small`, ...) live in
`styles/global/media.css`. A custom postcss config disables Next's built-in
pipeline; add plugins there explicitly. The SCSS side (`styles/abstracts/`)
holds a *duplicate, drifting* set of breakpoint/palette maps only reachable
from `.scss` files.

**styled-components is entirely vestigial** (babel key in package.json is
ignored by Next — no `.babelrc`, so SWC compiles; no file imports it). Safe
to remove; do NOT add a `.babelrc` to "fix" it, that would disable SWC.

Stylelint is strict (nesting ≤3, no `!important`, no ids, recess property
order) but note: `yarn lint:scss` only globs `**/*.scss`, so **`.module.css`
files are never actually linted** by the scripts.

## Hooks & contexts

`hooks/` is aladin-centric: `useAladinEvent` (the `AL:*` CustomEvent bridge —
aladin-lite itself emits ~30 typed DOM events on `aladinDiv`, see
`types/aladin-events.d.ts`), `useAladinMove` (imperative pan/zoom, honors
`prefers-reduced-motion`), `useAladinKeyboardControls`, `useAladinContextMenu`
(long-press synthesis), plus `useFocusTrap`/`useNetworkState`/`useDebounce`
(the latter two have known dep-array warts). Generic hooks come from
`usehooks-ts`. Two event mechanisms coexist: DOM `AL:` events and
`aladin.on()` callbacks (`bindAladinEvents` maps `onFooBar` → `fooBar`).

`contexts/`: `Aladin.tsx` (discriminated union on `isLoading`; **`useAladin({
callbacks })` is not a pure read** — it registers callbacks), `Tour.tsx` (the
tour state machine), `GlobalData.js` (CMS globals, last PropTypes holdout),
`Menu`, `AudioPlayer` (re-export of react-use-audio-player), `i18next.tsx`
(mounts both i18n providers), `TourSearch`/`TourSortFilter` (bare contexts).

## Tooling & CI

- Yarn 1.22.22 pinned via `packageManager`; Node 20 (`.node-version`).
- Husky: `commit-msg` → commitlint (conventional; **lower-case subject start
  enforced**), `pre-push` → `yarn test`. There is **no pre-commit hook**, so
  the configured lint-staged never runs (and it references a nonexistent
  `fix:styled` script).
- `.prettierrc.json` is an empty file — all defaults. eslint extends
  standard/next/prettier/a11y; `no-console` allows warn/error/info;
  unused imports are errors; `exhaustive-deps` is a warning.
- Tests: vitest + jsdom; exactly one spec (`__tests__/utilities.spec.ts`);
  `@testing-library/react` installed but unused. `tsc --noEmit` is in no
  script and no CI — run it yourself.
- CI (`.github/workflows/build-and-push.yaml`): Docker buildx → GCR
  (`develop`→dev / `main`→int / tags→prod projects), env pulled from GCP
  Secret Manager into the build-stage `.env` mount, `.next` exported to a
  GCS bucket for gcsFuse-based k8s serving, then `repository_dispatch` to
  `lsst-epo/edc-deploy`. **No lint/test/typecheck runs in CI.**
- `tsconfig`: `@/*` → repo root; `strict: false` **but**
  `strictNullChecks: true`; `typescript-plugin-css-modules` for editor
  typing of `styles.*`.
- `next.config.js`: ESM with top-level `await jiti.import("./env")` (the
  boot-time env validation); images restricted to `rubin.canto.com`;
  `cacheMaxMemorySize: 0` (ISR memory cache off — `.next` is bucket-mounted
  upstream); RSC cache-control headers from `config/headers.ts`.

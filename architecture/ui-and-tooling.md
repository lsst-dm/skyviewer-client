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
portaled/rendered there needs explicit `pointer-events`), `molecules/Controls/ Stack` (`position="bottom left"` → data attrs), `atomic/IconButton`
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
holds a _duplicate, drifting_ set of breakpoint/palette maps only reachable
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

`contexts/`: `Aladin.tsx` (discriminated union on `isLoading`; **`useAladin({ callbacks })` is not a pure read** — it registers callbacks), `Tour.tsx` (the
tour state machine), `GlobalData.js` (CMS globals, last PropTypes holdout),
`Menu`, `AudioPlayer` (re-export of react-use-audio-player), `i18next.tsx`
(mounts both i18n providers), `TourSearch`/`TourSortFilter` (bare contexts).

## Tooling & CI

- Yarn 1.22.22 pinned via `packageManager`; Node 20 (`.node-version`).
- Husky: `commit-msg` → commitlint (conventional; **lower-case subject start
  enforced**), `pre-commit` → `yarn verify` (lint + typecheck + test — the
  same thing CI's `checks` job runs, by design: one script, no drift),
  `pre-push` → `yarn test`. The old lint-staged config was dead (no
  pre-commit hook existed, and it referenced a nonexistent `fix:styled`
  script) and has been removed.
- `.prettierrc.json` is an empty file — all defaults. eslint extends
  standard/next/prettier/a11y; `no-console` allows warn/error/info;
  unused imports are errors; `exhaustive-deps` is a warning. **Sharp edge:**
  two copies of `eslint-plugin-import` are installed (top-level via
  `eslint-config-standard` vs nested under `eslint-config-next`). A standard
  yarn layout resolves fine, but any layout reaching `node_modules` through
  a symlink (shared installs across git worktrees, pnpm-style setups) makes
  eslint abort with `couldn't determine the plugin "import" uniquely`. The
  `u/mfl/dedupe-eslint-plugin-import` branch pins a single copy via
  `resolutions`. **`yarn lint` exits clean on this branch** — the fork
  fixed the violations upstream `main` still carries (unformatted files in
  `Listener/` and `svg/icons/`, two outdated sass calls in
  `styles/abstracts/_functions.scss`), so expect conflicts there on
  upstream merges. Two historical traps, both fixed here: `lint:js` used a
  single `&` between prettier and eslint, backgrounding prettier and
  discarding its exit code; and its prettier glob was `*.{js,jsx}` only, so
  `.tsx` — all new work — was never format-checked. The glob now covers
  ts/tsx, with generated `gql/` prettier-ignored so the check doesn't fight
  `yarn codegen`.
- Tests: vitest + jsdom; four specs under `__tests__/` — `utilities`, plus
  the fork's `hipsDiscover`, `hipsProperties` and `tileCache` (the
  `lib/hips/` pieces). `@testing-library/react` installed but unused.
  Typechecking is `yarn typecheck` (`tsc --noEmit`), bundled into
  `yarn verify` = lint + typecheck + test.
- CI (`.github/workflows/build.yaml`, this fork's): a `checks` job runs
  `yarn verify`, and only then does the `build` job make the Docker image
  and push it to `ghcr.io/lsst-dm/skyviewer-client` on pushes to
  `main`/`tickets/**` — see `deployment.md`. The pre-commit hook runs the
  same `yarn verify`, so CI failures here mean the hook was skipped.
  Upstream's `build-and-push.yaml` (GCR + GCS + `repository_dispatch` to
  `lsst-epo/edc-deploy`) was dropped from the fork.
- `tsconfig`: `@/*` → repo root; `strict: false` **but**
  `strictNullChecks: true`; `typescript-plugin-css-modules` for editor
  typing of `styles.*`.
- `next.config.js`: ESM with top-level `await jiti.import("./env")` (the
  boot-time env validation); images restricted to `rubin.canto.com`;
  `cacheMaxMemorySize: 0` (ISR memory cache off — `.next` is bucket-mounted
  upstream); RSC cache-control headers from `config/headers.ts`.

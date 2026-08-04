# skyviewer-client (mfisherlevine fork)

Rubin Observatory's public **Skyviewer** (skyviewer.app): a Next.js app-router
site wrapping [aladin-lite](https://github.com/cds-astro/aladin-lite) (pinned
3.6.5) to browse LSST HiPS imagery, with tours, sonification ("Skysynth"),
and an embed mode. Content/config comes from a Craft CMS GraphQL API; sky
imagery streams directly from `images.rubinobservatory.org` to the browser.

Upstream is `lsst-epo/skyviewer-client`. This fork carries fixes and features
on top — see `architecture/fork-branches.md` for the branch map before
starting work, and the rest of `architecture/` for how the app actually works.

## Commands

Yarn classic (v1) via Node 20. The husky hooks (`commit-msg`, `pre-push`)
invoke `yarn`, so it must be on `PATH` to commit (`npx yarn@1.22.22` shims
fine).

```bash
yarn install --frozen-lockfile
yarn dev                # Next dev server on :3000 (needs env — see below)
yarn test               # vitest (small suite: lib/utilities only)
yarn lint / yarn fix    # prettier + eslint + stylelint
yarn static:build       # production build (what the Dockerfile runs)
```

- **Commitlint enforces conventional commits and rejects capitalized
  subjects** (`subject-case`): `fix: keep tiles visible` ✓, `fix: Keep...` ✗.
  A hook failure aborts the commit silently if you pipe output — check
  `git log` after committing.
- Hooks: `commit-msg` → commitlint, `pre-push` → `yarn test`. There is no
  pre-commit hook (the lint-staged config never fires), and upstream CI runs
  no lint/tests/typecheck — local checks are the only gate.
- eslint is currently broken repo-wide (duplicate `eslint-plugin-import`
  installs make it abort before linting) — see
  `architecture/ui-and-tooling.md`. Prettier and `tsc --noEmit` still work;
  rely on those.
- `tsc --noEmit` is not in any script or CI but the repo typechecks cleanly;
  run it before pushing.

## Environment

`env.ts` validates env via `@t3-oss/env-nextjs` — at build **and** at server
boot (`next.config.js` imports it), so the server won't start without the
required vars. No `.env` ships with the repo. For local dev against the
production CMS, create `.env.local`:

```bash
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="https://api.skyviewer.app/api"       # answers unauthenticated queries
NEXT_PUBLIC_ASTRO_API_URL="https://us-central1-edc-prod-eef0.cloudfunctions.net/astro-objects-api"
NEXT_PUBLIC_ASTRO_OBJECTS_API_TOKEN="<recover from the skyviewer.app client bundle — it is public by design>"
CRAFT_REVALIDATE_SECRET_TOKEN="local-dev-dummy"           # only gates preview/revalidate routes
CRAFT_SECRET_TOKEN="local-dev-dummy"
CLOUD_ENV="PROD"                                          # DEV enables the /api/gcs path rewrite
# HIPS_DATA_DIR="/path/to/local/hips/mirror"              # optional: serve tiles from disk via /api/hips
```

All `NEXT_PUBLIC_*` values are baked into the client bundle at build time and
are recoverable from the deployed site's JS chunks if lost.

## Things that will bite you

- **aladin-lite quirks are the heart of this codebase.** Read
  `architecture/aladin-and-hips.md` before touching anything in
  `components/organisms/Aladin`, `lib/aladin/`, or zoom/tile behavior. The
  short version: the Rubin HiPS have no order 0–2 tiles and their `properties`
  files omit `hips_order_min`; aladin loads tiles via `HtmlImageElement` (not
  fetch); the Allsky previews have no alpha channel; and several aladin
  options get silently clobbered by its properties parser.
- The CMS schema can be ahead of or behind this code — unknown GraphQL fields
  log warnings at request time (e.g. `faqMenuContent`) but don't fail the
  page.
- aladin behavior is testable without the dev server: `npm pack
  aladin-lite@3.6.5`, a small HTML page importing `dist/aladin.js`, and
  headless Chrome (`--headless=new`, do **not** pass `--disable-gpu` on macOS
  — it kills WebGL2). Production HiPS serve `Access-Control-Allow-Origin: *`.
- `next build` prerenders tour pages, so builds need network access to the
  CMS.

## Architecture docs

| Doc | Covers |
|-----|--------|
| `architecture/overview.md` | Stack, repo layout, data flow |
| `architecture/aladin-and-hips.md` | aladin-lite integration, HiPS format, every quirk we've hit |
| `architecture/experiences.md` | Pages/routing, tours, sonification, search, embed |
| `architecture/data-layer.md` | Craft CMS GraphQL, codegen, zod schemas, env, i18n, API routes |
| `architecture/ui-and-tooling.md` | Component system, styling, hooks, dev tooling |
| `architecture/deployment.md` | Docker build, env plumbing, upstream vs fork deployment |
| `architecture/fork-branches.md` | What each fork branch changes and why |

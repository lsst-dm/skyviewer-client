# Build & deployment

## The Docker build

[Dockerfile](../Dockerfile) is multi-stage BuildKit (`syntax=docker/dockerfile:1.19`):

- `builder`: `node:20-alpine`, copies the repo **excluding `.env`**, `yarn install --frozen-lockfile`.
- `yarn-builder`: bind-mounts `.env` from the build context and runs
  `yarn static:build` (= `next build --debug`). **`NEXT_PUBLIC_*` values are
  baked into the client bundle here** — they cannot be changed at runtime.
- `nextjs-copy` (scratch): exports `.next` alone — upstream's pipeline
  versions `.next` in a GCS bucket via this stage.
- `runner`: upstream copies from `builder` (i.e. _without_ `.next`, relying
  on that external injection); the fork's `u/mfl/docker-self-contained` fix copies
  from `yarn-builder` so a plain `docker build` yields a runnable image.
  `EXPOSE 8080`, `CMD yarn start` (`next start -p 8080`).

Build needs network (prerenders tour pages against the CMS) and ~2–4 GB RAM.

## Env plumbing (the part that bites)

`env.ts` is imported by `next.config.js` (via jiti), so the schema is
enforced **both at build time and when the server boots**. A container
without the env vars crash-loops on start even though the client bundle
already has the `NEXT_PUBLIC_*` values baked in. Any deployment must
therefore supply the same env file twice: in the build context as `.env`
(for the bind-mount) _and_ at runtime (compose `env_file:` / GAE env / etc.).

`CRAFT_*` tokens only gate `/api/preview` and `/api/revalidate`; deployments
that don't use CMS preview can set them to any non-empty string.

## Fork deployment (usdfdev, DM-55722)

The fork deploys to the usdfdev RSP as a staff-only viewer for **private**
HiPS surveys staged at `/sdf/group/rubin/shared/hips_views`. Two halves:

- **Image**: `.github/workflows/build.yaml` builds on pushes to `main` and
  `tickets/**` and pushes `ghcr.io/lsst-dm/skyviewer-client` (in-progress
  builds for a superseded ticket-branch commit are cancelled). It
  materializes `.env` from repository variables and secrets first, because
  the Dockerfile bind-mounts it. Since `NEXT_PUBLIC_*` values are compiled
  into the bundle, **the image is specific to its host and base path**
  (`usdf-rsp-dev.slac.stanford.edu` + `/skyviewer` via
  `NEXT_PUBLIC_BASE_PATH`) and cannot be promoted between environments.
- **Deployment**: `applications/skyviewer` in `lsst-sqre/phalanx` (branch
  `tickets/DM-55722` while in development), synced by Argo CD. Behind
  Gafaelfawr on `read:image` with `loginRedirect`. One replica, `Recreate`
  strategy (at one replica RollingUpdate wedges — see the chart comment),
  `pullPolicy: Always` so a pod replacement picks up a rebuilt mutable tag.

Because the surveys are private, tiles cannot stream browser → bucket as
upstream's do: the pod carries all tile traffic itself via `/api/hips`
(hence `HIPS_TILE_CACHE_BYTES`, 6 GiB there). The chart's readiness probe
hits `/skyviewer/api/health` with a 5 s timeout — probing a page path
renders the home page against the CMS, which intermittently overran the
default 1 s timeout, marked the only pod unready, and surfaced as transient
503s.

### Why build times vary so much (20 s to 16 min)

The shared `lsst-sqre/build-and-push-to-ghcr` action caches layers in the
GitHub Actions cache with `mode=max`, so what a commit touches sets the
ceiling on how fast the build can be:

- **Docs, `architecture/`, `.github/`, `.git`** are excluded by
  [.dockerignore](../.dockerignore), so they change no layer at all and the
  build _can_ be a cache hit end to end — 23 s observed. Don't count on it:
  another docs-and-workflow-only push re-ran `yarn install` and
  `yarn static:build` anyway and took 4m45s. Layer restoration from the
  Actions cache is not guaranteed just because the context is unchanged.
- **App source** re-runs `yarn static:build` and re-exports the changed
  layers: ~7 min.
- **`package.json` or `yarn.lock`** — even a scripts-only edit — invalidates
  the `COPY package.json yarn.lock` layer and therefore `yarn install` and
  everything after it. The rebuild is the cheap part; _re-exporting_ the
  `node_modules` layers to the Actions cache is what costs, measured at
  9m49s of a 15m53s run. Expect that whenever you touch either file.

Watch the repository's Actions cache against GitHub's **10 GB per-repo
limit** (`gh api repos/lsst-dm/skyviewer-client/actions/cache/usage`).
Entries past the limit are evicted least-recently-used, and evicting a
build layer buys back that ten-minute re-export. This is why the `checks`
job does not cache yarn — and why, from `actions/setup-node@v5`, it has to
pass `package-manager-cache: false` to stop the action caching on its own
because `package.json` carries a `packageManager` field.

## Upstream deployment (for reference)

Upstream's live path is its `build-and-push.yaml` workflow (dropped from
the fork, which replaced it with `build.yaml` above): Docker buildx →
GCR (`develop`→dev, `main`→int, tags→prod GCP projects), build env
materialized from GCP Secret Manager into the `.env` bind-mount, the `.next`
dir exported to a GCS bucket (served into k8s via gcsFuse — which is why the
runner stage doesn't need it), then `repository_dispatch` to
`lsst-epo/edc-deploy`. `app.yaml`/`.gcloudignore` (App Engine Flex) appear
legacy/unused. No lint/test/typecheck runs in CI. The prod CMS is
`api.skyviewer.app` (Craft; answers unauthenticated queries); public env
values are recoverable from the deployed bundle's JS chunks.

## Serving HiPS from disk (`HIPS_DATA_DIR`)

The mechanism behind both local-dev mirrors and the usdfdev deployment.
When `HIPS_DATA_DIR` is set, `lib/schema/survey.ts` rewrites survey paths
from `images.rubinobservatory.org/` to `/api/hips/`, and
[app/api/hips/[...path]/route.ts](../app/api/hips/%5B...path%5D/route.ts)
serves the files from disk (immutable cache-control on hits, `no-store` on
404s so a still-filling mirror never poisons caches). The URL carries the
whole path below `HIPS_DATA_DIR`, so the mirror need not be shaped like the
public host. Two server-side amendments on the way out: a byte-capped
in-memory FIFO cache of served files (`HIPS_TILE_CACHE_BYTES`;
`lib/hips/tileCache.ts` — without it every tile is a fresh read from
networked disk on every request), and a rewrite of each `properties` file's
`creator_did` to a path-derived unique value (aladin quirk 8 in
`aladin-and-hips.md`: colliding `creator_did`s silently adopt each other's
options).

When `HIPS_DATA_DIR` is set, the explorer stops using the CMS survey list
altogether and shows what is actually on disk. `lib/hips/discover.ts` walks
the tree and treats any directory holding a `properties` file as a survey;
it cannot key on depth, because the instrument collections sit at
`<instrument>/hips/<dataset>/<band>` while the user collections under `u/`
are whatever depth their owner chose. `lib/hips/local.ts` caches that scan
(5 minutes — it is a readdir per directory over a shared filesystem) and
builds the viewer's layer from the chosen survey's `properties`, since no
CMS entry supplies its order, tile format and size, frame or title.

Which survey is shown comes from `?survey=<path>` so a view can be linked
to, falling back to `HIPS_SURVEY` and then to the first survey found. The
requested value is only honoured if the scan found it, which is also what
stops it escaping the mirror. The picker
(`components/organisms/AladinMenu/Surveys`) groups by collection — per user
below `u/`, since one user can own more than a hundred — and filters on the
full path.

**`hips_initial_ra`/`dec`/`fov` matter.** These surveys cover as little as
1e-05 of the sky and are a few hundredths of a degree across, so the CMS
defaults (a fixed target, a 60° field, a 2° zoom floor) open on empty sky
with no way to zoom in far enough to find the imagery. They do _not_ declare
`hips_order_min`, so the forced floor of 3 is still needed.

The mirror itself
(~55 GB, 134k files) is built by `mirror_hips.py` (lives with the data, e.g.
`~/lsst/skyviewer-data`): enumerates the exact tile set from each survey's
`Moc.fits`, downloads with per-file verification (Content-Length + RIFF
magic, atomic rename), and is safely re-runnable/resumable.

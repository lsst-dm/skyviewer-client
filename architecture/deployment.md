# Build & deployment

## The Docker build

[Dockerfile](../Dockerfile) is multi-stage BuildKit (`syntax=docker/dockerfile:1.19`):

- `builder`: `node:20-alpine`, copies the repo **excluding `.env`**, `yarn
  install --frozen-lockfile`.
- `yarn-builder`: bind-mounts `.env` from the build context and runs
  `yarn static:build` (= `next build --debug`). **`NEXT_PUBLIC_*` values are
  baked into the client bundle here** — they cannot be changed at runtime.
- `nextjs-copy` (scratch): exports `.next` alone — upstream's pipeline
  versions `.next` in a GCS bucket via this stage.
- `runner`: upstream copies from `builder` (i.e. *without* `.next`, relying
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
(for the bind-mount) *and* at runtime (compose `env_file:` / GAE env / etc.).

`CRAFT_*` tokens only gate `/api/preview` and `/api/revalidate`; deployments
that don't use CMS preview can set them to any non-empty string.

## Upstream deployment (for reference)

The live path is `.github/workflows/build-and-push.yaml`: Docker buildx →
GCR (`develop`→dev, `main`→int, tags→prod GCP projects), build env
materialized from GCP Secret Manager into the `.env` bind-mount, the `.next`
dir exported to a GCS bucket (served into k8s via gcsFuse — which is why the
runner stage doesn't need it), then `repository_dispatch` to
`lsst-epo/edc-deploy`. `app.yaml`/`.gcloudignore` (App Engine Flex) appear
legacy/unused. No lint/test/typecheck runs in CI. The prod CMS is
`api.skyviewer.app` (Craft; answers unauthenticated queries); public env
values are recoverable from the deployed bundle's JS chunks.

## Local HiPS mirror (optional, dev)

`u/mfl/local-hips-data` adds `HIPS_DATA_DIR`: when set,
`lib/schema/survey.ts` rewrites survey paths from
`images.rubinobservatory.org/` to `/api/hips/`, and
[app/api/hips/[...path]/route.ts](../app/api/hips/%5B...path%5D/route.ts)
serves the files from disk (immutable cache-control on hits, `no-store` on
404s so a still-filling mirror never poisons caches). The URL carries the
whole path below `HIPS_DATA_DIR`, so the mirror need not be shaped like the
public host.

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
with no way to zoom in far enough to find the imagery. They do *not* declare
`hips_order_min`, so the forced floor of 3 is still needed.

The mirror itself
(~55 GB, 134k files) is built by `mirror_hips.py` (lives with the data, e.g.
`~/lsst/skyviewer-data`): enumerates the exact tile set from each survey's
`Moc.fits`, downloads with per-file verification (Content-Length + RIFF
magic, atomic rename), and is safely re-runnable/resumable.

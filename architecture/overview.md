# Overview

## What this is

The Rubin Observatory **Skyviewer** (deployed upstream at skyviewer.app): a
public-outreach browser for LSST sky imagery. Three pillars:

1. **Explorer** — pan/zoom the HiPS imagery via aladin-lite, search objects,
   inspect positions, share/embed views.
2. **Tours** — CMS-authored guided fly-throughs of the imagery.
3. **Skysynth** — sonification of the sky view.

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js ~14.2 (app router, `[locale]` segment), React 18, TypeScript |
| Sky rendering | aladin-lite 3.6.5 (wasm core) — see `aladin-and-hips.md` |
| Content/config | Craft CMS GraphQL (`api.skyviewer.app`), urql, GraphQL codegen, zod validation (zod 3.25 via its `zod/v4` subpath) — see `data-layer.md` |
| i18n | next-intl (routing/server) + react-i18next (component strings), en/es/ja |
| UI | atomic-design components, CSS modules (+ SCSS globals), `@rubin-epo/epo-react-lib`, `motion` — see `ui-and-tooling.md` |
| Audio | p5 / web audio for sonification |
| Tests/tooling | vitest (minimal), prettier/eslint/stylelint, husky + commitlint (conventional, lower-case subjects), yarn v1 |

## Data flow (explorer page)

```
build/request time                        browser
──────────────────                        ───────
Craft CMS ──GraphQL──► services/api/* ──► page props (surveys, fov config)
                       └─ zod schemas          │
                          (lib/schema)         ▼
                                     organisms/Aladin creates aladin-lite
                                          │  instance + HiPS layers
                                          ▼
                     images.rubinobservatory.org ──tiles──► browser (direct;
                     (or /api/hips when HIPS_DATA_DIR)      SW-cached)
```

The Next server only ever serves HTML/JS and the small API routes — all tile
traffic is browser → bucket (CORS `*`).

## Repo layout

```
app/[locale]/...        # routes: explorer, skysynth, embed, tours, ...
app/api/                # gcs proxy, hips local mirror, preview, revalidate
components/             # atomic → molecules → organisms → templates
contexts/               # Aladin, Tour, AudioPlayer, Menu, GlobalData, ...
hooks/                  # useAladinEvent, useAladinMove, keyboard controls...
lib/aladin/             # helpers (events, zoom, min-order), animation, astro
lib/schema/             # zod schemas for CMS payloads (survey, astro)
lib/i18n/               # locale strings (en/es/ja), site mapping
services/api/           # one module per CMS query + fragments/ + client.ts
gql/ + codegen.ts       # generated GraphQL types
fixtures/               # static config/data (aladin options, earth scale...)
types/                  # ambient .d.ts, incl. hand-written aladin API types
public/                 # assets + hips-tile-cache-sw.js service worker
styles/                 # SCSS abstracts/globals; tokens
architecture/           # ← you are here
```

Read `fork-branches.md` first if you're working on the fork rather than
upstream `main`.

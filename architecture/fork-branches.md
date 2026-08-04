# Fork branch map

Upstream: `lsst-epo/skyviewer-client`. Fork: `mfisherlevine/skyviewer-client`.
All branches are kept rebased-clean (history rewritten rather than fix-up
commits appended), so expect force-pushes.

| Branch | Base | Contents |
|--------|------|----------|
| `main` | upstream `main` | untouched mirror |
| `u/mfl/full-sky-zoom` | `main` | the four upstream-facing fixes (below) |
| `u/mfl/earth-scale` | `main` | Earth-scale comparison feature (one commit) |
| `u/mfl/local-hips-data` | `main` | `HIPS_DATA_DIR` local tile mirror serving (one commit) |
| `u/mfl/embed-allow-attribute` | `main` | one-line fix: embed iframes wrote `allowed=` instead of `allow=` |
| `u/mfl/agent-docs` | `main` | CLAUDE.md + this `architecture/` directory |
| `u/mfl/mflabs-deploy` | `deploy` | + Dockerfile self-containment fix; what the VPS runs |
| `deploy` | — | `full-sky-zoom` + `local-hips-data` + `earth-scale` cherry-picked together; rebuilt (reset + re-cherry-pick) whenever a component branch changes |

## The four fixes on `u/mfl/full-sky-zoom`

1. **`fix: keep partial-coverage HiPS visible at wide fields of view`** —
   forces `hips_order_min = 3` on the base survey (the properties files omit
   it, so aladin requests nonexistent order 0–2 tiles and draws nothing past
   ~35° fov). Injected via a `_parseProperties` wrapper because aladin
   clobbers the `minOrder` option. Base layer only: the Allsky previews have
   no alpha and would black out layers beneath an overlay.
2. **`feat: allow zooming out to see the whole sky`** — caps the zoom range
   at 360° instead of the CMS `fovMax` (60–100° on current entries); full
   celestial sphere renders as a globe.
3. **`fix: make trackpad pinch and scroll zoom at a usable speed`** — wheel
   zoom proportional to `deltaY` (`2^(delta/notch)`, deltaMode-aware) and
   accumulated into a per-gesture target so aladin's restarted 100 ms zoom
   animation doesn't swallow the steps. Mouse notch unchanged at 2×.
4. **`perf: serve already-seen HiPS tiles from a service worker cache`** —
   works around the bucket's `cache-control: private, max-age=0` (a ~300 ms
   revalidation per tile per session) with a cache-first service worker;
   also negative-caches out-of-coverage 404s (cross-origin only, 7-day TTL).

Upstream data-side fixes that would obsolete parts of this (worth pushing
for): add `hips_order_min = 3` to the HiPS `properties` files, and serve
tiles with `cache-control: private, max-age=31536000`.

## Conventions

- Branch names: `u/mfl/<topic>`.
- Conventional commits enforced by commitlint (lower-case subject start).
- `deploy` is a throwaway integration branch: never commit directly to it;
  change a component branch, then rebuild deploy from scratch.

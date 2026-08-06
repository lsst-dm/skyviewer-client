# Fork branch map

Upstream: `lsst-epo/skyviewer-client`. Fork: `lsst-dm/skyviewer-client`.

The fork was made from `lsst-epo` directly, so upstream stays the parent and
gets the fork count.

Remotes in a working clone:

| Remote     | Points at                   | Role                                                                                                                      |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `origin`   | `lsst-dm/skyviewer-client`  | the fork. Branches track it, so a bare `git push` lands here.                                                             |
| `upstream` | `lsst-epo/skyviewer-client` | upstream; fetch-only in practice. Take upstream changes with an explicit `git fetch upstream && git merge upstream/main`. |

Naming the fork `origin` matters beyond convention: nothing but the git CLI
honours `remote.pushDefault`, so with any other layout, editors and GUIs
(VS Code's git integration included) push to `origin` and fail against
upstream, where we have no write access.

A working clone should also disable pushes to upstream outright:

```bash
git remote set-url --push upstream DISABLED
```

Pushing to someone else's repository is never something to do by accident,
and this makes it fail loudly until an explicit URL is passed. Keep it even
if we are granted write access there — the point is that the action stays
deliberate.

GitHub Actions are **enabled** on `lsst-dm/skyviewer-client`, but only
after the workflow the fork inherited from upstream (`build-and-push.yaml`,
which deploys to lsst-epo's GCP projects) was deleted and replaced by the
fork's own `build.yaml`, which builds to
`ghcr.io/lsst-dm/skyviewer-client` — see `deployment.md`. If upstream sync
ever resurrects `build-and-push.yaml`, delete it again in the same change.

As of August 2026, **every topic branch has been merged into the fork's
`main`** (individual `--no-ff` merge commits), after a per-branch review pass
in which an agent audited each branch and squashed any fixes into the
originating commits. The topic branches are kept on the remote, frozen, so
upstream can diff or cherry-pick each change in isolation. Branches added
since are based on the fork's `main` rather than upstream's, because they
build on what is already merged there.

| Branch                              | Base            | Contents                                                                                                                                                                                                                                                    |
| ----------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`                              | upstream `main` | all topic branches merged                                                                                                                                                                                                                                   |
| `u/mfl/full-sky-zoom`               | upstream `main` | the four upstream-facing fixes (below)                                                                                                                                                                                                                      |
| `u/mfl/earth-scale`                 | upstream `main` | Earth-scale comparison feature (one commit)                                                                                                                                                                                                                 |
| `u/mfl/local-hips-data`             | upstream `main` | `HIPS_DATA_DIR` local tile mirror serving (one commit)                                                                                                                                                                                                      |
| `u/mfl/embed-allow-attribute`       | upstream `main` | one-line fix: embed iframes wrote `allowed=` instead of `allow=`                                                                                                                                                                                            |
| `u/mfl/docker-self-contained`       | upstream `main` | one-line fix: runner image now contains `.next` (upstream CI injects it externally)                                                                                                                                                                         |
| `u/mfl/agent-docs`                  | upstream `main` | CLAUDE.md + this `architecture/` directory, as originally written. The docs are maintained in-tree since; a follow-up branch (`u/mfl/agent-docs-updated`) was deleted once its content merged                                                               |
| `u/mfl/dedupe-eslint-plugin-import` | upstream `main` | resolutions pin collapsing the two installed copies of `eslint-plugin-import` to one                                                                                                                                                                        |
| `u/mfl/sky-curvature`               | fork `main`     | auto coordinate grid + Earth globe, both keyed on one "is the sky curved?" threshold (two commits)                                                                                                                                                          |
| `tickets/DM-55722`                  | fork `main`     | the usdfdev staff-only deployment (active): base-path serving, the ghcr `build.yaml`, survey discovery + picker for `HIPS_DATA_DIR` trees, unique `creator_did`, in-memory tile cache, `/api/health`, `/api/hips/hipslist`. Paired with `tickets/DM-55722` in `lsst-sqre/phalanx` |
| `up/*`                              | upstream `main` | one branch per prepared upstream PR, built on `upstream/main` rather than the fork's, so each cherry-picks clean. See `upstream-contributions.md`                                                                                                           |

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
   animation doesn't swallow the steps; the target is clamped to the view's
   configured range _and_ the projection's own fov cap. Mouse notch
   unchanged at 2×.
4. **`perf: serve already-seen HiPS tiles from a service worker cache`** —
   works around the bucket's `cache-control: private, max-age=0` (a ~300 ms
   revalidation per tile per session) with a cache-first service worker;
   also negative-caches out-of-coverage 404s (cross-origin only, 7-day TTL).
   Cache reads and writes are best-effort (a storage failure can never fail
   the tile request), and the trim counter is primed at worker start so the
   entry cap holds across short worker lifetimes.

Upstream data-side fixes that would obsolete parts of this (worth pushing
for): add `hips_order_min = 3` to the HiPS `properties` files, and serve
tiles with `cache-control: private, max-age=31536000`.

## Conventions

- Branch names: `tickets/DM-<number>` for work tracked by a Rubin Jira
  ticket (the DM convention, and what Phalanx-side work is paired with);
  `u/mfl/<topic>` for the older fork branches predating that; `up/<topic>`
  for a branch prepared as an upstream PR. Not `upstream/<topic>`, which
  would collide with the `upstream` remote's tracking refs.
- Conventional commits enforced by commitlint (lower-case subject start).
- **Every commit carries an `Upstream:` trailer** — `candidate` or
  `fork-only` — recording whether we would offer it to upstream. Git can
  already tell you what the fork has that upstream does not
  (`git cherry upstream/main HEAD`); the trailer records the editorial
  judgement it cannot. Strip it from `up/*` branches: it is our bookkeeping
  and means nothing in upstream's repo. See `upstream-contributions.md`.
- Topic branches are kept rebased-clean (fixes squashed into originating
  commits rather than appended), so expect force-pushes on any that are
  still evolving.

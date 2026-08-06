# Upstream contributions

What this fork has to offer `lsst-epo/skyviewer-client`, why, and the exact
text to send with it. Companion to `fork-branches.md`, which maps the
branches themselves.

**Status: the twelve fixes were filed 2026-08-06** after upstream said they
would welcome them; all reported `MERGEABLE` on opening. The three feature
branches (13–15) are deliberately held back — they are product decisions, and
nobody asked for them. Record outcomes in the table as they land, so this
file stays the answer to "what did we offer and what happened to it".

## How a change gets here

1. **Mark it when you write it.** Every commit on a fork branch carries an
   `Upstream:` trailer — `candidate` or `fork-only`. Deciding at authoring
   time is far easier than reconstructing it later.

   ```bash
   git commit --trailer "Upstream: candidate" -m "..."
   git log upstream/main..HEAD --format='%(trailers:key=Upstream,valueonly)|%s'
   ```

2. **Build a branch off `upstream/main`,** one per concern, prefixed `up/`.
   Not `upstream/`, which collides with the remote-tracking refs.
   Strip the `Upstream:` trailer from these commits — it is our bookkeeping
   and means nothing in their repo.

3. **Open a PR, not an issue with a patch attached.** GitHub computes and
   keeps re-checking "no conflicts with the base branch", which is the thing
   worth showing; in an issue you can only assert it and the assertion goes
   stale silently. File an issue only when there is no patch to send (see the
   data-side items at the end) or when a change is big enough to want
   agreement first.

4. **Never push to upstream by accident.** The working clone sets
   `git remote set-url --push upstream DISABLED`, so pushes fail loudly until
   someone passes an explicit URL. Keep it that way even with write access.

## Tone

These are unsolicited changes from outside their roadmap. Every PR body opens
with the same note — we maintain a fork, hit this along the way, offering it
with no expectation, please close it if it doesn't fit — and says plainly
where we might have misread something. Anything that changes what a user sees
is labelled a product decision that belongs to them, not us.

## The set

| PR                                                            | Branch                  | Title                                                                       | Notes                                              |
| ------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| [#398](https://github.com/lsst-epo/skyviewer-client/pull/398) | `up/hips-order-min`     | fix: keep partial-coverage HiPS visible at wide fields of view              | answers their #396                                 |
| [#399](https://github.com/lsst-epo/skyviewer-client/pull/399) | `up/embed-allow-attr`   | fix: use the allow attribute in generated embed iframes                     | one line                                           |
| [#400](https://github.com/lsst-epo/skyviewer-client/pull/400) | `up/aladin-layers-prop` | fix: stop the aladin organism mutating its layers prop                      | hand-ported                                        |
| [#401](https://github.com/lsst-epo/skyviewer-client/pull/401) | `up/aladin-saved-opts`  | fix: stop saved aladin options merging into a stale copy                    |                                                    |
| [#402](https://github.com/lsst-epo/skyviewer-client/pull/402) | `up/wheel-zoom`         | fix: make trackpad pinch and scroll zoom at a usable speed                  | contains #398                                      |
| [#403](https://github.com/lsst-epo/skyviewer-client/pull/403) | `up/tile-sw-cache`      | perf: serve already-seen HiPS tiles from a service worker cache             | stopgap for #397                                   |
| [#404](https://github.com/lsst-epo/skyviewer-client/pull/404) | `up/lint-hygiene`       | fix: make yarn lint check what it claims to                                 | conflicts with #400, #401                          |
| [#405](https://github.com/lsst-epo/skyviewer-client/pull/405) | `up/eslint-dedupe`      | chore: dedupe eslint-plugin-import so eslint resolves it uniquely           |                                                    |
| [#406](https://github.com/lsst-epo/skyviewer-client/pull/406) | `up/dockerignore`       | build: limit the docker build context                                       |                                                    |
| [#407](https://github.com/lsst-epo/skyviewer-client/pull/407) | `up/docker-selfcontain` | fix: make the Docker image self-contained for standalone deployment         | least confident                                    |
| [#408](https://github.com/lsst-epo/skyviewer-client/pull/408) | `up/gitignore-tsbuild`  | chore: ignore typescript incremental build state                            | three lines                                        |
| [#409](https://github.com/lsst-epo/skyviewer-client/pull/409) | `up/env-token-optional` | fix: stop requiring the astro objects token at runtime                      | judgement call                                     |
| not filed                                                     | `up/full-sky-zoom`      | feat: allow zooming out to see the whole sky                                | **product decision**, contains `up/hips-order-min` |
| not filed                                                     | `up/earth-scale`        | feat: add an earth-scale comparison for the current field of view           | **product decision**                               |
| not filed                                                     | `up/sky-curvature`      | feat: show the coordinate grid and an Earth globe when the sky looks curved | **product decision**, contains `up/earth-scale`    |

The three unfiled branches stay on the fork, ready, in case upstream ever asks
for them. Offering a feature nobody requested is a different act from offering
a bug fix, and worth keeping that way.

Ordering that matters: #404 reformats `components/organisms/Aladin/index.tsx`,
so it conflicts with #400 and #401 — whichever lands second needs a rebase, in
either direction, and the PR says we will do it. #402 contains #398; once #398
merges it reduces to a single commit.

## Shared preamble

> Hello! We maintain a fork at `lsst-dm/skyviewer-client` for an internal,
> staff-facing deployment of Skyviewer, and ran into this along the way.
> Offering it back in case it's useful — there is genuinely no expectation
> here, and please close it without ceremony if it doesn't fit your plans.
> We're outside your roadmap and product context, so we may well have
> misread something.

---

## Tier 1 — bug fixes we're fairly confident about

### PR 1 · `up/hips-order-min` → closes #396

**Title:** `fix: keep partial-coverage HiPS visible at wide fields of view`

> This is our attempt at #396, which you filed last week.
>
> The Rubin HiPS have no order 0–2 tiles and their `properties` files omit
> `hips_order_min`, so once zoomed out past ~35° aladin requests tiles that
> don't exist and the imagery disappears. Declaring a minimum order makes it
> fall back to the order-3 Allsky preview instead.
>
> One thing we found that may be worth knowing before you build this: passing
> `minOrder` as an option doesn't survive. In aladin-lite 3.6.5,
> `PropertyParser.minOrder` returns `0` rather than `undefined` when the key is
> absent, and `_parseProperties` unconditionally overwrites the instance value.
> The only override we could make stick was wrapping `_parseProperties` to
> inject the key before parsing, which is what this does. That's also why the
> issue's suggestion of plumbing `hips_order_min` through the GraphQL queries
> may not be enough on its own — though we could easily have missed a cleaner
> route.
>
> Applied to the base layer only, deliberately: the Allsky previews are opaque
> RGB with no alpha, so an overlay falling back to one paints black over
> everything beneath it. We shipped that bug ourselves and backed it out.
>
> Pinned to 3.6.5 — if #367 lands and 3.9 behaves differently, this may want
> revisiting or may become unnecessary.

### PR 2 · `up/embed-allow-attr`

**Title:** `fix: use the allow attribute in generated embed iframes`

> One-line fix: `EmbedGenerator` writes `allowed=` where the HTML attribute is
> `allow=`, so the permissions-policy list on generated embed snippets is
> silently inert. Unless it's spelled that way deliberately for something we
> haven't spotted.

### PR 3 · `up/aladin-layers-prop`

**Title:** `fix: stop the aladin organism mutating its layers prop`

> The organism calls `.reverse()` and `.splice()` on its `layers` prop in
> place. The Display menu renders from that same array and re-renders once
> aladin has loaded, so it re-draws against a reordered list with the base
> entry removed — which is empty on a single-survey page, making the layer
> list vanish from the menu.
>
> Copying instead of mutating also removes a latent crash under StrictMode's
> double-mount, where the second pass splices an already-emptied array.
>
> We hit this on a single-survey page, which may be a configuration you never
> produce — in which case this is only the StrictMode half.

### PR 4 · `up/aladin-saved-opts`

**Title:** `fix: stop saved aladin options merging into a stale copy`

> `handleSaveOptions` is memoized on a stable setter while closing over
> `savedAladinOptions`, so it keeps merging into the value from the render that
> created it. Today only `cooFrame` is ever saved, so nothing visibly breaks —
> the second option to be saved would drop the first. Switching to the
> functional updater form fixes it and lets the context-value memo take the
> callback as a dependency, clearing two `exhaustive-deps` warnings.
>
> Offered as a small pre-emptive fix rather than a live bug report.

### PR 5 · `up/wheel-zoom` (2 commits — includes PR 1)

**Title:** `fix: make trackpad pinch and scroll zoom at a usable speed`

> aladin-lite's wheel handler ignores `deltaY` magnitude and applies a fixed 2×
> per event. A mouse notch is fine; a trackpad pinch emits ~60 small events a
> second, so zoom compounds absurdly — we measured about 18,000× per second.
>
> This makes the step proportional to `deltaY` (deltaMode-aware) and
> accumulates it into a per-gesture target, because each `zoom.apply` restarts
> a 100 ms animation and stepping from the live `view.fov` loses most of each
> step during a rapid stream. Mouse notch behaviour is unchanged at 2×.
> It works by pre-installing `view.throttledTouchPadZoom`, which aladin only
> creates lazily if absent, so nothing in the package is patched.
>
> Feel is subjective and this is our calibration, not a claim about the right
> one — happy to adjust the constants to taste, or for you to take the
> mechanism and pick your own.
>
> Contains PR 1 as its base since both touch `lib/aladin/helpers.ts`; merge
> that first and this reduces to one commit.

### PR 6 · `up/tile-sw-cache`

**Title:** `perf: serve already-seen HiPS tiles from a service worker cache`

> The tile bucket serves `cache-control: private, max-age=0`, so browsers
> revalidate every tile on every session — about 300 ms each, and a wide field
> of view requests a lot of tiles. Tiles are immutable in practice
> (reprocessings get new paths), so this adds a cache-first service worker for
> tile URLs, plus negative caching of out-of-coverage 404s (cross-origin only,
> 7-day TTL). Reads and writes are best-effort so a storage failure can never
> fail a tile request.
>
> Worth saying: **the better fix is on the data side.** If those tiles were
> served with a long `max-age` this whole file could be deleted, and we'd much
> rather that happened. We've raised that separately — treat this as a
> stopgap for as long as it's useful.
>
> Known gap: `fits`-format tiles aren't matched by the URL pattern.

---

## Tier 2 — repo hygiene and build

### PR 7 · `up/lint-hygiene` (2 commits)

**Title:** `fix: make yarn lint check what it claims to`

> Two things we noticed while wiring up our own CI:
>
> `lint:js` joins prettier and eslint with a single `&`, which backgrounds
> prettier and discards its exit status — so formatting problems can never
> fail the script. Its prettier glob also covers only `js/jsx`, leaving every
> `.ts`/`.tsx` file unchecked.
>
> Fixing both turns up the formatting in these commits (including a few files
> that were already unformatted, and two outdated sass calls stylelint
> rejects). Generated `gql/` is prettier-ignored so the check doesn't fight
> codegen. After this, `yarn lint` exits clean.
>
> This reformats `components/organisms/Aladin/index.tsx`, so it'll conflict
> with PRs 3 and 4 — we're happy to rebase whichever you take second, in
> either order.
>
> We deliberately left out the pre-commit hook we run on our fork: that's a
> workflow preference and yours to make, not something to smuggle in here.

### PR 8 · `up/eslint-dedupe`

**Title:** `chore: dedupe eslint-plugin-import so eslint resolves it uniquely`

> Two copies of `eslint-plugin-import` get installed (top-level via
> `eslint-config-standard`, nested under `eslint-config-next`). A standard yarn
> layout resolves fine, but any layout reaching `node_modules` through a
> symlink — shared installs across git worktrees, pnpm-style setups — makes
> eslint abort with `couldn't determine the plugin "import" uniquely`. A
> `resolutions` pin collapses them.
>
> Only bites in setups you may never use, so entirely reasonable to decline.

### PR 9 · `up/dockerignore`

**Title:** `build: limit the docker build context`

> There's no `.dockerignore`, so `COPY` sends the whole working tree into the
> builder stage — including `node_modules` and `.next` from a local checkout.
>
> Note `.env` is deliberately _not_ excluded: the `yarn-builder` stage
> bind-mounts it, so it has to stay in the context even though the builder
> stage leaves it out of its own `COPY`. That caught us out, hence the comment.

### PR 10 · `up/docker-selfcontain`

**Title:** `fix: make the Docker image self-contained for standalone deployment`

> The `runner` stage copies from `builder`, which is the stage without
> `.next` — so a plain `docker build` produces an image that can't start.
> That's fine in your pipeline, which injects `.next` from a GCS bucket via
> gcsFuse, and we assume it's deliberate.
>
> Copying from `yarn-builder` instead makes a bare `docker build` work while
> leaving your pipeline's behaviour unchanged. If it would interfere with the
> bucket-mount approach in a way we can't see from outside, please drop it.

### PR 11 · `up/gitignore-tsbuild`

**Title:** `chore: ignore typescript incremental build state`

> `tsc` writes `tsconfig.tsbuildinfo`, a machine-local cache that bloats the
> repo and floods diffs if it's ever committed. Three lines.

### PR 12 · `up/env-token-optional`

**Title:** `fix: stop requiring the astro objects token at runtime`

> `NEXT_PUBLIC_ASTRO_OBJECTS_API_TOKEN` is only sent by the browser, from the
> value compiled into the bundle at build time — the server never reads it. But
> `env.ts` validates it at server boot too, so a deployment has to carry a
> second copy at runtime purely to get past the check, one that can only ever
> drift from the compiled-in value.
>
> Making it optional (build-time only) fixed that for us.
> `NEXT_PUBLIC_ASTRO_API_URL` stays required since `lib/fetch.js` does read it
> server-side. This one is closest to a judgement call about your env
> contract, so we'd understand if you'd rather keep the strictness.

---

## Tier 3 — features. These are product decisions, and they're yours

Each of these changes what users see. We're offering working implementations
purely in case they're wanted; we have no view on whether they _should_ be in
Skyviewer, and that call is entirely yours.

### PR 13 · `up/full-sky-zoom` (2 commits — includes PR 1)

**Title:** `feat: allow zooming out to see the whole sky`

> Caps the zoom-out range at 360° rather than the CMS `fovMax` (60–100° on
> current entries), so the view can pull back to the full celestial sphere,
> which renders as a globe.
>
> Squarely a product decision — it overrides a value your CMS deliberately
> exposes, and there may be good reasons that limit exists. Offered as an
> implementation, not a recommendation. Built on PR 1.

### PR 14 · `up/earth-scale`

**Title:** `feat: add an earth-scale comparison for the current field of view`

> An overlay mapping the sky's solid angle onto an equivalent area of Earth, to
> give the field of view an intuitive sense of scale. Entirely additive.
>
> A feature proposal more than a fix — please treat it as a starting point for
> a conversation rather than something to merge as-is.

### PR 15 · `up/sky-curvature` (3 commits — includes PR 14)

**Title:** `feat: show the coordinate grid and an Earth globe when the sky looks curved`

> Builds on PR 14. One shared "is the sky visibly curved?" threshold (fov ≥ 40°,
> released at 30°; the gap stops a settling zoom animation flickering it) drives
> two things: the coordinate grid turns itself on and off, unless the user has
> worked the toggle, after which their choice stands; and the Earth comparison
> swaps between a flat map and a globe so both spheres curve alike.
>
> The globe is a second aladin instance on CDS's Blue Marble HiPS, built once
> and lazily, then hidden rather than unmounted — aladin instances can't be
> destroyed (`View.redraw` re-arms its own rAF and nothing releases the WebGL
> context), so one per open would exhaust the context limit.
>
> The most opinionated thing here by some margin. Very happy for this to be a
> "no", or to split the auto-grid from the globe if only one appeals.

---

## The data-side asks (no patch to send)

Neither is a repo change, and each would obsolete a workaround this fork
carries — which is why they are worth more than any of the PRs above.

**A. Add `hips_order_min = 3` to the HiPS `properties` files.**
Generated by `lsst.pipe.tasks.hips.GenerateHipsTask`, so this belongs to the
pipelines side rather than to `lsst-epo/skyviewer-client` — **already reported
there by Merlin**, and deliberately not duplicated here. Declaring it at
generation time would make #398 and their #396 unnecessary for good, in every
client rather than just this one.

**B. Serve tiles with a long-lived `cache-control`.** Filed as
[lsst-epo/skyviewer-client#397](https://github.com/lsst-epo/skyviewer-client/issues/397).
Currently `private, max-age=0`, forcing a ~300 ms revalidation per tile per
session. Tiles are immutable in practice, so `max-age=31536000` would let
#403's service worker be deleted. The issue notes the bucket may not be theirs
to change and asks for a pointer if so.

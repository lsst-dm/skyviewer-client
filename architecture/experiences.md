# Pages, routing & experiences

## Routing

All user-facing routes live under `app/[locale]/` (locales `en`/`es`/`ja`
from `lib/i18n/settings.ts`; `localePrefix: "as-needed"` so `en` is
unprefixed). `middleware.ts` is just next-intl's `createMiddleware` — no
custom redirects or auth. `app/api/*` sits outside the locale segment.

| Route                                 | Page                    | Notes                                                                                                    |
| ------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `/`                                   | `components/pages/Home` | cover + CTAs; fetches skysynth config only to decide whether to show the "Listen" link                   |
| `/explorer`                           | main viewer             | `getExplorerPage`, `AladinTemplate` + `ExplorerControls` + `CurrentPositionPopover`                      |
| `/skysynth`                           | sonification viewer     | `Listener` is `dynamic(..., {ssr:false})` (p5 needs `window`); its layout hardcodes an unlocalized title |
| `/embed`                              | iframe-targeted viewer  | `embedded` prop hides the menu                                                                           |
| `/guided-experiences`                 | tour category hub       |                                                                                                          |
| `/tours/[tour]/{,intro,tour,summary}` | tour flow               | only `/tours/[tour]/tour` is `force-dynamic` (reads `searchParams.poi`)                                  |

SSG: locales + tour slugs via `generateStaticParams`; everything else is
default-cached RSC, freshened by tag-based revalidation (`services/api/tags.ts`:
`globals`/`tours`/`surveys`) and an `s-maxage=3600` RSC cache-control layer
(`config/headers.ts`, gated by `NEXT_RSC_CACHE_CONTROL`). Every page calls
`setRequestLocale(locale)` first.

**View params (`?target=`, `?fov=`) are client-side only** — read by the
Aladin organism via `useSearchParams` + `clientInitialPosition`, and only on
pages passing `initializeWithParams` (explorer, embed). The server render
never varies on them. The exception is the fork's `?survey=<path>` (which
local survey to show): the explorer page reads it from `searchParams`
**server-side** — so that page renders dynamically — because the layer is
built on the server from the survey's on-disk `properties`
(`lib/hips/local.ts`). An unknown value falls back to the default survey
rather than erroring, which is also what keeps it from escaping the mirror.

## Tours

Flow: `/guided-experiences` → `/tours` → `/tours/[tour]` → `.../intro` →
`.../tour?poi=N` → `.../summary`.

- Data: `services/api/tours/*`. A POI carries its own animation timing
  (`zoomOutTime`, `zoomOutFov`, `panTime`, `zoomInTime`), position
  (`ra/dec/fov`), rich-text description, optional audio (Canto asset) and
  optional per-POI `survey`.
- Engine: `contexts/Tour.tsx`, URL-driven — `?poi=N` (1-based) is the source
  of truth. Transitions run through `lib/aladin/animation.ts`: a **GSAP
  timeline** (labels `startZoomOut`/`startPan`/`startZoomIn`) tweening
  `aladin.gotoRaDec`/`setFov`; some zooms use `motion`'s `animate` instead —
  the GSAP/motion mix is deliberate but inconsistent. `adjustPositionForScreen`
  re-centers targets on narrow screens so the slideout doesn't cover them.
- Per-POI surveys are added as opacity-0 overlays on load and cross-faded on
  transition (`addLayerChange`); aladin's `opacity` constructor option
  doesn't work, so `setOpacity` is always called explicitly.
- Deep links work by re-querying with `offset = poi-1` (`getTourInitial`).
- Tutorial: `nextstepjs` (`components/organisms/TourTutorial`), completion in
  `localStorage.hasCompletedTutorial`; steps target DOM ids
  (`#navigationButtons`, `#shareButton`, ...) — brittle coupling to markup.
- `getCount(category)` fires one query per category card (N+1, Suspense-wrapped).

## Skysynth (sonification)

Two cooperating client pieces over the normal viewer:

- `components/organisms/Listener/index.tsx` samples **pixels from the aladin
  canvas** (`layer.readPixel`) around screen center on position/zoom events —
  a brightness-weighted RGB average plus four cardinal-direction sums.
- `Listener/sketch.jsx` mounts a p5 canvas (pointer-events: none) that:
  preloads 2 instruments × 37 MIDI notes from `public/sonification/sounds/`,
  drives a Perlin-noise `Walker` (teleports back when all cardinals read
  black — off-survey "void"), and plays sources via `SamplePlayer` (flag →
  instrument, `g_r` color → pitch, `gmag` → amplitude) and a continuous
  `PixelSynth` WebAudio drone (RGB hue → scale degree).
- `PointSearcher.js` is the only real _data_ sonification: urql against
  `NEXT_PUBLIC_ASTRO_API_URL` (`getRangeOfAstroObjectsWithLimit`), KD-tree
  neighbor search, FoV-dependent magnitude/limit ladders in `parameters.js`.

Gotchas: `Listener/parameters.js` is a **mutable module-level singleton**
shared between React and p5 (no reset on unmount); `selectedLayerId` defaults
to a hardcoded CMS layer id (`"15642"`) — if CMS ids change, pixel reads
silently go dark.

## Search & astro-objects API

`ExplorerControls/Search`: input with letters → CDS **Sesame** name resolver
via aladin's built-in `A.Utils.Sesame` (browser → SIMBAD/NED direct, no app
backend); otherwise parsed as `ra dec` decimal degrees (zod). Success pans
via `useAladinMove` to fov 0.6 and pushes `?target&fov`. The panel's two
hardcoded "quick link" destinations are duplicated in
`SonificationControls/Navigation/destinations.ts` and are locale-prefix-unaware.

`services/api/astroObject.js` + `components/organisms/Catalogs` (object
detail popups over HiPS catalogs) are **dead code paths** — nothing imports
`Catalogs`; the `Catalog` GraphQL fragment is never queried; the fixtures
(`testHiPSCatalogs`, `testMarkerLayers`, `testPois`, `placeholderTours`) and
the `ExplorerControls/Filters` UI are likewise dormant. The live overlay
mechanism is HiPS _image_ layers from the CMS, not catalogs.

## Share & embed

- `organisms/Share`: social links (`react-share`), copy-link
  (`?target=RA DEC&fov=F`), PNG download via
  `aladin.getViewData("blob","image/png")`; mobile short-circuits into
  `navigator.share()`. Tour variant (`TourControls/Share`) shares `?poi=N`.
- `molecules/EmbedGenerator`: builds an iframe snippet against
  the app's own origin + `/embed`. Known bug: writes `allowed=` instead of
  `allow=`, so its permissions-policy list is inert.
- `organisms/CurrentPositionPopover`: right-click/long-press →
  `pix2world` → formatted coords (decimal or sexagesimal via
  `frameMap`) + copy-link; positioned with `@floating-ui/react-dom`.

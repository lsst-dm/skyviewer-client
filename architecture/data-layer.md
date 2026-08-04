# Data layer: CMS, codegen, zod, env, i18n, API routes

## Craft CMS GraphQL

`services/api/client.ts` exports `queryAPI({query, variables, previewToken?,
fetchOptions?})`: urql `[cacheExchange, fetchExchange]` registered per-request
via `@urql/next/rsc`, URL from `NEXT_PUBLIC_API_URL` (+`?token=` when a
preview token exists). Default `cache: "force-cache"`; with a preview token
it flips to `next.revalidate = 0`. Errors are only `console.warn`ed (a
network error sets `process.exitCode = 1` — effectively a build-failure
signal).

One module per page/section under `services/api/`: `explorer.ts`,
`embed.ts`, `skysynth.ts` (near-identical copy-paste triplet; all collapse
`fovMin/fovMax → fovRange` and `ra/dec → target` in a local zod transform —
skysynth hard-`parse`s, the others `safeParse` and `notFound()` silently),
`tours/` (incl. `paths.ts` for SSG), `guidedExperiences.ts` (has an N+1
`ExperienceCount` query per category), `global/` (`siteInfo_GlobalSet`
selected by *name string match*). Assets come from Canto DAM
(`CantoAssetMinimal` fragment), not Craft volumes.

Cache tags (`services/api/tags.ts`: `globals`/`tours`/`surveys`) are only
attached by globals, tours, and `services/aladin` — **explorer/embed/skysynth
queries carry no tags**, so CMS edits to them rely on `revalidatePath` alone.

Dead code to not be confused by: `services/api/astroObject.js` +
`lib/fetch.js` (legacy `graphql-request` path), the `Catalog` fragment +
`services/api/catalogs/` + `components/organisms/Catalogs` (never queried or
rendered), and the untyped fragment files (`image.js`, `page.js`,
`tourCategory.js`).

## GraphQL codegen

`codegen.ts` → `gql/` via the client preset; call sites use
`import { graphql } from "@/gql"`. **The schema is introspected live from
`NEXT_PUBLIC_API_URL`** — no checked-in schema file, so `yarn codegen` needs
network + a full env (it imports `env.ts`, so even `CRAFT_*` dummies must be
set). After editing any query string, re-run codegen or the tagged template
silently degrades to `unknown` typing.

Fragment masking is generated but unused — results are fed raw into zod, so
**the zod layer is load-bearing, not defensive**: Craft's `Number` scalar
maps to `any` and relation fields type as giant unions; zod coercion is what
actually establishes the shapes.

## Zod schemas (`lib/schema/`, `services/api/*/schema.ts`)

All import from `"zod/v4"` (zod 3.25's v4 subpath) — don't mix with plain
`"zod"`. `lib/schema/survey.ts` (`"server-only"`) is the critical one:
`.catch(x).default(x)` on nearly every field so malformed CMS data degrades
to aladin-safe defaults; its transform does the **survey path rewrites**
(`storage.googleapis.com → /api/gcs/` when `CLOUD_ENV=DEV`;
`images.rubinobservatory.org/hips/ → /api/hips/` when `HIPS_DATA_DIR` set) —
server-side decisions baked into the RSC payload. `surveyLayerSchema` hoists
`opacity`/`optionalLayer`/`showOnLoad` into the survey object. Pattern worth
copying from `tours/schema.ts`: `nullable().default(n).transform(a => a ?? n)`
— `.default()` alone doesn't cover explicit GraphQL `null`.

## env.ts

`@t3-oss/env-nextjs` + zod; **validated at build, at codegen, and at server
boot** (`next.config.js` top-level-awaits it via jiti) — a missing `CRAFT_*`
var crashes `next start` even though those tokens only gate preview routes.
`CLOUD_ENV` defaults to `DEV` (which switches on the GCS-proxy rewrite);
`NODE_ENV` oddly defaults to `test`. `GOOGLE_APPLICATION_CREDENTIALS` is
read via raw `process.env` in `lib/gcs/auth.ts`, outside the schema.

## i18n (dual-stack)

**next-intl owns routing; react-i18next owns strings.** There are zero
next-intl message-API calls: `getRequestConfig` returns only `{locale}`.
Routing: `lib/i18n/{settings,routing,navigation}.ts`, `localePrefix:
"as-needed"` (en unprefixed), locale cookie `NEXT_LOCALE`. Always
import `Link`/`useRouter`/`getPathname` from `@/lib/i18n/navigation`.
Strings: `lib/i18n/localeStrings/{en,es,ja}/translation.json` (en 136 keys;
es/ja lag and fall back silently) + the `epo-react-lib` namespace loaded from
the component library. Client components use `useTranslation()`
(react-i18next); RSCs use `serverTranslation` from `@/lib/i18n/server`
(fresh i18next instance per render). CMS site mapping:
`siteFromLocale("en") → "default"`. Stale traps: `localeStrings/index.js`
imports files that don't exist; `lib/locales.js` is legacy (no `ja`).

## API routes (`app/api/`)

| Route | Purpose | Auth/gate |
|-------|---------|-----------|
| `gcs/[...path]` | dev-only proxy to `storage.googleapis.com` with a `devstorage.read_only` bearer from ADC (`lib/gcs/auth.ts`, fails open) — for embargoed buckets | `CLOUD_ENV === "DEV"` |
| `hips/[...path]` | serves a local HiPS mirror from `$HIPS_DATA_DIR/hips/...` (note hardcoded `hips` subdir); immutable cache on hits, `no-store` on 404s | `HIPS_DATA_DIR` set |
| `preview` | Craft draft-mode entry: validates `?secret` = `CRAFT_SECRET_TOKEN`, resolves the entry via GraphQL and redirects to the *fetched* uri (open-redirect defense), starts draft mode + `previewToken` cookie | secret |
| `revalidate` | `?uri&secret` → `revalidatePath` for every locale + tag revalidation; always answers 200 even on bad tokens (failures easy to miss) | secret |

Preview mode: every `queryAPI` call then auto-uses the cookie token with
`revalidate: 0`; `PreviewMode` renders a banner with end/revalidate server
actions — note the revalidate secret is passed to the client as a prop and
back (known weak point). The `surveys` tag is registered but nothing ever
emits it.

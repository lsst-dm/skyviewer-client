import { defineRouting } from "next-intl/routing";
import { fallbackLng, languages, cookieName } from "./settings";

export const routing = defineRouting({
  // A list of all locales that are supported
  locales: languages,

  // Used when no locale matches
  defaultLocale: fallbackLng,
  /**
   * "as-needed" leaves the default locale unprefixed, which means the bare
   * root has to be rewritten to it internally. That rewrite does not survive
   * a basePath: served under one, every prefixed locale resolves but the
   * default one 404s, and because the middleware also redirects the explicit
   * /en back to the unprefixed root, both entry points dead-end.
   *
   * Prefixing every locale removes the rewrite from the picture. Only done
   * when a base path is actually configured, so deployments served from the
   * root of their own host keep their existing unprefixed URLs.
   */
  localePrefix: process.env.NEXT_PUBLIC_BASE_PATH ? "always" : "as-needed",
  localeCookie: {
    name: cookieName,
  },
});

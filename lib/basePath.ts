import { env } from "@/env";

/**
 * Prefixes a root-relative URL with the app's base path.
 *
 * next applies NEXT_PUBLIC_BASE_PATH to its own routing, links and public/
 * assets, but a URL handed straight to a browser API — aladin's tile
 * fetches, the service worker registration — bypasses all of that, so the
 * prefix has to be part of the URL itself.
 */
export const withBasePath = (path: string): string =>
  `${env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;

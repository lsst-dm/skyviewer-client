import createMiddleware from "next-intl/middleware";
import { routing } from "@/lib/i18n/routing";

export default createMiddleware(routing);

// only applies this middleware to files in the app directory. The root is
// listed explicitly because the catch-all compiles to a pattern requiring a
// slash after the basePath — "^/skyviewer(?:/(...))$" — which the bare
// basePath root never has (next 308s "/skyviewer/" back to "/skyviewer"),
// so without it the middleware is skipped exactly there and the root 404s
// instead of redirecting to the default locale
export const config = {
  matcher: ["/", "/((?!api|static|.*\\..*|_next).*)"],
};

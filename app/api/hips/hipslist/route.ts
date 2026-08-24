import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { withBasePath } from "@/lib/basePath";
import { toHiPSList, toHiPSListJSON } from "@/lib/hips/hipslist";
import { getSurveyCatalogue } from "@/lib/hips/local";

// no-store: a survey staged a moment ago should show up as soon as the
// catalogue notices it, and the list is cheap to rebuild
const CACHE_CONTROL = "no-store";

// the catalogue is scanned at boot and refreshed as surveys are staged, so a
// request-less GET frozen at build time would describe a mirror nobody has
// read yet
export const dynamic = "force-dynamic";

/**
 * The list of HiPS this server publishes, in the format HiPS 1.0 §5.2
 * defines: properties-syntax records separated by blank lines, one per
 * survey found under HIPS_DATA_DIR.
 *
 * A HiPS server must publish one, and it is what lets a client — Aladin
 * Desktop, a script, another HiPS aggregator — discover the staged surveys
 * without being told each one's URL. It answers from the cached catalogue,
 * so it costs nothing beyond the scan the viewer already does.
 *
 * `?fmt=json` renders the same list as JSON, for callers who would rather
 * not write a parser for the text form. That spelling is not this app's
 * invention: it is what the CDS aggregator the standard footnotes in §5.3
 * uses for exactly this. The mandated text form stays the default.
 *
 * 404s when no mirror is configured: this app is then not a HiPS server at
 * all, it points the viewer at someone else's.
 *
 * Next resolves this static segment ahead of the sibling `[...path]` route,
 * so a mirror entry named `hipslist` would be shadowed by this — no staging
 * has one, and `hipslist` is where the standard's own examples put it.
 */
export async function GET(request: NextRequest) {
  if (!env.HIPS_DATA_DIR) {
    return new NextResponse(null, { status: 404 });
  }

  const base = new URL(
    withBasePath("/api/hips"),
    env.NEXT_PUBLIC_BASE_URL
  ).toString();

  const surveys = await getSurveyCatalogue();

  if (request.nextUrl.searchParams.get("fmt") === "json") {
    return NextResponse.json(toHiPSListJSON(surveys, base), {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  }

  return new NextResponse(toHiPSList(surveys, base), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": CACHE_CONTROL,
    },
  });
}

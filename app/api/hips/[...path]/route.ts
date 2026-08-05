import { readFile } from "fs/promises";
import { isAbsolute, join, normalize, extname, basename, dirname } from "path";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import { withUniqueCreatorDid } from "@/lib/hips/properties";

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".fits": "application/fits",
};

/**
 * Serves HiPS survey files from the local mirror in HIPS_DATA_DIR.
 * Survey paths are rewritten to point here by lib/schema/survey.ts when the
 * mirror is configured.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  if (!env.HIPS_DATA_DIR) {
    return new NextResponse(null, { status: 404 });
  }

  const relative = normalize(params.path.filter(Boolean).join("/"));
  if (relative.startsWith("..") || isAbsolute(relative)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    // the URL carries the whole path below HIPS_DATA_DIR, including the
    // "hips" segment a mirror of the public host has. Injecting that segment
    // here instead would make every mirror have to be shaped like the public
    // one, which the surveys staged at USDF are not
    let body = await readFile(join(env.HIPS_DATA_DIR, relative));

    if (basename(relative) === "properties") {
      // the staged surveys share templated creator_did values, and aladin
      // uses creator_did as a HiPS's cache identity: colliding surveys
      // silently adopt each other's options. Serve each survey a value
      // derived from its path, which is unique by construction
      body = Buffer.from(
        withUniqueCreatorDid(
          body.toString("utf8"),
          `ivo://rubin.local/${dirname(relative)}`
        )
      );
    }

    return new NextResponse(body, {
      headers: {
        "Content-Type":
          CONTENT_TYPES[extname(relative)] ?? "application/octet-stream",
        // tiles at a given path are immutable; new processings get new paths
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    // never cache local misses: the mirror may still be filling up, and a
    // cached 404 would hide a tile that has since arrived on disk
    return new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }
}

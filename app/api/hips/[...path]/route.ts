import { readFile } from "fs/promises";
import { isAbsolute, join, normalize, extname } from "path";
import { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";

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
    const body = await readFile(join(env.HIPS_DATA_DIR, "hips", relative));

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

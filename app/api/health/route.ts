import { access, constants } from "fs/promises";
import { NextResponse } from "next/server";
import { env } from "@/env";

// without this, Next evaluates a request-less GET handler once at build
// time and serves the frozen response, which would make the probe pass
// forever regardless of the server's actual state
export const dynamic = "force-dynamic";

// a hung network mount blocks fs calls indefinitely; racing them against a
// deadline turns that into a prompt, attributable 503 instead of a bare
// probe timeout
const FS_CHECK_TIMEOUT_MS = 2_000;

const respond = (status: number, body: Record<string, string>) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

/**
 * Readiness endpoint for the deployment's probes. Answers from the running
 * server without rendering a page, so probes don't ride on CMS latency.
 * When a local HiPS mirror is configured its mount is checked too: a
 * viewer that cannot read tiles isn't serving, even if Next.js is up.
 * External services are deliberately not checked — failing readiness on a
 * dependency the pod cannot fix only widens that dependency's outage.
 */
export async function GET() {
  if (env.HIPS_DATA_DIR) {
    try {
      await Promise.race([
        access(env.HIPS_DATA_DIR, constants.R_OK),
        new Promise((_resolve, reject) =>
          setTimeout(
            () => reject(new Error("HiPS data dir check timed out")),
            FS_CHECK_TIMEOUT_MS
          )
        ),
      ]);
    } catch (error) {
      return respond(503, {
        status: "unhealthy",
        reason:
          error instanceof Error ? error.message : "HiPS data dir unreadable",
      });
    }
  }

  return respond(200, { status: "ok" });
}

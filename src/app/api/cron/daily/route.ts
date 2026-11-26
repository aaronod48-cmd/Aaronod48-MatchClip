import { NextResponse, type NextRequest } from "next/server";
import { expireOldVideos, processDeletions } from "@/lib/video/deletions";

/**
 * The daily clean-up job (Vercel runs it, see vercel.json):
 *   1. remove full match videos 60 days after publishing (clips are kept)
 *   2. delete every waiting video/clip file at the video service
 *
 * Only runs with the right password: Vercel sends "Authorization: Bearer <CRON_SECRET>"
 * when CRON_SECRET is set in the project's settings.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const expired = await expireOldVideos();
  let done = 0;
  let failed = 0;
  // Work through the list in batches (up to 10 x 50 files per run).
  for (let i = 0; i < 10; i++) {
    const r = await processDeletions(50);
    done += r.done;
    failed += r.failed;
    if (r.done + r.failed < 50) break;
  }
  return NextResponse.json({ expiredVideos: expired, filesDeleted: done, filesFailed: failed });
}

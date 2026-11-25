import { NextResponse } from "next/server";
import { isFakeVideoAllowed } from "@/lib/video/provider";

/**
 * Pretend upload address for automatic tests only (VIDEO_PROVIDER=fake).
 * Accepts the video pieces and throws them away. Switched off on Vercel.
 */
export async function PUT(request: Request) {
  if (!isFakeVideoAllowed()) return new NextResponse(null, { status: 404 });
  await request.arrayBuffer(); // read and discard
  return new NextResponse(null, { status: 200 });
}

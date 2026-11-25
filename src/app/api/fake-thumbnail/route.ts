import { NextResponse, type NextRequest } from "next/server";
import { isFakeVideoAllowed } from "@/lib/video/provider";

/** Pretend still frame for automatic tests only (VIDEO_PROVIDER=fake). Switched off on Vercel. */
export function GET(request: NextRequest) {
  if (!isFakeVideoAllowed()) return new NextResponse(null, { status: 404 });
  const t = Number(request.nextUrl.searchParams.get("t") ?? 0).toFixed(0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="#2f6b3a"/><line x1="480" y1="0" x2="480" y2="540" stroke="#fff" stroke-width="4"/>
  <circle cx="480" cy="270" r="70" fill="none" stroke="#fff" stroke-width="4"/>
  <text x="24" y="48" font-size="32" fill="#fff" font-family="sans-serif">Test frame · ${t}s</text></svg>`;
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" } });
}

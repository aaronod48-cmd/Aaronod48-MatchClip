"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { frameFor, type FrameResult } from "@/lib/video/frames";

function dbMessage(error: { code?: string; message: string } | null): string {
  if (error && (error.code === "22023" || error.code === "42501")) return error.message;
  return "Something went wrong. Please try again.";
}

export async function getFrameAction(matchId: string, half: "first" | "second", seconds: number): Promise<FrameResult> {
  if (half !== "first" && half !== "second") return { error: "Unknown half." };
  const supabase = await createClient();
  return frameFor(supabase, matchId, half, Number(seconds) || 0);
}

export async function saveTapAction(
  matchId: string,
  half: "first" | "second",
  seconds: number,
  x: number,
  y: number,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_match_tap", {
    p_match: matchId,
    p_half: half,
    p_seconds: Math.round(seconds * 100) / 100,
    p_x: Math.round(x * 10000) / 10000,
    p_y: Math.round(y * 10000) / 10000,
  });
  return error ? { error: dbMessage(error) } : {};
}

export type SendState = { error?: string } | undefined;

export async function sendToCoachAction(_prev: SendState, form: FormData): Promise<SendState> {
  const matchId = String(form.get("matchId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_match", { p_match: matchId });
  if (error) return { error: dbMessage(error) };
  redirect(`/matches/${matchId}?sent=1`);
}

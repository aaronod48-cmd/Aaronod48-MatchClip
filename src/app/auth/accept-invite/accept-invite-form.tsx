"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Field, Message } from "@/components/ui";
import { passwordProblem, passwordRules } from "@/lib/auth/validation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Stage = "checking" | "ready" | "expired" | "saving";

/**
 * Invite links put a one-time login in the page address (after the #),
 * which only the browser can read. We use it to sign the teen in, remove it
 * from the address straight away, then ask them to choose a password.
 */
export function AcceptInviteForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    // Take the login out of the address bar so it isn't kept in history.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);

    const supabase = createBrowserSupabase();
    (async () => {
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        setStage(error ? "expired" : "ready");
        return;
      }
      // Page reloaded after signing in: carry on if still signed in.
      const { data } = await supabase.auth.getUser();
      setStage(data.user ? "ready" : "expired");
    })();
  }, []);

  async function save(form: FormData) {
    const password = String(form.get("password") ?? "");
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== String(form.get("confirm") ?? "")) return setError("The two passwords don't match.");
    setError(null);
    setStage("saving");
    const { error } = await createBrowserSupabase().auth.updateUser({ password });
    if (error) {
      setError("Couldn't save your password. Please try again.");
      setStage("ready");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  if (stage === "checking") return <p className="text-muted">Checking your invite…</p>;
  if (stage === "expired") {
    return (
      <Message kind="error">
        This invite link has expired or was already used. Please ask your parent or guardian to send a new invite.
      </Message>
    );
  }
  return (
    <form action={save} className="space-y-5">
      <p className="text-muted">Welcome! Choose a password for your own login.</p>
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={passwordRules.minLength}
        hint={passwordRules.description}
      />
      <Field label="Type it again" name="confirm" type="password" autoComplete="new-password" required />
      {error && <Message kind="error">{error}</Message>}
      <button
        type="submit"
        disabled={stage === "saving"}
        className="w-full rounded-xl bg-lime px-4 py-3 font-semibold text-pitch disabled:opacity-60"
      >
        {stage === "saving" ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

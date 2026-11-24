"use server";

import { redirect } from "next/navigation";
import { checkSignUp, friendlyAuthError, isValidEmail, passwordProblem } from "@/lib/auth/validation";
import { siteOrigin } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; notice?: string; email?: string } | undefined;

export async function signUpAction(_prev: FormState, form: FormData): Promise<FormState> {
  const checked = checkSignUp(form);
  if (!checked.ok) return { error: checked.error };
  const { accountType, firstName, email, password } = checked.value;

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await siteOrigin()}/auth/callback`,
      // The database only accepts 'parent' or 'player' here (Step 3).
      data: { account_type: accountType, display_name: firstName },
    },
  });
  if (error) return { error: friendlyAuthError(error.message) };

  // Same message whether or not the email was already registered,
  // so nobody can use this form to find out who has an account.
  redirect(`/check-email?for=signup`);
}

export async function logInAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!isValidEmail(email) || !password) {
    return { error: "Please enter your email and password.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const notConfirmed = error.message.toLowerCase().includes("email not confirmed");
    return { error: friendlyAuthError(error.message), email, notice: notConfirmed ? "resend" : undefined };
  }
  redirect("/dashboard");
}

export async function resendVerificationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) return { error: "Please enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback` },
  });
  if (error) return { error: friendlyAuthError(error.message), email };
  return { notice: "If that email is waiting to be verified, we've sent a new link.", email };
}

export async function forgotPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) return { error: "Please enter a valid email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error && friendlyAuthError(error.message).startsWith("Too many")) {
    return { error: friendlyAuthError(error.message) };
  }
  redirect(`/check-email?for=reset`);
}

export async function resetPasswordAction(_prev: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: friendlyAuthError(error.message) };
  redirect("/dashboard?updated=password");
}

export async function logOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login?signedOut=1");
}

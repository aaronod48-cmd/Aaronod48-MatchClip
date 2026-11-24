/**
 * Checks for what people type into the sign-up, login and password forms.
 * Kept separate from the screens so they can be tested on their own.
 */

export const passwordRules = {
  minLength: 10,
  description: "At least 10 characters, with letters and numbers.",
} as const;

/** Only these can be chosen at sign-up. Coach/admin are given by an admin. */
export const signUpAccountTypes = ["parent", "player"] as const;
export type SignUpAccountType = (typeof signUpAccountTypes)[number];

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/** Returns a plain-English problem, or null if the password is fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < passwordRules.minLength) {
    return `Password must be at least ${passwordRules.minLength} characters.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    return "Password must include both letters and numbers.";
  }
  if (password.length > 72) return "Password is too long (72 characters max).";
  return null;
}

export type SignUpInput = {
  accountType: SignUpAccountType;
  firstName: string;
  email: string;
  password: string;
};

export type SignUpCheck =
  | { ok: true; value: SignUpInput }
  | { ok: false; error: string };

export function checkSignUp(form: FormData): SignUpCheck {
  const accountType = String(form.get("accountType") ?? "");
  const firstName = String(form.get("firstName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const isAdult = form.get("isAdult") === "yes";

  if (!signUpAccountTypes.includes(accountType as SignUpAccountType)) {
    return { ok: false, error: "Please choose whether you're a parent or a player." };
  }
  if (!firstName) return { ok: false, error: "Please enter your first name." };
  if (firstName.length > 40) return { ok: false, error: "First name is too long." };
  if (!isValidEmail(email)) return { ok: false, error: "Please enter a valid email address." };
  const pw = passwordProblem(password);
  if (pw) return { ok: false, error: pw };
  if (!isAdult) {
    return {
      ok: false,
      error:
        "You need to be 18 or over to create an account. If you're under 18, ask a parent or guardian to sign up and add you.",
    };
  }
  return { ok: true, value: { accountType: accountType as SignUpAccountType, firstName, email, password } };
}

/**
 * Where to send someone after a link. Only paths inside this site are
 * allowed, so a link can never bounce someone to another website.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}

/** Turns Supabase's technical errors into plain English. */
export function friendlyAuthError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don't match. Please try again.";
  if (m.includes("email not confirmed")) return "Please verify your email first. Check your inbox for the link we sent.";
  if (m.includes("rate limit") || m.includes("too many")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (m.includes("weak") || m.includes("password should")) return passwordRules.description;
  if (m.includes("same") && m.includes("password")) return "Please choose a different password from your old one.";
  return "Something went wrong. Please try again.";
}

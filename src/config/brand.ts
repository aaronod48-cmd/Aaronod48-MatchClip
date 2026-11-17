/**
 * BRAND SETTINGS — the ONLY place the product name lives.
 *
 * The name, domain and handle are still being checked (trademark etc.),
 * so nothing else in the app may type the name directly. Change it here
 * and it changes everywhere.
 *
 * Colours live in src/app/globals.css (look for "BRAND COLOURS").
 * Browser-tab icon: src/app/icon.svg. Phone home-screen icon: src/app/apple-icon.png.
 */
export const brand = {
  name: "MatchClip",
  tagline: "Coach-reviewed clips from your own matches.",
  supportEmail: "support@example.com", // placeholder until the domain is decided
  domain: "example.com", // placeholder until the domain is decided
  instagram: "@matchclipapp",
  /** Logo symbol (no words), transparent background. Swap the file to change the logo. */
  logo: "/brand/logo-mark.svg",
} as const;

export type Brand = typeof brand;

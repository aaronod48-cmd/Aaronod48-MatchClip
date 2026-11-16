/**
 * BRAND SETTINGS — the ONLY place the product name lives.
 *
 * The name, domain and handle are still being checked (trademark etc.),
 * so nothing else in the app may type the name directly. Change it here
 * and it changes everywhere.
 *
 * Colours live in src/app/globals.css (look for "BRAND COLOURS").
 */
export const brand = {
  name: "MatchClip",
  tagline: "Coach-reviewed clips from your own matches.",
  supportEmail: "support@example.com", // placeholder until the domain is decided
  domain: "example.com", // placeholder until the domain is decided
  instagram: "@matchclipapp",
} as const;

export type Brand = typeof brand;

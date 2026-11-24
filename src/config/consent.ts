/**
 * PARENT/GUARDIAN CONSENT WORDING — DRAFT for legal review before launch.
 *
 * If the wording changes in any way that matters, change `version` here AND
 * in the database (private.current_consent_version, via a new migration).
 * A test fails if the two ever differ. Each consent record stores the version
 * the parent agreed to, so you always know who agreed to what.
 *
 * {child} is replaced with the child's first name; {brand} with the product name.
 */
export const consent = {
  version: "v1-draft",
  title: "Your consent for {child}",
  intro:
    "Before {child} can use {brand}, we need your permission as their parent or guardian. Please read this. It's short.",
  sections: [
    {
      heading: "What we keep about {child}",
      points: [
        "First name, birth year and team (if you add one). No full birthday, address, school or location.",
        "Match videos you or {child} upload, the short clips made from them, and the coach's notes, tags and reports.",
      ],
    },
    {
      heading: "Why",
      points: ["Only to give {child} coach-reviewed clips and a report to help them improve."],
    },
    {
      heading: "Who can see it",
      points: [
        "You, {child} (if you later give them their own login), and the coach assigned to {child}.",
        "Nobody else. Videos and clips are private. There are no public links, and any link you choose to share expires.",
        "Every time staff open {child}'s videos, it's recorded, and you can see that record.",
      ],
    },
    {
      heading: "Coaches and AI",
      points: [
        "A real coach checks every clip, note and report before {child} sees it.",
        "Computer tools may suggest moments to the coach, but they never show anything to {child} directly.",
        "{child}'s videos won't be sent to any AI service unless we've checked that service's data terms first.",
      ],
    },
    {
      heading: "Where it's stored",
      points: [
        "Account details are stored in Australia (Sydney).",
        "Before video uploads are switched on, we'll tell you where videos are stored.",
      ],
    },
    {
      heading: "You stay in control",
      points: [
        "You can withdraw this consent at any time. The coach loses access straight away.",
        "You can delete {child} and everything about them at any time. Deleting really deletes it.",
        "Questions? Email {support}.",
      ],
    },
  ],
  confirmLabel:
    "I am {child}'s parent or legal guardian. I've read this and I agree to {child} using {brand} as described.",
} as const;

/** Fills in the child's name, product name and support email. */
export function fillConsent(text: string, values: { child: string; brand: string; support: string }) {
  return text
    .replaceAll("{child}", values.child)
    .replaceAll("{brand}", values.brand)
    .replaceAll("{support}", values.support);
}

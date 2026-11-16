/**
 * AGE RULES — change these numbers here if the lawyer advises a different line.
 *
 * - Under `ownLoginMinAge`: the child has no login. Only the parent's account is used.
 * - From `ownLoginMinAge` up to (but not including) `adultAge`: the parent may invite
 *   the child to their own login. The parent still sees everything and can delete everything.
 * - `adultAge` and over: the player can sign up on their own, no parent needed.
 *
 * The database checks the same numbers (added in a later step), so the rule
 * cannot be bypassed by skipping the app's screens.
 */
export const ageRules = {
  ownLoginMinAge: 13,
  adultAge: 18,
} as const;

export type AgeGroup = "child" | "teen" | "adult";

/** Works out the age group from a birth year. We only store the birth year, not the full date. */
export function ageGroupFromBirthYear(
  birthYear: number,
  today: Date = new Date(),
): AgeGroup {
  // Without the full birth date we can't know if the birthday has passed yet this year,
  // so we use the YOUNGER possible age. That way we never treat a child as older than they are.
  const youngestPossibleAge = today.getFullYear() - birthYear - 1;
  if (youngestPossibleAge >= ageRules.adultAge) return "adult";
  if (youngestPossibleAge >= ageRules.ownLoginMinAge) return "teen";
  return "child";
}

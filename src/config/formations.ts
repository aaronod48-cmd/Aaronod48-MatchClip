/**
 * TEAM SHAPES and their positions, used on the "tap yourself" screen.
 *
 * The position CODES must match the database (private.valid_position in
 * supabase/migrations). A test fails if they ever differ.
 *
 * x, y are where each position sits on a pitch drawing, as fractions:
 * x = 0 left touchline, 1 right touchline; y = 0 own goal, 1 opponent's goal.
 */
export type Position = { code: string; label: string; x: number; y: number };

export const formations = {
  "4-4-2": [
    { code: "GK", label: "Goalkeeper", x: 0.5, y: 0.05 },
    { code: "RB", label: "Right back", x: 0.85, y: 0.25 },
    { code: "RCB", label: "Right centre back", x: 0.62, y: 0.2 },
    { code: "LCB", label: "Left centre back", x: 0.38, y: 0.2 },
    { code: "LB", label: "Left back", x: 0.15, y: 0.25 },
    { code: "RM", label: "Right midfield", x: 0.85, y: 0.52 },
    { code: "RCM", label: "Right centre midfield", x: 0.62, y: 0.48 },
    { code: "LCM", label: "Left centre midfield", x: 0.38, y: 0.48 },
    { code: "LM", label: "Left midfield", x: 0.15, y: 0.52 },
    { code: "RST", label: "Right striker", x: 0.6, y: 0.8 },
    { code: "LST", label: "Left striker", x: 0.4, y: 0.8 },
  ],
  "4-3-3": [
    { code: "GK", label: "Goalkeeper", x: 0.5, y: 0.05 },
    { code: "RB", label: "Right back", x: 0.85, y: 0.25 },
    { code: "RCB", label: "Right centre back", x: 0.62, y: 0.2 },
    { code: "LCB", label: "Left centre back", x: 0.38, y: 0.2 },
    { code: "LB", label: "Left back", x: 0.15, y: 0.25 },
    { code: "RCM", label: "Right centre midfield", x: 0.7, y: 0.48 },
    { code: "CM", label: "Centre midfield", x: 0.5, y: 0.42 },
    { code: "LCM", label: "Left centre midfield", x: 0.3, y: 0.48 },
    { code: "RW", label: "Right winger", x: 0.85, y: 0.78 },
    { code: "ST", label: "Striker", x: 0.5, y: 0.84 },
    { code: "LW", label: "Left winger", x: 0.15, y: 0.78 },
  ],
} as const satisfies Record<string, readonly Position[]>;

export type TeamShape = keyof typeof formations;
export const teamShapes = Object.keys(formations) as TeamShape[];

/** Each half is uploaded separately (owner's choice), up to this long. */
export const maxHalfMinutes = 60;

/** The full match video is deleted this many days after the coach publishes; clips are kept. */
export const fullVideoKeepDays = 60;

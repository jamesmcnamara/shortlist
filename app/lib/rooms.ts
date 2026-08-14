import type { CycleLength } from "@/src/db/schema";

export interface RoomConfig {
  nominationsPerCycle: number | null;
  votesPerCycle: number;
  cycleLength: CycleLength;
  allowSelfVote: boolean;
  allowDuplicateNominations: boolean;
}

export type PresetName = "club" | "watchlist";

/**
 * Presets are just starting values for the same knobs — there is no behavioral
 * branch anywhere downstream on which preset a room was created from.
 */
export const PRESETS: Record<PresetName, RoomConfig> = {
  club: {
    nominationsPerCycle: 1,
    votesPerCycle: 5,
    cycleLength: "month",
    allowSelfVote: false,
    allowDuplicateNominations: false,
  },
  watchlist: {
    nominationsPerCycle: null,
    votesPerCycle: 5,
    cycleLength: "never",
    allowSelfVote: true,
    allowDuplicateNominations: false,
  },
};

export const PRESET_LABELS: Record<PresetName, string> = {
  club: "Movie club",
  watchlist: "Watch list",
};

export const PRESET_DESCRIPTIONS: Record<PresetName, string> = {
  club: "One nomination each per month, then everyone votes.",
  watchlist: "Add as many movies as you like; votes decide what rises.",
};

export const isPresetName = (value: unknown): value is PresetName =>
  value === "club" || value === "watchlist";

const MAX_SLUG_LENGTH = 60;

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH);

export const isValidSlug = (slug: string): boolean =>
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= MAX_SLUG_LENGTH;

const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Ambiguous characters are excluded so codes survive being read aloud. */
export const generateInviteCode = (length = 10): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length],
  ).join("");
};

/**
 * Validates a partial config update from the admin panel, returning either the
 * columns to write or the first problem found.
 */
export function parseConfigUpdate(
  body: unknown,
): { ok: true; values: Partial<RoomConfig> } | { ok: false; error: string } {
  const input = (body ?? {}) as Record<string, unknown>;
  const values: Partial<RoomConfig> = {};

  if ("nominationsPerCycle" in input) {
    const raw = input.nominationsPerCycle;
    if (raw === null) {
      values.nominationsPerCycle = null;
    } else {
      const count = Number(raw);
      if (!Number.isInteger(count) || count < 1) {
        return {
          ok: false,
          error: "Nominations per cycle must be a positive whole number.",
        };
      }
      values.nominationsPerCycle = count;
    }
  }

  if ("votesPerCycle" in input) {
    const count = Number(input.votesPerCycle);
    if (!Number.isInteger(count) || count < 0) {
      return {
        ok: false,
        error: "Votes per cycle must be zero or a positive whole number.",
      };
    }
    values.votesPerCycle = count;
  }

  if ("cycleLength" in input) {
    const length = input.cycleLength;
    if (length !== "month" && length !== "week" && length !== "never") {
      return { ok: false, error: "Cycle length must be month, week or never." };
    }
    values.cycleLength = length;
  }

  for (const flag of ["allowSelfVote", "allowDuplicateNominations"] as const) {
    if (flag in input) {
      if (typeof input[flag] !== "boolean") {
        return { ok: false, error: `${flag} must be true or false.` };
      }
      values[flag] = input[flag];
    }
  }

  return { ok: true, values };
}

import type { CycleLength, Room } from "@/src/db/schema";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type CycleConfig = Pick<Room, "cycleLength" | "createdAt">;

/**
 * The cycle a moment falls into, relative to when the room was created.
 *
 * Rooms with a `never` cycle collapse to a single always-open period, so every
 * query keeps the same `where cycle = currentCycle(room)` shape regardless of
 * whether the room resets.
 */
export const cycleFor = (room: CycleConfig, at: Date = new Date()): number => {
  const start = room.createdAt;
  switch (room.cycleLength as CycleLength) {
    case "never":
      return 0;
    case "week":
      return Math.max(
        0,
        Math.floor((at.getTime() - start.getTime()) / WEEK_MS),
      );
    case "month":
      return Math.max(0, monthsBetween(start, at));
    default:
      return 0;
  }
};

const monthsBetween = (start: Date, end: Date): number => {
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  // The final month is not complete until the anniversary instant is reached.
  return end.getTime() < addUTCMonths(start, months).getTime()
    ? months - 1
    : months;
};

const addUTCMonths = (date: Date, months: number): Date => {
  const shifted = new Date(date.getTime());
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  // Clamp, so a room created on the 31st does not roll into the next month.
  const lastDay = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return shifted;
};

export const CYCLE_LENGTHS: CycleLength[] = ["month", "week", "never"];

export const isCycleLength = (value: unknown): value is CycleLength =>
  typeof value === "string" && CYCLE_LENGTHS.includes(value as CycleLength);

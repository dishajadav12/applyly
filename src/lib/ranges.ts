import { endOfDay, startOfDay, subDays, subMonths } from "date-fns";
import { HISTORY_START } from "@/lib/config";

export const RANGE_PRESETS = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "1m", label: "Last month" },
  { value: "2m", label: "Last 2 months" },
  { value: "3m", label: "Last 3 months" },
  { value: "since", label: "Since May 1, 2026" },
  { value: "custom", label: "Custom range" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["value"];

/** Resolves a preset (or custom start/end dates) to a concrete [start, end] in local time. */
export function resolveRange(
  preset: RangePreset,
  now: Date = new Date(),
  custom?: { start?: string; end?: string },
): { start: Date; end: Date } {
  switch (preset) {
    case "24h":
      return { start: subDays(now, 1), end: now };
    case "7d":
      return { start: subDays(now, 7), end: now };
    case "1m":
      return { start: subMonths(now, 1), end: now };
    case "2m":
      return { start: subMonths(now, 2), end: now };
    case "3m":
      return { start: subMonths(now, 3), end: now };
    case "since":
      return { start: new Date(HISTORY_START.year, HISTORY_START.monthIndex, HISTORY_START.day), end: now };
    case "custom": {
      if (!custom?.start || !custom?.end) throw new Error("Custom range needs a start and end date");
      // <input type="date"> gives YYYY-MM-DD; parse as local dates, end inclusive.
      const start = startOfDay(new Date(`${custom.start}T00:00:00`));
      const end = endOfDay(new Date(`${custom.end}T00:00:00`));
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("Invalid custom dates");
      if (start > end) throw new Error("Start date must be before end date");
      return { start, end };
    }
  }
}

const PACIFIC_MONTH = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
});

/** The month a moment falls in, like "2026-03". It rolls over at midnight Pacific on the 1st. */
export function cycleOf(date: Date): string {
  const { year, month } = Object.fromEntries(
    PACIFIC_MONTH.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${year}-${month}`;
}

/** Longest note kept on a saved case [characters]. */
export const MAX_SCENARIO_NOTES = 2000;

/** Notes as stored on a case: cut to the limit, and absent rather than blank. */
export function scenarioNotes(value: unknown): { notes?: string } {
  return typeof value === "string" && value.trim().length > 0
    ? { notes: value.slice(0, MAX_SCENARIO_NOTES) }
    : {};
}

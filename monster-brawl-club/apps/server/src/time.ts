/** Day key (UTC) used for daily counters, missions and play-time caps. */
export const dayKey = (d = new Date()): string => d.toISOString().slice(0, 10);

export function sameUtcDay(a: Date | null | undefined, b = new Date()): boolean {
  return !!a && dayKey(a) === dayKey(b);
}

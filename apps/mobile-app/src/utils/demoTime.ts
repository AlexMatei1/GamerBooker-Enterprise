/** Local illustrative day labels; no timezone/server scheduling claim. */
export function demoEndTime(
  start: string,
  hours: number,
  initialDay = 0,
): string {
  const match = start.match(/(\d{1,2}):(\d{2})/);
  if (!match) return start;
  const minutes = Number(match[1]) * 60 + Number(match[2]) + hours * 60;
  const day = initialDay + Math.floor(minutes / 1440);
  const time =
    `${Math.floor((minutes % 1440) / 60)}`.padStart(2, "0") +
    ":" +
    `${minutes % 60}`.padStart(2, "0");
  const label =
    day === 0 ? "Astăzi" : day === 1 ? "Mâine" : `Peste ${day} zile`;
  return `${label}, ${time}`;
}
export function extendDemoEndTime(end: string): string {
  const day = end.startsWith("Mâine")
    ? 1
    : Number(end.match(/^Peste (\d+) zile/)?.[1] || 0);
  return demoEndTime(end, 1, day);
}

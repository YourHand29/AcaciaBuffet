const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(diff);
  let text: string;
  if (abs < MINUTE) text = "now";
  else if (abs < HOUR) text = `${Math.round(abs / MINUTE)}m`;
  else if (abs < DAY) text = `${Math.round(abs / HOUR)}h`;
  else if (abs < 30 * DAY) text = `${Math.round(abs / DAY)}d`;
  else text = `${Math.round(abs / (30 * DAY))}mo`;
  if (text === "now") return text;
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatDay(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "No due date";
  const date = new Date(iso);
  const days = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

export function groupByDay<T extends { dueAt: string | null }>(items: T[], now: Date = new Date()): DayGroup<T>[] {
  const groups = new Map<string, DayGroup<T>>();
  const sorted = [...items].sort((a, b) => {
    if (a.dueAt === b.dueAt) return 0;
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt < b.dueAt ? -1 : 1;
  });
  for (const item of sorted) {
    const key = item.dueAt ? startOfDay(new Date(item.dueAt)).toISOString() : "none";
    let group = groups.get(key);
    if (!group) {
      group = { key, label: formatDay(item.dueAt, now), items: [] };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()];
}

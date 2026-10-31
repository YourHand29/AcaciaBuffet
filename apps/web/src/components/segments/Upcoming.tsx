import type { UpcomingItemDto } from "@acacia/shared";
import { UpcomingList } from "../UpcomingList";

export function Upcoming({ items, options }: { items: UpcomingItemDto[]; options: Record<string, unknown> }) {
  const limit = typeof options.limit === "number" ? options.limit : undefined;
  const shown = limit !== undefined ? items.slice(0, limit) : items;
  return <UpcomingList items={shown} showCourse={false} emptyText="Nothing upcoming for this course" />;
}

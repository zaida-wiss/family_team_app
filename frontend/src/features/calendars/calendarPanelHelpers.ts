import type { Calendar, Id, Member, Role } from "@shared/types";
import { canEditSharedResource, hasPermission } from "../../utils/permissions";
import type { ImportedCalendarEvent } from "./calendarIcs";

export function canEditCalendar(member: Member, roles: Role[], calendar: Calendar, members: Member[]) {
  if (!hasPermission(member, roles, "canEditCalendar")) return false;
  if (canEditSharedResource(member, calendar)) return true;
  if (!member.isChild) {
    const owner = members.find((m) => m.id === calendar.ownerId);
    if (!owner || owner.isChild) return true;
  }
  return false;
}

export function getMemberName(memberId: Id, members: Member[]) {
  return members.find((m) => m.id === memberId)?.name ?? "Okänd medlem";
}

export function formatTimeRange(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
  });
  return `${formatter.format(new Date(startsAt))}–${formatter.format(new Date(endsAt))}`;
}

const SW = new Set([
  "och","för","av","i","på","med","är","att","en","ett","de","det","den",
  "till","från","men","om","så","vid","som","har","vi","du","ni","han",
  "hon","kan","ska","var","dag","dagar","kl","år","vecka"
]);

export function buildKeywordGroups(events: ImportedCalendarEvent[]): Map<string, number[]> {
  const freq = new Map<string, number[]>();
  for (const [i, ev] of events.entries()) {
    const words = ev.title.toLowerCase().match(/[a-zåäö]{3,}/g) ?? [];
    for (const word of new Set(words)) {
      if (SW.has(word)) continue;
      const bucket = freq.get(word) ?? [];
      if (bucket.length === 0) freq.set(word, bucket);
      bucket.push(i);
    }
  }
  return new Map(
    [...freq.entries()]
      .filter(([, idx]) => idx.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 20)
      .map(([word, idx]) => [word.charAt(0).toUpperCase() + word.slice(1), idx])
  );
}

export function buildCategoryGroups(events: ImportedCalendarEvent[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const [i, ev] of events.entries()) {
    for (const cat of ev.categories) {
      const bucket = groups.get(cat) ?? [];
      if (bucket.length === 0) groups.set(cat, bucket);
      bucket.push(i);
    }
  }
  return groups;
}

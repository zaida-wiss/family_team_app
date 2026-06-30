import { CalendarModel } from "../db/models/Calendar.js";
import { AppError } from "../utils/errors.js";

export async function getAllCalendars(accountId: string, from?: string, until?: string) {
  const cals = await CalendarModel.find({ accountId }, { _id: 0, __v: 0 }).lean();
  const now = new Date();
  const defaultFrom = new Date(now); defaultFrom.setDate(1);
  const defaultUntil = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fromStr = from ?? defaultFrom.toISOString().slice(0, 10);
  const untilStr = until ?? defaultUntil.toISOString().slice(0, 10);
  const sub1mAgo = new Date(now); sub1mAgo.setMonth(sub1mAgo.getMonth() - 1);
  const retentionCutoff = sub1mAgo.toISOString().slice(0, 10);

  return cals.map((cal) => {
    const keepAllHistory = (cal as any).keepAllHistory ?? false;
    return {
      ...cal,
      events: (cal.events as { startsAt: string; deletedAt?: string | null }[]).filter((ev) => {
        if (ev.deletedAt) return false;
        const d = (ev.startsAt ?? "").slice(0, 10);
        if (!keepAllHistory && d < retentionCutoff) return false;
        return d >= fromStr && d <= untilStr;
      }),
    };
  });
}

export async function createCalendar(data: unknown) {
  const calendar = new CalendarModel({ ...(data as object), subscriptions: [] });
  await calendar.save();
  return { id: calendar.id };
}

export async function updateCalendar(calendarId: string, patch: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const { color, name, ownerId, keepAllHistory } = patch as {
    color?: string; name?: string; ownerId?: string; keepAllHistory?: boolean;
  };
  if (color) calendar.color = color;
  if (name) calendar.name = name;
  if (ownerId) calendar.ownerId = ownerId;
  if (keepAllHistory !== undefined) (calendar as any).keepAllHistory = keepAllHistory;
  await calendar.save();
}

export async function deleteCalendar(calendarId: string, memberId: string | null) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  calendar.deletedAt = new Date().toISOString();
  calendar.deletedBy = memberId;
  await calendar.save();
}

export async function restoreCalendar(calendarId: string) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  calendar.deletedAt = null;
  calendar.deletedBy = null;
  await calendar.save();
}

export async function shareCalendar(calendarId: string, memberId: string, access: "view" | "edit") {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const existing = calendar.sharedWith.find((s) => s.memberId === memberId);
  if (existing) { existing.access = access; }
  else { calendar.sharedWith.push({ memberId, access }); }
  calendar.markModified("sharedWith");
  await calendar.save();
}

export async function unshareCalendar(calendarId: string, memberId: string) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  calendar.sharedWith = calendar.sharedWith.filter((s) => s.memberId !== memberId);
  calendar.markModified("sharedWith");
  await calendar.save();
}

export async function addEvent(calendarId: string, event: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  calendar.events.push(event as any);
  await calendar.save();
}

export async function importEvents(calendarId: string, source: unknown, events: unknown[]) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  calendar.importedSources.push(source as any);
  for (const event of events) { calendar.events.push(event as any); }
  await calendar.save();
}

export async function updateEvent(calendarId: string, eventId: string, patch: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const event = calendar.events.find((e) => e.id === eventId);
  if (!event) throw new AppError(404, "Händelse hittades inte");

  Object.assign(event, patch);
  calendar.markModified("events");
  await calendar.save();
}

export async function deleteEvent(calendarId: string, eventId: string, memberId: string | null) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const event = calendar.events.find((e) => e.id === eventId);
  if (!event) throw new AppError(404, "Händelse hittades inte");

  event.deletedAt = new Date().toISOString();
  event.deletedBy = memberId;
  calendar.markModified("events");
  await calendar.save();
}

export async function rsvpEvent(
  calendarId: string,
  eventId: string,
  memberId: string,
  status: "pending" | "accepted" | "declined"
) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const event = calendar.events.find((e) => e.id === eventId);
  if (!event) throw new AppError(404, "Händelse hittades inte");

  const attendee = event.attendees?.find((a) => a.memberId === memberId);
  if (attendee) { attendee.status = status; }
  calendar.markModified("events");
  await calendar.save();
}

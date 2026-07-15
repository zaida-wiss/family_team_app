import { CalendarModel } from "../db/models/Calendar.js";
import { AppError } from "../utils/errors.js";
import { CalendarEventPatchSchema, CalendarEventSchema, ImportedCalendarSourceSchema } from "../../../shared/schemas.js";
import { decryptField, decryptNullable, encryptField, encryptNullable } from "../utils/fieldEncryption.js";

// Krypteringen är transparent för anroparen (routes, delade typer, frontend) —
// title/notes krypteras precis innan de sparas och dekrypteras precis innan de
// returneras. API-kontraktet är oförändrat (ADR-0014).
export function decryptEvent<T extends { title: string; notes: string | null }>(accountId: string, event: T): T {
  return {
    ...event,
    title: decryptNullable(accountId, event.title) as string,
    notes: decryptNullable(accountId, event.notes) ?? null
  };
}

export async function getAllCalendars(accountId: string, from?: string, until?: string) {
  const now = new Date();
  const defaultFrom = new Date(now); defaultFrom.setDate(1);
  const defaultUntil = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fromStr = from ?? defaultFrom.toISOString().slice(0, 10);
  const untilStr = until ?? defaultUntil.toISOString().slice(0, 10);
  const sub1mAgo = new Date(now); sub1mAgo.setMonth(sub1mAgo.getMonth() - 1);
  const retentionCutoff = sub1mAgo.toISOString().slice(0, 10);

  // Filtrera händelser i MongoDB i stället för i JavaScript — minskar payload
  // dramatiskt när ICS-prenumerationer importerat tusentals händelser.
  const calendars = await CalendarModel.aggregate([
    { $match: { accountId } },
    {
      $addFields: {
        events: {
          $filter: {
            input: "$events",
            as: "ev",
            cond: {
              $and: [
                { $eq: ["$$ev.deletedAt", null] },
                { $gte: [{ $substrCP: ["$$ev.startsAt", 0, 10] }, fromStr] },
                { $lte: [{ $substrCP: ["$$ev.startsAt", 0, 10] }, untilStr] },
                {
                  $or: [
                    { $eq: ["$keepAllHistory", true] },
                    { $gte: [{ $substrCP: ["$$ev.startsAt", 0, 10] }, retentionCutoff] },
                  ],
                },
              ],
            },
          },
        },
      },
    },
    { $project: { _id: 0, __v: 0 } },
  ]);

  return calendars.map((calendar) => ({
    ...calendar,
    events: calendar.events.map((event: { title: string; notes: string | null }) =>
      decryptEvent(accountId, event)
    ),
    subscriptions: (calendar.subscriptions ?? []).map((sub: { url: string }) => ({
      ...sub,
      url: decryptField(accountId, sub.url)
    }))
  }));
}

export async function createCalendar(data: unknown) {
  const calendar = new CalendarModel({ ...(data as object), subscriptions: [] });
  await calendar.save();
  return { id: calendar.id };
}

export async function updateCalendar(calendarId: string, accountId: string, patch: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
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

export async function deleteCalendar(calendarId: string, accountId: string, memberId: string | null) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  calendar.deletedAt = new Date().toISOString();
  calendar.deletedBy = memberId;
  await calendar.save();
}

export async function restoreCalendar(calendarId: string, accountId: string) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  calendar.deletedAt = null;
  calendar.deletedBy = null;
  await calendar.save();
}

export async function shareCalendar(calendarId: string, accountId: string, memberId: string, access: "view" | "edit") {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const existing = calendar.sharedWith.find((s) => s.memberId === memberId);
  if (existing) { existing.access = access; }
  else { calendar.sharedWith.push({ memberId, access }); }
  calendar.markModified("sharedWith");
  await calendar.save();
}

export async function unshareCalendar(calendarId: string, accountId: string, memberId: string) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  calendar.sharedWith = calendar.sharedWith.filter((s) => s.memberId !== memberId);
  calendar.markModified("sharedWith");
  await calendar.save();
}

export async function addEvent(calendarId: string, accountId: string, memberId: string, event: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const validated = CalendarEventSchema.parse(event);
  calendar.events.push({
    ...validated,
    title: encryptField(accountId, validated.title),
    notes: encryptNullable(accountId, validated.notes) ?? null,
    calendarId,
    createdBy: memberId
  } as any);
  await calendar.save();
}

export async function importEvents(
  calendarId: string,
  accountId: string,
  memberId: string,
  payload: { source: unknown; events: unknown[] }
) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const validatedSource = ImportedCalendarSourceSchema.parse(payload.source);
  calendar.importedSources.push(validatedSource as any);
  for (const event of payload.events) {
    const validated = CalendarEventSchema.parse(event);
    calendar.events.push({
      ...validated,
      title: encryptField(accountId, validated.title),
      notes: encryptNullable(accountId, validated.notes) ?? null,
      calendarId,
      createdBy: memberId
    } as any);
  }
  await calendar.save();
}

export async function updateEvent(calendarId: string, accountId: string, eventId: string, patch: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const eventIndex = calendar.events.findIndex((e) => e.id === eventId);
  if (eventIndex === -1) throw new AppError(404, "Händelse hittades inte");
  const event = calendar.events[eventIndex];

  const validated = CalendarEventPatchSchema.parse(patch);
  if (validated.title !== undefined) validated.title = encryptField(accountId, validated.title);
  if ("notes" in validated) validated.notes = encryptNullable(accountId, validated.notes) ?? null;

  // Kalenderbyte (2026-07-15, buggfix): redigera-modalens kalenderväljare
  // skickar calendarId i patchen om användaren valt en annan kalender än
  // händelsens nuvarande. events ligger inbäddat per kalender-dokument, så
  // ett byte innebär att flytta hela subdokumentet till målkalenderns
  // events-array, inte bara ett fältvärde.
  if (validated.calendarId !== undefined && validated.calendarId !== calendarId) {
    const targetCalendar = await CalendarModel.findOne({ id: validated.calendarId, accountId });
    if (!targetCalendar) throw new AppError(404, "Målkalender hittades inte");

    // event är typad som ren CalendarEvent (Schema<Calendar> exponerar inget
    // Mongoose-subdokument-API mot TS), men är i praktiken ett
    // subdokument — ett spread `{...event}` fångar bara egna enumerable
    // properties och missar all faktisk data (Mongoose lagrar fälten bakom
    // interna getters), vilket gav ett "moved"-objekt utan title/startsAt/
    // etc och en Mongoose-valideringskrasch vid push. `.toObject()` (samma
    // mönster som redan används på hela Calendar-dokument i denna fil) ger
    // det riktiga, fullständiga fältinnehållet.
    const plainEvent = (event as unknown as { toObject(): typeof event }).toObject();
    const moved = { ...plainEvent, ...validated };

    // Målet sparas FÖRE källan rensas (2026-07-15, incident-fix) — en
    // produktionsbugg i ett tidigare försök gjorde tvärtom (källan sparades
    // rensad FÖRST), så när målets save() sedan kastade ett
    // Mongoose-valideringsfel var händelsen redan borta ur källan men aldrig
    // skriven till målet — permanent dataförlust. Med den här ordningen är
    // värsta möjliga utfall av ett misslyckande istället en ofarlig
    // dubblett (finns kvar i båda), aldrig att händelsen försvinner helt.
    targetCalendar.events.push(moved as any);
    targetCalendar.markModified("events");
    await targetCalendar.save();

    calendar.events.splice(eventIndex, 1);
    calendar.markModified("events");
    await calendar.save();
    return;
  }

  Object.assign(event, validated);
  calendar.markModified("events");
  await calendar.save();
}

export async function deleteEvent(calendarId: string, accountId: string, eventId: string, memberId: string | null) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
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
  accountId: string,
  eventId: string,
  memberId: string,
  status: "pending" | "accepted" | "declined"
) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const event = calendar.events.find((e) => e.id === eventId);
  if (!event) throw new AppError(404, "Händelse hittades inte");

  const attendee = event.attendees?.find((a) => a.memberId === memberId);
  if (attendee) { attendee.status = status; }
  calendar.markModified("events");
  await calendar.save();
}

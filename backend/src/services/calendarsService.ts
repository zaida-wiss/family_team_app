import { CalendarModel } from "../db/models/Calendar.js";
import { MemberModel } from "../db/models/Member.js";
import { AccountModel } from "../db/models/Account.js";
import { AppError } from "../utils/errors.js";
import type { CalendarEvent } from "../../../shared/types.js";
import { CalendarEventPatchSchema, CalendarEventSchema, ImportedCalendarSourceSchema } from "../../../shared/schemas.js";
import { decryptField, decryptNullable, encryptField, encryptNullable } from "../utils/fieldEncryption.js";
import { getAllRoles } from "./rolesService.js";
import { hasPermission } from "../../../shared/permissions.js";
import { logger } from "../utils/logger.js";
import { pushEventDelete, pushEventUpsert } from "./appleCalDavService.js";
import { AppleCalDavAccountModel } from "../db/models/AppleCalDavAccount.js";
import { findAcceptedConnectionFrom } from "./familyConnectionsService.js";

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

  // ADR-0027-tillägg (2026-07-30) — Apple-inloggningen ligger nu på
  // KONTONIVÅ (AppleCalDavAccount), inte längre inbäddad i varje
  // CalDavConnection. Slå upp de berörda kontona en gång (inte per
  // kalender/anslutning) och dekryptera bara e-posten för visning
  // ("Ansluten som: x@icloud.com") — lösenordet lämnar ALDRIG backend i
  // klartext eller krypterad form, samma princip som GDPR-exportens
  // uteslutning.
  const appleAccounts = await AppleCalDavAccountModel.find({ accountId });
  const appleEmailById = new Map(
    appleAccounts.map((a) => [a.id, decryptField(accountId, a.accountEmailEnc)])
  );

  return calendars.map((calendar) => ({
    ...calendar,
    events: calendar.events.map((event: { title: string; notes: string | null }) =>
      decryptEvent(accountId, event)
    ),
    subscriptions: (calendar.subscriptions ?? []).map((sub: { url: string }) => ({
      ...sub,
      url: decryptField(accountId, sub.url)
    })),
    calDavConnections: (calendar.calDavConnections ?? []).map((conn: { appleAccountId: string }) => ({
      ...conn,
      accountEmail: appleEmailById.get(conn.appleAccountId) ?? null
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

  const { color, name, ownerId, keepAllHistory, shareAcrossMyAccounts } = patch as {
    color?: string; name?: string; ownerId?: string; keepAllHistory?: boolean; shareAcrossMyAccounts?: boolean;
  };
  if (color) calendar.color = color;
  if (name) calendar.name = name;
  if (ownerId) calendar.ownerId = ownerId;
  if (keepAllHistory !== undefined) (calendar as any).keepAllHistory = keepAllHistory;
  if (shareAcrossMyAccounts !== undefined) (calendar as any).shareAcrossMyAccounts = shareAcrossMyAccounts;
  await calendar.save();
}

function defaultMonthRange(from?: string, until?: string) {
  const now = new Date();
  const defaultFrom = new Date(now); defaultFrom.setDate(1);
  const defaultUntil = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    fromStr: from ?? defaultFrom.toISOString().slice(0, 10),
    untilStr: until ?? defaultUntil.toISOString().slice(0, 10)
  };
}

// En delad kalender byggs om till ett RIKTIGT Calendar-format (samma form
// som getAllCalendars redan returnerar) — 2026-07-30, Zaidas uppföljning:
// "kalender man valt att dela med respektive familj skall komma upp i
// familjens tillgängliga kalendrar" (inte en separat, avskild lista). Namnet
// suffigeras med källfamiljens namn ("Moa jobb (Familj B)") så den syns
// tydligt vem den kommer från i alla kalendervyer, utan att någon
// visningskomponent behöver särskiljas. `readOnly: true` är den ENDA
// spärren mot redigering — useCalendarView.ts:s editableCalendars utesluter
// den explicit, oavsett andra behörigheter.
function toReadOnlyCalendar(
  cal: { id: string; name: string; color: string; events: unknown[] },
  sourceAccountId: string,
  sourceAccountName: string,
  fromStr: string,
  untilStr: string
) {
  return {
    id: cal.id,
    accountId: sourceAccountId,
    name: `${cal.name} (${sourceAccountName})`,
    color: cal.color,
    ownerId: "",
    sharedWith: [],
    deletedAt: null,
    deletedBy: null,
    importedSources: [],
    subscriptions: [],
    calDavConnections: [],
    readOnly: true,
    events: (cal.events as unknown as CalendarEvent[])
      .filter((ev) => !ev.deletedAt && ev.startsAt.slice(0, 10) >= fromStr && ev.startsAt.slice(0, 10) <= untilStr)
      .map((ev) => decryptEvent(sourceAccountId, ev as unknown as { title: string; notes: string | null }))
  };
}

// "Mina familjekonton" (2026-07-30, Zaidas önskemål: "alla privata
// kalendrar som jag skapat skall jag kunna dela med samtliga familjer jag
// är medlem i") — samma mönster som getCrossAccountFamilyTodos
// (todosService.ts): mina EGNA, riktiga medlemskap i andra konton (flera
// Member-poster med samma userId), ingen ny behörighetsmodell. MEDVETET
// LÄSBART bara (Zaidas val: "bara jag själv" ser den, ingen redigering
// cross-account i denna omgång) — men numera en RIKTIG, filtrerbar kalender
// i den vanliga Kalender-panelen (se toReadOnlyCalendar ovan), inte en
// separat sammanfattningslista.
export async function getCrossAccountCalendars(
  callerUserId: string,
  currentAccountId: string,
  currentMemberId: string,
  from?: string,
  until?: string
) {
  const currentMember = await MemberModel.findOne({ id: currentMemberId, accountId: currentAccountId });
  const hidden = new Set(currentMember?.hiddenCrossAccountIds ?? []);
  const { fromStr, untilStr } = defaultMonthRange(from, until);

  const memberDocs = await MemberModel.find({ userId: callerUserId, deletedAt: null });
  const results = [];
  for (const m of memberDocs) {
    if (!m.accountId || m.accountId === currentAccountId || hidden.has(m.accountId)) continue;
    const account = await AccountModel.findOne({ id: m.accountId });
    if (!account) continue;

    // .lean() (2026-07-30-fyndet, Zaidas rapport: "RangeError: Invalid time
    // value") — utan den är cal.events Mongoose-SUBDOKUMENT, och decryptEvent
    // nedans {...event}-spread fångar bara egna enumerable properties (inte
    // fälten, som ligger bakom getters) — startsAt/endsAt kom tillbaka som
    // undefined, och formatTimeRange (frontend) kraschade på new Date(undefined).
    // Samma bugklass som redan dokumenterats flera gånger i den här
    // kodbasen (calendarsService.ts:s updateEvent, appleCalDavService.ts:s
    // pushEventUpsert) — bara aldrig tillämpad här förrän nu.
    const shared = await CalendarModel.find({
      accountId: m.accountId,
      ownerId: m.id,
      deletedAt: null,
      shareAcrossMyAccounts: true
    }).lean();
    for (const cal of shared) {
      results.push(toReadOnlyCalendar(cal, m.accountId, account.name, fromStr, untilStr));
    }
  }
  return results;
}

// Familjeanslutningar (ADR-0030, tillägg 2026-07-30, Zaidas rättelse: "det
// räcker att man delat familjeanslutningen... det räcker att man är med i
// den") — skiljer sig från getCrossAccountCalendars ovan (samma PERSON, flera
// EGNA medlemskap, synligt bara för den personen): här är det två OLIKA
// familjekonton som ömsesidigt anslutit sig, synligt för HELA den anslutna
// familjen. Samma exposedMemberIds-mönster som getConnectionTodos
// (todosService.ts) — en kalender blir synlig när dess ÄGARE är en
// exponerad medlem i en accepterad anslutning med dataScope.calendars på.
// Medvetet LÄSBART bara, oavsett anslutningens access-nivå — att bygga en
// fullt redigerbar cross-account-kalender är en väsentligt större
// integration, inte efterfrågad denna gång.
export async function getConnectionCalendars(
  callerAccountId: string,
  callerMemberId: string | null,
  from?: string,
  until?: string
) {
  const caller = await MemberModel.findOne({ id: callerMemberId, accountId: callerAccountId, deletedAt: null });
  if (!caller) {
    throw new AppError(403, "Åtkomst nekad");
  }
  const { fromStr, untilStr } = defaultMonthRange(from, until);

  const accountsExposingToMe = await AccountModel.find({
    familyConnections: { $elemMatch: { otherAccountId: callerAccountId, status: "accepted" } }
  });

  const results = [];
  for (const account of accountsExposingToMe) {
    const conn = findAcceptedConnectionFrom(callerAccountId, account);
    if (!conn || !conn.dataScope.calendars || conn.exposedMemberIds.length === 0) continue;
    const exposedSet = new Set(conn.exposedMemberIds);

    // .lean() — se samma fynd/kommentar i getCrossAccountCalendars ovan.
    const exposedCalendars = await CalendarModel.find({
      accountId: account.id,
      ownerId: { $in: [...exposedSet] },
      deletedAt: null
    }).lean();
    for (const cal of exposedCalendars) {
      results.push(toReadOnlyCalendar(cal, account.id, account.name, fromStr, untilStr));
    }
  }
  return results;
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

// ADR-0025 (2026-07-23, Zaidas beslut): explicit, permanent tömning av
// papperskorgen — ett medvetet undantag från "aldrig hard delete"-regeln,
// scopat strikt till kalendrar som redan gått igenom mjuk radering. Riktig
// deleteMany, ingen väg tillbaka. Övriga funktioner i den här filen saknar
// fortfarande server-side behörighetskontroll (känt, ej fixat fynd, se
// CLAUDE.md) — den kontrollen läggs bara till här, inte i hela filen.
export async function purgeTrash(accountId: string, callerMemberId: string | null) {
  const caller = await MemberModel.findOne({ id: callerMemberId, accountId, deletedAt: null });
  if (!caller) {
    throw new AppError(403, "Åtkomst nekad");
  }
  const roles = await getAllRoles(accountId);
  if (!hasPermission(caller, roles, "canRestoreFromTrash")) {
    throw new AppError(403, "Åtkomst nekad");
  }
  await CalendarModel.deleteMany({ accountId, deletedAt: { $ne: null } });
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
  // ADR-0027 (2026-07-24) — skriver ut händelsen till en ansluten Apple-
  // kalender om kalendern har en aktiv CalDavConnection. Fire-and-forget,
  // precis som appens övriga SSE/realtidsmönster: lokal skrivning är redan
  // sanningen, extern synk är bästa-möjliga-ansträngning (fel loggas på
  // anslutningens lastSyncError, blockerar aldrig den lokala sparningen).
  pushEventUpsert(calendarId, accountId, validated.id).catch((e) => logger.error(e));
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
  pushEventUpsert(calendarId, accountId, eventId).catch((e) => logger.error(e));
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
  pushEventDelete(calendarId, accountId, event as unknown as import("../../../shared/types.js").CalendarEvent).catch((e) =>
    logger.error(e)
  );
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

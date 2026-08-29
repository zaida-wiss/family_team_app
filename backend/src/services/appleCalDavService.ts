import { createDAVClient } from "tsdav";
import { CalendarModel } from "../db/models/Calendar.js";
import { AppleCalDavAccountModel } from "../db/models/AppleCalDavAccount.js";
import type { CalDavConnection, CalendarEvent } from "../../../shared/types.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { decryptField, decryptNullable, encryptField } from "../utils/fieldEncryption.js";
import {
  parseIcsEvents,
  reconcileExistingEvents,
  insertNewEvents,
  subscriptionCutoffs,
  normalizeSyncInterval,
} from "./calendarSubscriptionsService.js";
import { requireAdultMember } from "./todoCategoriesService.js";

// ADR-0027 (2026-07-24, uppdaterad 2026-07-30) — tvåvägs CalDAV-anslutning
// mot iCloud. Till skillnad från IcsSubscription (calendarSubscriptionsService.ts,
// läs-bar, ingen autentisering) skriver appen HÄR aktivt till Apples server
// också.
//
// 2026-07-30, Zaidas beslut: "tvåvägssynken med apple kontot skall inte
// fyllas i inuti någon kalender utan på en högre nivå så att sedan kalendrar
// kan använda sig av tvåvägssynkens olika kalendrar" — Apple-ID/lösenordet
// loggas nu in EN gång per Apple-konto (AppleCalDavAccount, kontobred
// collection), inte en gång per BMAD-kalender. En CalDavConnection
// REFERERAR ett sådant konto (`appleAccountId`) istället för att äga egna
// creds — flera BMAD-kalendrar kan alltså dela samma inloggning, var och en
// mot sin egen valda Apple-kalender.
//
// Fas 1-begränsningar, medvetna (inte glömda):
// - En kalender stöder bara EN aktiv CalDAV-anslutning åt gången (enklare
//   semantik för "vart pushar en lokalt skapad händelse" — se connect nedan).
// - Ingen RRULE-expansion vid pull (samma begränsning som IcsSubscription
//   redan har — en återkommande Apple-serie hämtas som en enda post).
// - En händelse pullad från Apple men ALDRIG redigerad i appen saknar egen
//   calDavEtag/calDavHref tills första gången den pushas ut igen — den
//   pushen blir då en ovillkorad PUT (skriver om precis det vi själva just
//   hämtade sekunder/minuter tidigare, låg risk). Först DÄREFTER används
//   ETag för att upptäcka en samtidig extern ändring.
//
// requireAdultMember (2026-08-30, säkerhetsfynd under Zod-validerings-
// audit) — samtliga mutations-/listningsfunktioner nedan hade tidigare
// BARA kontoscoping (routes/calendars.ts:s attachAccountId), ingen
// roll-/behörighetskontroll alls. Till skillnad från ett vanligt
// kalenderevent lagrar detta ett riktigt Apple-ID + app-specifikt lösenord
// delat för HELA kontot (ADR-0027) — vilken kontomedlem som helst (även ett
// barn med egen inloggning) kunde tidigare se att kontot finns, lägga till
// ett NYTT Apple-konto, eller koppla bort en förälders redan aktiva
// synk. Samma "servern är den auktoritativa gränsen, inte bara UI:t"-
// princip som redan etablerad i calendarsService.ts (Story 3,
// 2026-08-11) och ADR-0035 — gated bakom samma requireAdultMember som
// redan skyddar recipes/mealPlan/birthdays/householdSecrets m.fl.
// (todoCategoriesService.ts). Manuell synk (pullConnectionById) lämnad
// UTANFÖR denna spärr — exponerar inga creds, bara en dataomhämtning.

const APPLE_SERVER_URL = "https://caldav.icloud.com";

async function buildClient(accountEmail: string, appSpecificPassword: string) {
  return createDAVClient({
    serverUrl: APPLE_SERVER_URL,
    credentials: { username: accountEmail, password: appSpecificPassword },
    authMethod: "Basic",
    defaultAccountType: "caldav",
  });
}

async function recordSyncError(calendarId: string, connectionId: string, message: string) {
  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) return;
  const conn = (calendar.calDavConnections as unknown as CalDavConnection[]).find((c) => c.id === connectionId);
  if (!conn) return;
  conn.lastSyncError = message;
  calendar.markModified("calDavConnections");
  await calendar.save();
  logger.error(`CalDAV-fel (${connectionId}): ${message}`);
}

// ── ICS-serialisering (motsatsen till parseIcsEvents) ──────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIcsDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function toIcsDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildVeventIcs(event: {
  uid: string;
  title: string;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  notes: string | null;
  location: string | null;
}): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FamiljeappBMAD//SV", "BEGIN:VEVENT", `UID:${event.uid}`, `DTSTAMP:${toIcsDateTime(new Date().toISOString())}`];
  if (event.isAllDay) {
    const endExclusive = new Date(new Date(event.endsAt).getTime() + 86_400_000).toISOString();
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(event.startsAt)}`);
    lines.push(`DTEND;VALUE=DATE:${toIcsDate(endExclusive)}`);
  } else {
    lines.push(`DTSTART:${toIcsDateTime(event.startsAt)}`);
    lines.push(`DTEND:${toIcsDateTime(event.endsAt)}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
  if (event.notes) lines.push(`DESCRIPTION:${escapeIcsText(event.notes)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

// ── Lista Apple-kalendrar (för väljaren i UI:t) ─────────────────────────────────

// Normaliserar displayName — tsdav/XML-parsern kan ge en sträng ELLER ett
// objekt (t.ex. om Apple skickar ett namespace-kvalificerat värde) beroende
// på hur elementet var strukturerat i CalDAV-svaret.
function displayNameOf(value: string | Record<string, unknown> | undefined, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  return fallback;
}

// Slår bara upp listan (sparar/ansluter ingenting) — återanvänds av
// addAppleAccount (verifiera inloggning innan den sparas) och av
// listCalendarsForAppleAccount (samma sak, med redan lagrade creds).
export async function listAppleCalendars(body: unknown) {
  const b = body as { accountEmail?: unknown; appSpecificPassword?: unknown };
  const accountEmail = typeof b.accountEmail === "string" ? b.accountEmail.trim() : "";
  const appSpecificPassword = typeof b.appSpecificPassword === "string" ? b.appSpecificPassword.trim() : "";
  if (!accountEmail || !appSpecificPassword) {
    throw new AppError(400, "Apple-ID och app-specifikt lösenord krävs");
  }

  const client = await buildClient(accountEmail, appSpecificPassword).catch(() => {
    throw new AppError(502, "Kunde inte logga in mot Apple — kontrollera Apple-ID och app-specifikt lösenord");
  });
  const calendars = await client.fetchCalendars().catch(() => {
    throw new AppError(502, "Kunde inte hämta kalendrar från Apple");
  });
  const withUrl = calendars.filter((c) => c.url);
  if (withUrl.length === 0) throw new AppError(502, "Inga kalendrar hittades på Apple-kontot");

  return withUrl.map((c, i) => ({
    url: String(c.url),
    name: displayNameOf(c.displayName, `Kalender ${i + 1}`),
  }));
}

function maskAccount(accountId: string, acc: { id: string; accountEmailEnc: string; connectedAt: string }) {
  return {
    id: acc.id,
    accountEmail: decryptField(accountId, acc.accountEmailEnc),
    connectedAt: acc.connectedAt,
  };
}

// ── Apple-konton (kontonivå, 2026-07-30) ────────────────────────────────────────

export async function addAppleAccount(accountId: string, memberId: string, body: unknown) {
  await requireAdultMember(memberId, accountId);
  const b = body as { accountEmail?: unknown; appSpecificPassword?: unknown };
  const accountEmail = typeof b.accountEmail === "string" ? b.accountEmail.trim() : "";
  const appSpecificPassword = typeof b.appSpecificPassword === "string" ? b.appSpecificPassword.trim() : "";
  if (!accountEmail || !appSpecificPassword) {
    throw new AppError(400, "Apple-ID och app-specifikt lösenord krävs");
  }

  // Verifiera inloggningen INNAN den sparas — samma princip som förut, bara
  // flyttad hit (till engångstillfället man lägger till kontot) istället för
  // att köras om varje gång en enskild kalender ansluts.
  await listAppleCalendars({ accountEmail, appSpecificPassword });

  const now = new Date().toISOString();
  const acc = new AppleCalDavAccountModel({
    id: `apple-acct-${crypto.randomUUID()}`,
    accountId,
    accountEmailEnc: encryptField(accountId, accountEmail),
    appSpecificPasswordEnc: encryptField(accountId, appSpecificPassword),
    createdBy: memberId,
    connectedAt: now,
  });
  await acc.save();
  return maskAccount(accountId, acc);
}

export async function listAppleAccounts(accountId: string, memberId: string) {
  await requireAdultMember(memberId, accountId);
  const accounts = await AppleCalDavAccountModel.find({ accountId });
  return accounts.map((a) => maskAccount(accountId, a));
}

// Listar kalendrarna på ett REDAN tillagt Apple-konto — använder de lagrade
// creds:en, ingen ny inloggningsruta behövs när man kopplar ihop en ENSKILD
// BMAD-kalender med kontot.
export async function listCalendarsForAppleAccount(accountId: string, memberId: string, appleAccountId: string) {
  await requireAdultMember(memberId, accountId);
  const acc = await AppleCalDavAccountModel.findOne({ id: appleAccountId, accountId });
  if (!acc) throw new AppError(404, "Apple-konto hittades inte");
  return listAppleCalendars({
    accountEmail: decryptField(accountId, acc.accountEmailEnc),
    appSpecificPassword: decryptField(accountId, acc.appSpecificPasswordEnc),
  });
}

export async function removeAppleAccount(accountId: string, memberId: string, appleAccountId: string) {
  await requireAdultMember(memberId, accountId);
  const acc = await AppleCalDavAccountModel.findOne({ id: appleAccountId, accountId });
  if (!acc) throw new AppError(404, "Apple-konto hittades inte");

  // Koppla bort alla BMAD-kalendrar som använder detta konto — samma
  // mjuk-radera-pullade-händelser-logik som en enskild frånkoppling
  // (disconnectAppleCalendar nedan), bara applicerad på flera kalendrar.
  const calendars = await CalendarModel.find({
    accountId,
    "calDavConnections.appleAccountId": appleAccountId,
  });
  const now = new Date().toISOString();
  for (const calendar of calendars) {
    const connIds = (calendar.calDavConnections as unknown as CalDavConnection[])
      .filter((c) => c.appleAccountId === appleAccountId)
      .map((c) => c.id);
    for (const ev of calendar.events as unknown as CalendarEvent[]) {
      if (ev.subscriptionId && connIds.includes(ev.subscriptionId) && !ev.deletedAt) ev.deletedAt = now;
    }
    calendar.calDavConnections = (calendar.calDavConnections as unknown as CalDavConnection[]).filter(
      (c) => c.appleAccountId !== appleAccountId
    ) as never;
    calendar.markModified("events");
    calendar.markModified("calDavConnections");
    await calendar.save();
  }

  await AppleCalDavAccountModel.deleteOne({ id: appleAccountId, accountId });
}

// Bygger en tsdav-klient utifrån ett REDAN lagrat Apple-konto (via
// connectionens appleAccountId) — återanvänds av pull/push nedan, som bara
// bär en REFERENS till kontot, inte längre egna creds.
async function buildClientForConnection(accountId: string, conn: CalDavConnection) {
  const acc = await AppleCalDavAccountModel.findOne({ id: conn.appleAccountId, accountId });
  if (!acc) return null;
  return buildClient(
    decryptField(accountId, acc.accountEmailEnc),
    decryptField(accountId, acc.appSpecificPasswordEnc)
  ).catch(() => null);
}

// ── Anslut/koppla bort en enskild BMAD-kalender ─────────────────────────────────

export async function connectAppleCalendar(calendarId: string, accountId: string, memberId: string, body: unknown) {
  await requireAdultMember(memberId, accountId);
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");
  if ((calendar.calDavConnections as unknown as CalDavConnection[]).length > 0) {
    throw new AppError(409, "Kalendern har redan en aktiv CalDAV-anslutning — koppla bort den först");
  }

  const b = body as { appleAccountId?: unknown; calendarUrl?: unknown };
  const appleAccountId = typeof b.appleAccountId === "string" ? b.appleAccountId.trim() : "";
  const chosenCalendarUrl = typeof b.calendarUrl === "string" ? b.calendarUrl.trim() : "";
  if (!appleAccountId || !chosenCalendarUrl) {
    throw new AppError(400, "Ett Apple-konto och en vald kalender krävs");
  }

  const acc = await AppleCalDavAccountModel.findOne({ id: appleAccountId, accountId });
  if (!acc) throw new AppError(404, "Apple-konto hittades inte");

  // Verifierar att den valda kalendern fortfarande finns på Apple-kontot
  // (kan ha tagits bort där sedan listningen gjordes).
  const client = await buildClient(
    decryptField(accountId, acc.accountEmailEnc),
    decryptField(accountId, acc.appSpecificPasswordEnc)
  ).catch(() => {
    throw new AppError(502, "Kunde inte logga in mot Apple");
  });
  const calendars = await client.fetchCalendars().catch(() => {
    throw new AppError(502, "Kunde inte hämta kalendrar från Apple");
  });
  const target = calendars.find((c) => c.url && String(c.url) === chosenCalendarUrl);
  if (!target?.url) throw new AppError(502, "Den valda kalendern hittades inte längre på Apple-kontot");

  const now = new Date().toISOString();
  const connection: CalDavConnection = {
    id: `caldav-${crypto.randomUUID()}`,
    calendarId,
    provider: "apple",
    appleAccountId,
    externalCalendarHref: String(target.url),
    syncIntervalMinutes: 15,
    lastSyncedAt: null,
    lastSyncError: null,
    createdBy: memberId,
    connectedAt: now,
  };
  (calendar.calDavConnections as unknown as CalDavConnection[]).push(connection);
  calendar.markModified("calDavConnections");
  await calendar.save();

  pullConnection(calendarId, accountId, connection).catch((e) => logger.error(e));

  return { ...connection, accountEmail: decryptField(accountId, acc.accountEmailEnc) };
}

export async function disconnectAppleCalendar(calendarId: string, accountId: string, memberId: string, connectionId: string) {
  await requireAdultMember(memberId, accountId);
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");

  const now = new Date().toISOString();
  for (const ev of calendar.events as unknown as CalendarEvent[]) {
    if (ev.subscriptionId === connectionId && !ev.deletedAt) ev.deletedAt = now;
  }
  calendar.calDavConnections = (calendar.calDavConnections as unknown as CalDavConnection[]).filter(
    (c) => c.id !== connectionId
  ) as never;
  calendar.markModified("events");
  calendar.markModified("calDavConnections");
  await calendar.save();
}

export async function updateCalDavConnectionInterval(
  calendarId: string,
  accountId: string,
  memberId: string,
  connectionId: string,
  syncIntervalMinutes: unknown
) {
  await requireAdultMember(memberId, accountId);
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");
  const conn = (calendar.calDavConnections as unknown as CalDavConnection[]).find((c) => c.id === connectionId);
  if (!conn) throw new AppError(404, "CalDAV-anslutning hittades inte");
  conn.syncIntervalMinutes = normalizeSyncInterval(syncIntervalMinutes);
  calendar.markModified("calDavConnections");
  await calendar.save();
}

// ── Pull (extern → appen) ───────────────────────────────────────────────────────

export async function pullConnectionById(calendarId: string, accountId: string, connectionId: string) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");
  const conn = (calendar.calDavConnections as unknown as CalDavConnection[]).find((c) => c.id === connectionId);
  if (!conn) throw new AppError(404, "CalDAV-anslutning hittades inte");
  await pullConnection(calendarId, accountId, conn);
}

export async function pullConnection(calendarId: string, accountId: string, conn: CalDavConnection) {
  const client = await buildClientForConnection(accountId, conn);
  if (!client) {
    await recordSyncError(calendarId, conn.id, "Kunde inte logga in mot Apple");
    return;
  }

  const objects = await client
    .fetchCalendarObjects({ calendar: { url: conn.externalCalendarHref } as never })
    .catch(() => null);
  if (!objects) {
    await recordSyncError(calendarId, conn.id, "Kunde inte hämta händelser från Apple");
    return;
  }

  const calendar = await CalendarModel.findOne({ id: calendarId });
  if (!calendar) return;

  const nowStr = new Date().toISOString();
  const { cutoffSub } = subscriptionCutoffs(new Date());

  const incoming = objects
    .flatMap((obj) => (obj.data ? parseIcsEvents(obj.data) : []))
    .filter((ev) => ev.startsAt.slice(0, 10) >= cutoffSub);
  const incomingByUid = new Map(incoming.filter((e) => e.uid).map((e) => [e.uid as string, e]));

  reconcileExistingEvents(calendar as never, conn.id, incomingByUid, cutoffSub, nowStr, accountId);
  insertNewEvents(calendar as never, calendarId, conn.id, incoming, accountId);
  calendar.markModified("events");

  const stored = (calendar.calDavConnections as unknown as CalDavConnection[]).find((c) => c.id === conn.id);
  if (stored) {
    stored.lastSyncedAt = nowStr;
    stored.lastSyncError = null;
  }
  calendar.markModified("calDavConnections");
  await calendar.save();
}

// ── Push (appen → extern), anropas fire-and-forget från calendarsService.ts ────

export async function pushEventUpsert(calendarId: string, accountId: string, eventId: string) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) return;
  const conn = (calendar.calDavConnections as unknown as CalDavConnection[])[0];
  if (!conn) return;

  const event = (calendar.events as unknown as CalendarEvent[]).find((e) => e.id === eventId);
  if (!event || event.deletedAt) return;

  let mutated = false;
  if (!event.uid) {
    event.uid = `bmad-${crypto.randomUUID()}@familjeapp`;
    mutated = true;
  }
  if (event.subscriptionId !== conn.id) {
    event.subscriptionId = conn.id;
    mutated = true;
  }
  if (mutated) {
    calendar.markModified("events");
    await calendar.save();
  }

  const client = await buildClientForConnection(accountId, conn);
  if (!client) {
    await recordSyncError(calendarId, conn.id, "Kunde inte logga in mot Apple vid skrivning");
    return;
  }

  // event är i praktiken ett Mongoose-subdokument (typcastat till
  // CalendarEvent[] ovan, men fortfarande ett riktigt subdokument) — ett
  // rått spread `{...event}` fångar bara egna enumerable properties och ger
  // en trasig kopia (title/notes blir undefined), samma väldokumenterade
  // fälla som redan fixades i calendarsService.ts:s updateEvent 2026-07-15.
  // .toObject() ger de RIKTIGA fältvärdena. Görs EFTER mutation+save ovan så
  // uid/subscriptionId redan är korrekta på den riktiga posten.
  //
  // 2026-07-28-fynd: title/notes ligger fält-krypterade i databasen (ADR-0014)
  // — .toObject() ger fortfarande RÅ ciffertext, inte klartext. Utan denna
  // dekryptering hade den skickade ICS-filens SUMMARY/DESCRIPTION varit
  // olösbar ciffertext på det riktiga Apple-kalenderkontot, aldrig upptäckt
  // eftersom pushen aldrig kraschar av det (bara skriver fel innehåll).
  const plainEvent = (event as unknown as { toObject(): CalendarEvent }).toObject();
  const decryptedTitle = decryptField(accountId, plainEvent.title);
  const decryptedNotes = decryptNullable(accountId, plainEvent.notes) ?? null;
  const icsString = buildVeventIcs({
    ...plainEvent,
    uid: plainEvent.uid as string,
    title: decryptedTitle,
    notes: decryptedNotes
  });
  let response: Response | null = null;
  try {
    if (event.calDavHref) {
      response = await client.updateCalendarObject({
        calendarObject: { url: event.calDavHref, data: icsString, etag: event.calDavEtag ?? undefined },
      });
      if (response.status === 412) {
        await recordSyncError(
          calendarId,
          conn.id,
          `"${decryptedTitle}" ändrades samtidigt på Apple-kalendern — din ändring skrevs inte över, hämta om och försök igen`
        );
        return;
      }
    } else {
      const filename = `${event.uid}.ics`;
      response = await client.createCalendarObject({
        calendar: { url: conn.externalCalendarHref } as never,
        iCalString: icsString,
        filename,
      });
    }
  } catch {
    await recordSyncError(calendarId, conn.id, `Kunde inte skriva "${decryptedTitle}" till Apple`);
    return;
  }

  if (!response.ok) {
    await recordSyncError(calendarId, conn.id, `Apple avvisade "${decryptedTitle}" (${response.status})`);
    return;
  }

  const fresh = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!fresh) return;
  const freshEvent = (fresh.events as unknown as CalendarEvent[]).find((e) => e.id === eventId);
  if (freshEvent) {
    freshEvent.calDavHref = event.calDavHref ?? `${conn.externalCalendarHref}${event.uid}.ics`;
    freshEvent.calDavEtag = response.headers.get("etag") ?? freshEvent.calDavEtag ?? null;
    fresh.markModified("events");
    await fresh.save();
  }
}

export async function pushEventDelete(calendarId: string, accountId: string, event: CalendarEvent) {
  if (!event.subscriptionId || !event.calDavHref) return;
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) return;
  const conn = (calendar.calDavConnections as unknown as CalDavConnection[]).find((c) => c.id === event.subscriptionId);
  if (!conn) return;

  const client = await buildClientForConnection(accountId, conn);
  if (!client) {
    await recordSyncError(calendarId, conn.id, "Kunde inte logga in mot Apple vid radering");
    return;
  }

  const decryptedTitle = decryptField(accountId, event.title);
  await client
    .deleteCalendarObject({ calendarObject: { url: event.calDavHref, etag: event.calDavEtag ?? undefined } as never })
    .catch(() => recordSyncError(calendarId, conn.id, `Kunde inte radera "${decryptedTitle}" på Apple`));
}

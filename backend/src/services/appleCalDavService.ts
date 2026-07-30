import { createDAVClient } from "tsdav";
import { CalendarModel } from "../db/models/Calendar.js";
import type { CalDavConnection, CalendarEvent } from "../../../shared/types.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { decryptField, decryptNullable, encryptField } from "../utils/fieldEncryption.js";
import {
  parseIcsEvents,
  reconcileExistingEvents,
  insertNewEvents,
  subscriptionCutoffs,
} from "./calendarSubscriptionsService.js";

// ADR-0027 (2026-07-24) — tvåvägs CalDAV-anslutning mot iCloud. Till skillnad
// från IcsSubscription (calendarSubscriptionsService.ts, läs-bar, ingen
// autentisering) skriver appen HÄR aktivt till Apples server också.
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

// 2026-07-30, Zaidas fråga: "gäller [tvåvägssynken] samtliga kalendrar jag
// har i icloud? kan jag få en enkel lista där jag väljer vilka jag vill
// använda?" — connectAppleCalendar (nedan) tog tidigare bara den FÖRSTA
// kalendern `client.fetchCalendars()` råkade returnera, utan att fråga.
// Detta slår bara upp listan (sparar/ansluter ingenting) — samma
// "reveal nothing about accepted destructive action, bara ett uppslag"-
// mönster som lookupConnectionCandidate/lookupShareCandidate.
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

// ── Anslut/koppla bort ──────────────────────────────────────────────────────────

export async function connectAppleCalendar(calendarId: string, accountId: string, memberId: string, body: unknown) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");
  if ((calendar.calDavConnections as unknown as CalDavConnection[]).length > 0) {
    throw new AppError(409, "Kalendern har redan en aktiv CalDAV-anslutning — koppla bort den först");
  }

  const b = body as { accountEmail?: unknown; appSpecificPassword?: unknown; calendarUrl?: unknown };
  const accountEmail = typeof b.accountEmail === "string" ? b.accountEmail.trim() : "";
  const appSpecificPassword = typeof b.appSpecificPassword === "string" ? b.appSpecificPassword.trim() : "";
  const chosenCalendarUrl = typeof b.calendarUrl === "string" ? b.calendarUrl.trim() : "";
  if (!accountEmail || !appSpecificPassword) {
    throw new AppError(400, "Apple-ID och app-specifikt lösenord krävs");
  }

  const client = await buildClient(accountEmail, appSpecificPassword).catch(() => {
    throw new AppError(502, "Kunde inte logga in mot Apple — kontrollera Apple-ID och app-specifikt lösenord");
  });
  const calendars = await client.fetchCalendars().catch(() => {
    throw new AppError(502, "Kunde inte hämta kalendrar från Apple");
  });
  // Väljaren i UI:t (2026-07-30) skickar alltid med calendarUrl — man väljer
  // VILKEN av Apple-kontots kalendrar som ska anslutas, istället för att
  // (som tidigare) tyst få den första `fetchCalendars()` råkade returnera.
  // Faller tillbaka på "första hittade" bara om anropet av någon anledning
  // saknar valet (bakåtkompatibelt, borde inte hända via UI:t längre).
  const target = chosenCalendarUrl
    ? calendars.find((c) => c.url && String(c.url) === chosenCalendarUrl)
    : calendars.find((c) => c.url);
  if (!target?.url) throw new AppError(502, "Den valda kalendern hittades inte längre på Apple-kontot");

  const now = new Date().toISOString();
  const connection: CalDavConnection = {
    id: `caldav-${crypto.randomUUID()}`,
    calendarId,
    provider: "apple",
    accountEmailEnc: encryptField(accountId, accountEmail),
    appSpecificPasswordEnc: encryptField(accountId, appSpecificPassword),
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

  return { ...connection, accountEmailEnc: accountEmail, appSpecificPasswordEnc: "••••••••" };
}

export async function disconnectAppleCalendar(calendarId: string, accountId: string, connectionId: string) {
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
  connectionId: string,
  syncIntervalMinutes: number
) {
  const calendar = await CalendarModel.findOne({ id: calendarId, accountId });
  if (!calendar) throw new AppError(404, "Kalender hittades inte");
  const conn = (calendar.calDavConnections as unknown as CalDavConnection[]).find((c) => c.id === connectionId);
  if (!conn) throw new AppError(404, "CalDAV-anslutning hittades inte");
  conn.syncIntervalMinutes = syncIntervalMinutes;
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
  const client = await buildClient(
    decryptField(accountId, conn.accountEmailEnc),
    decryptField(accountId, conn.appSpecificPasswordEnc)
  ).catch(() => null);
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

  const client = await buildClient(
    decryptField(accountId, conn.accountEmailEnc),
    decryptField(accountId, conn.appSpecificPasswordEnc)
  ).catch(() => null);
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

  const client = await buildClient(
    decryptField(accountId, conn.accountEmailEnc),
    decryptField(accountId, conn.appSpecificPasswordEnc)
  ).catch(() => null);
  if (!client) {
    await recordSyncError(calendarId, conn.id, "Kunde inte logga in mot Apple vid radering");
    return;
  }

  const decryptedTitle = decryptField(accountId, event.title);
  await client
    .deleteCalendarObject({ calendarObject: { url: event.calDavHref, etag: event.calDavEtag ?? undefined } as never })
    .catch(() => recordSyncError(calendarId, conn.id, `Kunde inte radera "${decryptedTitle}" på Apple`));
}

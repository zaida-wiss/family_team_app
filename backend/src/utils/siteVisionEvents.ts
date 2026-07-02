// Vissa svenska kommuners webbplatser (byggda på SiteVision) publicerar
// aktivitetslistor via en inbäddad Angular-komponent ("SchoolBreakListing")
// istället för ett ICS/API-flöde: hela evenemangslistan skrivs som JSON direkt
// i sidans HTML i en <script>-tagg. Familjer kan ha helt olika kommuner/sidor
// de vill följa, så ingen specifik URL hör hemma i koden — användaren klistrar
// in valfri sådan sida i den vanliga "Lägg till prenumeration"-rutan
// (CalendarSubscriptionsSection.tsx), och den här funktionen känner igen och
// konverterar formatet till vanlig ICS om det känns igen, annars ingen effekt.
//
// Oofficiellt format utan kontrakt — går sönder tyst om sidleverantören ändrar
// strukturen. calendarSubscriptionsService faller tillbaka på tom/oförändrad
// synk om det händer, samma som för en trasig vanlig ICS-URL.

type SiteVisionEvent = {
  name?: string;
  text?: string;
  from?: string; // "YYYY-MM-DD HH:MM:SS", lokal tid
  to?: string;
  url?: string;
  category?: string;
  municipality?: string;
  isFree?: boolean;
};

export function convertSiteVisionEventsToIcs(html: string): string | null {
  const config = extractAngularConfig(html);
  const events = config?.events;
  if (!Array.isArray(events) || events.length === 0) return null;

  const now = formatIcsDateUtc(new Date());
  const vevents = events
    .map((ev: SiteVisionEvent) => {
      const name = ev.name?.trim();
      const dtstart = toIcsLocal(ev.from);
      const dtend = toIcsLocal(ev.to);
      if (!name || !dtstart || !dtend) return null;
      const descriptionParts = [ev.text, ev.isFree ? "Gratis" : null, ev.url].filter(
        (v): v is string => Boolean(v)
      );
      return [
        "BEGIN:VEVENT",
        `UID:${escapeIcs(ev.url || `${name}-${ev.from}`)}`,
        `DTSTAMP:${now}`,
        `DTSTART:${dtstart}`,
        `DTEND:${dtend}`,
        `SUMMARY:${escapeIcs(name)}`,
        descriptionParts.length > 0 ? `DESCRIPTION:${escapeIcs(descriptionParts.join(" · "))}` : null,
        ev.municipality ? `LOCATION:${escapeIcs(ev.municipality)}` : null,
        ev.category ? `CATEGORIES:${escapeIcs(ev.category)}` : null,
        ev.url ? `URL:${escapeIcs(ev.url)}` : null,
        "END:VEVENT",
      ]
        .filter(Boolean)
        .join("\r\n");
    })
    .filter((block: string | null): block is string => block !== null)
    .join("\r\n");

  if (!vevents) return null;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Familjeappen//SiteVision events//SV",
    "CALSCALE:GREGORIAN",
    vevents,
    "END:VCALENDAR",
  ].join("\r\n");
}

// Sidan skriver `angular.module(...).value("config", angular.fromJson({ ... }))`
// direkt i en <script>-tagg. Vi hittar det balanserade { ... }-blocket manuellt
// (en enkel regex-match klipper ibland av mitt i en sträng när texten
// innehåller kolon/citattecken).
function extractAngularConfig(html: string): { events?: unknown } | null {
  const marker = "angular.fromJson(";
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) return null;
  const start = html.indexOf("{", markerIndex);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return null;

  try {
    return JSON.parse(html.slice(start, end));
  } catch {
    return null;
  }
}

// "2026-07-02 06:00:00" (lokal Europe/Stockholm-tid, samma svävande-lokal-tid-
// tolkning som resten av appen redan använder) -> "20260702T060000"
function toIcsLocal(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}${mo}${d}T${h}${mi}${s}`;
}

function formatIcsDateUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

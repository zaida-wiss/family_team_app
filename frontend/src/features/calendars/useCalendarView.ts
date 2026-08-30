import { useEffect, useRef, useState } from "react";
import { canEditSharedResource, hasPermission } from "../../utils/permissions";
import { isoToLocalDateTimeStr, localDateTimeToISO } from "../../utils/fixedTimeZone";
import type { Calendar, CalendarEvent, CalendarSettings, EventRecurrence, Id, Member, Role } from "@shared/types";
import type { EnrichedEvent } from "./CalendarEventList";
import type { FormState, ModalMode } from "./CalendarView";
import {
  blankForm,
  expandForRange,
  expandForMonth,
  getMonthCells,
  resolveDisplaySymbol,
  toLocalDateStr,
} from "./calendarHelpers";

function getWeekMonday(offset: number): Date {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const d = new Date(today);
  d.setDate(today.getDate() - dow + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Rullande vecka (2026-08-30, Zaidas önskemål: "dagens datum först och en
// vecka framåt" — samma princip som Hem-vyns "Veckans rutiner",
// FamilyWeekRoutines.tsx) — MEDVETET bara för Hem-vyns dashboard-inbäddade
// kalender (Zaidas rättelse samma dag: "endast i familjens dashboard
// alltså... kalendrarna i övrigt skall vara oförändrade"). Den fristående
// Kalender-panelen (CalendarPage.tsx, HeroBar → Kalender) behåller den
// vanliga måndag-ankrade getWeekMonday ovan — se rollingWeek-parametern
// nedan, satt till CalendarView.tsx:s displayOnly-prop (den enda skillnaden
// mellan de två anropsställena, se CalendarView.tsx:s kommentar).
function getRollingWeekStart(offset: number): Date {
  const today = new Date();
  const d = new Date(today);
  d.setDate(today.getDate() + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEventStartDay(ev: EnrichedEvent) {
  return ev.isAllDay ? ev.startsAt.slice(0, 10) : toLocalDateStr(new Date(ev.startsAt));
}

function getEventEndDay(ev: EnrichedEvent) {
  return ev.isAllDay ? ev.endsAt.slice(0, 10) : toLocalDateStr(new Date(ev.endsAt));
}

function sortEvents(a: EnrichedEvent, b: EnrichedEvent) {
  const aTime = new Date(a.startsAt).getTime();
  const bTime = new Date(b.startsAt).getTime();
  const aDay = getEventStartDay(a);
  const bDay = getEventStartDay(b);

  if (aDay !== bDay) return aTime - bTime;
  if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
  return aTime - bTime;
}

export function useCalendarView(
  calendars: Calendar[],
  currentMember: Member,
  activeMembers: Member[],
  roles: Role[],
  calendarSettings: CalendarSettings | undefined,
  searchQuery: string,
  hiddenCalendarIds: Set<string>,
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void,
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void,
  onDeleteEvent?: (calendarId: string, eventId: string) => void,
  onMonthChange?: (year: number, month: number) => void,
  // Vilket barns/medlems dashboard som just nu är valt i medlemsväljaren
  // (2026-07-21, Zaidas fynd: "om man först väljer familjemedlem och sedan
  // går till kalendern så är det inte den personens kalender") — påverkar
  // BARA vilken kalender som föreslås som förval för en ny händelse, aldrig
  // behörighetskontroller (de körs fortsatt mot den riktiga inloggade
  // currentMember, annars skulle en förälder plötsligt begränsas av ett
  // valt barns egna, snävare behörigheter). Saknas den (t.ex. Hem-vyn, som
  // medvetet INTE ska scopas om) faller allt tillbaka på currentMember,
  // oförändrat beteende.
  focusMemberId?: Id,
  // Fast klockslag oavsett var enheten befinner sig (2026-07-30,
  // Account.fixedCalendarTimes — en EGEN inställning, oberoende av
  // todos/rutiners fixedTodoTimes). Påverkar bara skapa/redigera (openEdit/
  // submitForm nedan) — se utils/fixedTimeZone.ts:s filhuvud för den kända
  // begränsningen kring återkommande händelsers framtida förekomster.
  fixedCalendarTimes = false,
  // Rullande vecka (2026-08-30) — bara Hem-vyns dashboard-inbäddade kalender
  // (CalendarView.tsx:s displayOnly-prop) ska ha "dagens datum först och en
  // vecka framåt", den fristående Kalender-panelen ska vara oförändrad
  // (måndag-ankrad). Se getRollingWeekStart ovan.
  rollingWeek = false,
) {
  const now = new Date();
  const todayStr = toLocalDateStr(now);

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [detailEvent, setDetailEvent] = useState<EnrichedEvent | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Permission filtering ──
  // focusMemberId (2026-07-21, utökad 2026-07-22) — smalnar av till bara den
  // valda medlemmens kalendrar, ovanpå det som redan skickats hit.
  // Behörighetsfiltreringen (vem får se vilken kalender alls) sker sedan
  // 2026-08-11 SERVER-SIDE (calendarsService.ts:s filterCalendarsForCaller,
  // se docs/.../2026-08-11-installningar-familjekonto-omorganisation.md) —
  // `calendars` innehåller redan bara det currentMember (samma person som
  // request:en gjordes för) faktiskt får se, inklusive enskilda attendee-
  // taggade händelser på annars privata kalendrar. Ett client-side
  // sharedWith-/canSeeAllCalendar-återfilter här skulle GISSA fel (t.ex.
  // felaktigt dölja en attendee-taggad kalender, eftersom canViewResource
  // inte känner till attendees) — filtret nedan gör bara kvarvarande RENA
  // UI-koncept (raderad, medlems-fokus).
  const visible = calendars.filter((cal) => {
    if (cal.deletedAt !== null) return false;
    if (focusMemberId && cal.ownerId !== focusMemberId) return false;
    return true;
  });

  // readOnly utesluts ALLTID från editableCalendars, oavsett övriga
  // behörigheter — det är den enda spärren mot redigering av en
  // cross-account-kalender (se ovan).
  const editableCalendars = visible.filter(
    (cal) => !cal.readOnly && hasPermission(currentMember, roles, "canEditCalendar") && canEditSharedResource(currentMember, cal)
  );

  const canEditEvent = (ev: CalendarEvent) =>
    editableCalendars.some((cal) => cal.id === ev.calendarId);

  const calendarDisplayColor = new Map<string, string>();
  for (const member of activeMembers) {
    const memberCals = visible.filter((c) => c.ownerId === member.id);
    const baseColor = member.color ?? null;
    memberCals.forEach((cal, idx) => {
      if (!baseColor) calendarDisplayColor.set(cal.id, cal.color);
      else if (idx === 0) calendarDisplayColor.set(cal.id, baseColor);
      else calendarDisplayColor.set(cal.id, `color-mix(in srgb, ${baseColor} ${Math.max(40, 80 - idx * 20)}%, white)`);
    });
  }

  // ── Subscription symbol lookup ──
  const subSymbols = new Map<string, string>();
  for (const cal of visible) {
    for (const sub of cal.subscriptions ?? []) {
      if (sub.displaySymbol) subSymbols.set(sub.id, sub.displaySymbol);
    }
  }

  // ── All events with color ──
  const enrichedEvents: EnrichedEvent[] = visible.flatMap((cal) =>
    cal.events
      .filter((ev) => ev.deletedAt === null)
      .map((ev) => ({
        ...ev,
        calendarColor: calendarDisplayColor.get(cal.id) ?? cal.color,
        calendarName: cal.name,
        calendarOwnerId: cal.ownerId,
        displaySymbol: resolveDisplaySymbol(ev, subSymbols),
      }))
  );

  const expandedEvents = expandForMonth(enrichedEvents, viewYear, viewMonth);

  // ── Pending invitations for current user ──
  const pendingInvitations = enrichedEvents.filter(
    (ev) => ev.attendees?.some((a) => a.memberId === currentMember.id && a.status === "pending")
  );

  // ── Shared filter predicate ──
  const q = searchQuery.trim().toLowerCase();
  function matchesFilter(ev: EnrichedEvent) {
    if (hiddenCalendarIds.size > 0 && hiddenCalendarIds.has(ev.calendarId)) return false;
    if (!q) return true;
    return (
      ev.title.toLowerCase().includes(q) ||
      ev.calendarName.toLowerCase().includes(q) ||
      (ev.location?.toLowerCase().includes(q) ?? false) ||
      (ev.notes?.replace(/\\n/g, " ").toLowerCase().includes(q) ?? false)
    );
  }

  // ── Events per day (grid uses this — filtered) ──
  function eventsForDay(dateStr: string) {
    return expandedEvents
      .filter(matchesFilter)
      .filter((ev) => {
        return getEventStartDay(ev) <= dateStr && dateStr <= getEventEndDay(ev);
      })
      .sort(sortEvents);
  }

  // ── List events below grid ──
  function isNotPast(ev: EnrichedEvent): boolean {
    return ev.isAllDay
      ? ev.endsAt.slice(0, 10) >= todayStr
      : new Date(ev.endsAt).getTime() >= now.getTime();
  }

  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const monthFirstDay = `${monthPrefix}-01`;
  const monthLastDay = `${monthPrefix}-${String(new Date(viewYear, viewMonth + 1, 0).getDate()).padStart(2, "0")}`;

  const listEvents = selectedDay
    ? eventsForDay(selectedDay)
    : expandedEvents
        .filter(matchesFilter)
        .filter((ev) => isNotPast(ev) && getEventStartDay(ev) <= monthLastDay && getEventEndDay(ev) >= monthFirstDay)
        .sort(sortEvents);

  const weekStart = rollingWeek ? getRollingWeekStart(weekOffset) : getWeekMonday(weekOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const weekFirstDay = toLocalDateStr(weekStart);
  const weekLastDay = toLocalDateStr(weekEnd);
  const weekEvents = expandForRange(enrichedEvents, weekStart, weekEnd)
    .filter(matchesFilter)
    .filter((ev) => getEventStartDay(ev) <= weekLastDay && getEventEndDay(ev) >= weekFirstDay)
    .sort(sortEvents);
  const weekListEvents = weekEvents.filter(isNotPast);

  const listRangeEnd = new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59, 999);
  const allListEvents = expandForRange(enrichedEvents, now, listRangeEnd)
    .filter(matchesFilter)
    .filter(isNotPast)
    .sort(sortEvents);

  useEffect(() => { onMonthChange?.(viewYear, viewMonth); }, [viewYear, viewMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ──
  function prevMonth() { setSelectedDay(null); setViewMonth((m) => { if (m === 0) { setViewYear((y) => y - 1); return 11; } return m - 1; }); }
  function nextMonth() { setSelectedDay(null); setViewMonth((m) => { if (m === 11) { setViewYear((y) => y + 1); return 0; } return m + 1; }); }
  function prevWeek() { setSelectedDay(null); setWeekOffset((offset) => offset - 1); }
  function nextWeek() { setSelectedDay(null); setWeekOffset((offset) => offset + 1); }

  // ── Open modal ──
  function openNew(dateStr?: string) {
    if (editableCalendars.length === 0) return;
    const base = dateStr ?? todayStr;
    // Förvalt värde: den egna kalendern, inte bara den första i listan
    // (2026-07-15, buggfix — Zaidas fynd: nya händelser föreslog en
    // ICS-PRENUMERERAD kalender som förval, bara för att den råkade komma
    // först i arrayen från backend. En prenumererad kalender synkas
    // automatiskt mot en extern källa och är fel plats för en egen
    // händelse). Faller tillbaka på den första redigerbara kalendern om
    // ingen ägs av mig själv (t.ex. en delad familjekalender).
    const defaultCalendar =
      editableCalendars.find((cal) => cal.ownerId === focusMemberId) ??
      editableCalendars.find((cal) => cal.ownerId === currentMember.id) ??
      editableCalendars[0];
    // Starttid: den aktuella tiden när +-knappen trycktes, sluttid 1h senare
    // (2026-08-07, Zaidas önskemål) — bara när INGEN specifik dag valdes
    // (den vanliga +-knappen, defaultar redan till dagens datum ovan). Ett
    // långtryck på en specifik dag i kalendern (dateStr satt, kan vara vilken
    // dag som helst) behåller det gamla 09:00–10:00-defaultvärdet — "nu" är
    // inte meningsfullt för en dag som inte nödvändigtvis är idag.
    let startsAt: string;
    let endsAt: string;
    if (dateStr === undefined) {
      const nowIso = new Date().toISOString();
      const inOneHourIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      startsAt = isoToLocalDateTimeStr(nowIso, fixedCalendarTimes);
      endsAt = isoToLocalDateTimeStr(inOneHourIso, fixedCalendarTimes);
    } else {
      startsAt = `${base}T09:00`;
      endsAt = `${base}T10:00`;
    }
    setForm(blankForm({ calendarId: defaultCalendar.id, startsAt, endsAt }));
    setModal({ kind: "new", prefilledDate: dateStr });
  }

  function openEdit(ev: EnrichedEvent) {
    const rec = ev.recurrence ?? { type: "none" as const, interval: 1, until: null };
    setForm({
      calendarId: ev.calendarId,
      title: ev.title,
      isAllDay: ev.isAllDay ?? false,
      startsAt: ev.isAllDay ? toLocalDateStr(new Date(ev.startsAt)) : isoToLocalDateTimeStr(ev.startsAt, fixedCalendarTimes),
      endsAt: ev.isAllDay ? toLocalDateStr(new Date(ev.endsAt)) : isoToLocalDateTimeStr(ev.endsAt, fixedCalendarTimes),
      location: ev.location ?? "",
      notes: ev.notes ?? "",
      recurrenceType: rec.type,
      recurrenceInterval: rec.interval ?? 1,
      recurrenceUntil: rec.until ? toLocalDateStr(new Date(rec.until)) : "",
      attendeeIds: (ev.attendees ?? []).map((a) => a.memberId),
      symbol: ev.symbol ?? "",
    });
    setModal({ kind: "edit", event: ev });
  }

  function closeModal() { setModal(null); }

  // ── Submit ──
  function submitForm() {
    const trimmed = form.title.trim();
    if (!trimmed || !form.startsAt || !form.endsAt || !form.calendarId) return;
    // Samma spärr som knappens disabled-villkor (CalendarEventModal.tsx) —
    // ett ogiltigt fönster (slut före start) ska aldrig kunna sparas, även
    // om något annat anropsställe skulle råka kringgå knappen.
    if (form.endsAt < form.startsAt) return;

    const recurrence: EventRecurrence = {
      type: form.recurrenceType,
      interval: form.recurrenceInterval,
      until: form.recurrenceUntil ? new Date(form.recurrenceUntil).toISOString() : null,
    };

    const isoStart = form.isAllDay ? `${form.startsAt}T12:00:00.000Z` : localDateTimeToISO(form.startsAt, fixedCalendarTimes);
    const isoEnd = form.isAllDay ? `${form.endsAt}T12:00:00.000Z` : localDateTimeToISO(form.endsAt, fixedCalendarTimes);

    const attendees = form.attendeeIds.map((memberId) => ({ memberId, status: "pending" as const }));

    if (modal?.kind === "new") {
      onAddEvent?.(form.calendarId, {
        title: trimmed,
        isAllDay: form.isAllDay,
        color: null,
        uid: null,
        subscriptionId: null,
        startsAt: isoStart,
        endsAt: isoEnd,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
        recurrence,
        attendees,
        symbol: form.symbol || null,
      });
    } else if (modal?.kind === "edit") {
      const baseId = modal.event.id.split("~")[0];
      onUpdateEvent?.(modal.event.calendarId, baseId, {
        calendarId: form.calendarId,
        title: trimmed,
        isAllDay: form.isAllDay,
        startsAt: isoStart,
        endsAt: isoEnd,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
        recurrence,
        attendees,
        symbol: form.symbol || null,
      });
    }

    closeModal();
  }

  function deleteEvent() {
    if (modal?.kind !== "edit") return;
    const baseId = modal.event.id.split("~")[0];
    onDeleteEvent?.(modal.event.calendarId, baseId);
    closeModal();
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => {
      if (key !== "startsAt") return { ...f, [key]: value };
      // Sluttiden följer med när starttiden ändras (2026-08-08, Zaidas fynd:
      // "sluttiden [ändrades] inte en timme senare automatiskt, och blev
      // därför tidigare än själva starttiden. Någon som skall förhindras.")
      // — bevarar den BEFINTLIGA längden mellan start/slut (samma etablerade
      // kalender-UX-konvention som t.ex. Google Kalender: flyttar man
      // starten flyttas slutet med), istället för att lämna slutet orört och
      // riskera att det hamnar FÖRE den nya starten. Faller tillbaka på 1h
      // bara om den gamla längden redan var ogiltig (<=0) eller om något
      // datum inte går att tolka — kortar aldrig en legitimt kort händelse.
      const newStartsAt = value as FormState["startsAt"];
      const prevStart = new Date(f.startsAt);
      const prevEnd = new Date(f.endsAt);
      const nextStart = new Date(newStartsAt);
      if (
        !f.startsAt || !f.endsAt ||
        Number.isNaN(prevStart.getTime()) || Number.isNaN(prevEnd.getTime()) || Number.isNaN(nextStart.getTime())
      ) {
        return { ...f, startsAt: newStartsAt };
      }
      let durationMs = prevEnd.getTime() - prevStart.getTime();
      if (durationMs <= 0) durationMs = 60 * 60 * 1000;
      const nextEndDate = new Date(nextStart.getTime() + durationMs);
      const nextEndsAt = f.isAllDay
        ? toLocalDateStr(nextEndDate)
        : isoToLocalDateTimeStr(nextEndDate.toISOString(), fixedCalendarTimes);
      return { ...f, startsAt: newStartsAt, endsAt: nextEndsAt as FormState["endsAt"] };
    });
  }

  function toggleAttendee(memberId: string) {
    setForm((f) => ({
      ...f,
      attendeeIds: f.attendeeIds.includes(memberId)
        ? f.attendeeIds.filter((id) => id !== memberId)
        : [...f.attendeeIds, memberId],
    }));
  }

  const cells = getMonthCells(viewYear, viewMonth);
  const weeks: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const showWeekNumbers = calendarSettings?.showWeekNumbers ?? false;
  const showHolidays = calendarSettings?.showHolidays ?? true;
  const holidayBgColor = calendarSettings?.holidayBgColor ?? "#ffe4e6";
  const holidayTextColor = calendarSettings?.holidayTextColor ?? "#9f1239";

  const isEditing = modal?.kind === "edit";
  const eventIsEditable = isEditing && canEditEvent(modal.event);
  const otherMembers = activeMembers.filter((m) => m.id !== currentMember.id);

  return {
    todayStr,
    viewYear,
    viewMonth,
    weekStart,
    weekEnd,
    selectedDay,
    setSelectedDay,
    modal,
    form,
    setForm,
    detailEvent,
    setDetailEvent,
    longPressRef,
    visible,
    editableCalendars,
    canEditEvent,
    enrichedEvents,
    expandedEvents,
    pendingInvitations,
    eventsForDay,
    listEvents,
    weekEvents,
    weekListEvents,
    allListEvents,
    prevMonth,
    nextMonth,
    prevWeek,
    nextWeek,
    openNew,
    openEdit,
    closeModal,
    submitForm,
    deleteEvent,
    setField,
    toggleAttendee,
    cells,
    weeks,
    showWeekNumbers,
    showHolidays,
    holidayBgColor,
    holidayTextColor,
    calendarDisplayColor,
    isEditing,
    eventIsEditable,
    otherMembers,
  };
}

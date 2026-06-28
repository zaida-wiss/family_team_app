import { useRef, useState } from "react";
import { canEditSharedResource, canViewResource, hasPermission } from "../../utils/permissions";
import type { Calendar, CalendarEvent, CalendarSettings, EventRecurrence, Id, Member, Role } from "@shared/types";
import type { EnrichedEvent } from "./CalendarEventList";
import type { FormState, ModalMode } from "./CalendarView";
import {
  blankForm,
  expandForRange,
  expandForMonth,
  getMonthCells,
  toLocalDateStr,
  toLocalDateTimeStr,
} from "./calendarHelpers";

function getWeekMonday(offset: number): Date {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7;
  const d = new Date(today);
  d.setDate(today.getDate() - dow + offset * 7);
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
  const visible = calendars.filter((cal) => {
    if (cal.deletedAt !== null) return false;
    if (hasPermission(currentMember, roles, "canSeeAllCalendar")) return true;
    return hasPermission(currentMember, roles, "canSeeOwnCalendar") && canViewResource(currentMember, cal);
  });

  const editableCalendars = visible.filter(
    (cal) => hasPermission(currentMember, roles, "canEditCalendar") && canEditSharedResource(currentMember, cal)
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
        displaySymbol: ev.subscriptionId ? (subSymbols.get(ev.subscriptionId) ?? null) : null,
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
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const monthFirstDay = `${monthPrefix}-01`;
  const monthLastDay = `${monthPrefix}-${String(new Date(viewYear, viewMonth + 1, 0).getDate()).padStart(2, "0")}`;

  const listEvents = selectedDay
    ? eventsForDay(selectedDay)
    : expandedEvents
        .filter(matchesFilter)
        .filter((ev) => {
          const notPast = ev.isAllDay
            ? ev.endsAt.slice(0, 10) >= todayStr
            : new Date(ev.endsAt).getTime() >= now.getTime();
          return notPast && getEventStartDay(ev) <= monthLastDay && getEventEndDay(ev) >= monthFirstDay;
        })
        .sort(sortEvents);

  const weekStart = getWeekMonday(weekOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const weekFirstDay = toLocalDateStr(weekStart);
  const weekLastDay = toLocalDateStr(weekEnd);
  const weekEvents = expandForRange(enrichedEvents, weekStart, weekEnd)
    .filter(matchesFilter)
    .filter((ev) => getEventStartDay(ev) <= weekLastDay && getEventEndDay(ev) >= weekFirstDay)
    .sort(sortEvents);

  const listRangeStart = new Date(now.getFullYear() - 1, 0, 1);
  const listRangeEnd = new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59, 999);
  const allListEvents = expandForRange(enrichedEvents, listRangeStart, listRangeEnd)
    .filter(matchesFilter)
    .sort(sortEvents);

  // ── Navigation ──
  function prevMonth() { setSelectedDay(null); setViewMonth((m) => { if (m === 0) { setViewYear((y) => y - 1); return 11; } return m - 1; }); }
  function nextMonth() { setSelectedDay(null); setViewMonth((m) => { if (m === 11) { setViewYear((y) => y + 1); return 0; } return m + 1; }); }
  function prevWeek() { setSelectedDay(null); setWeekOffset((offset) => offset - 1); }
  function nextWeek() { setSelectedDay(null); setWeekOffset((offset) => offset + 1); }

  // ── Open modal ──
  function openNew(dateStr?: string) {
    if (editableCalendars.length === 0) return;
    const base = dateStr ?? todayStr;
    setForm(blankForm({
      calendarId: editableCalendars[0].id,
      startsAt: `${base}T09:00`,
      endsAt: `${base}T10:00`,
    }));
    setModal({ kind: "new", prefilledDate: dateStr });
  }

  function openEdit(ev: EnrichedEvent) {
    const rec = ev.recurrence ?? { type: "none" as const, interval: 1, until: null };
    setForm({
      calendarId: ev.calendarId,
      title: ev.title,
      isAllDay: ev.isAllDay ?? false,
      startsAt: ev.isAllDay ? toLocalDateStr(new Date(ev.startsAt)) : toLocalDateTimeStr(new Date(ev.startsAt)),
      endsAt: ev.isAllDay ? toLocalDateStr(new Date(ev.endsAt)) : toLocalDateTimeStr(new Date(ev.endsAt)),
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

    const recurrence: EventRecurrence = {
      type: form.recurrenceType,
      interval: form.recurrenceInterval,
      until: form.recurrenceUntil ? new Date(form.recurrenceUntil).toISOString() : null,
    };

    const isoStart = form.isAllDay ? `${form.startsAt}T12:00:00.000Z` : new Date(form.startsAt).toISOString();
    const isoEnd = form.isAllDay ? `${form.endsAt}T12:00:00.000Z` : new Date(form.endsAt).toISOString();

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
    setForm((f) => ({ ...f, [key]: value }));
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

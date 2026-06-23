import { useRef, useState } from "react";
import { canEditSharedResource, canViewResource, hasPermission } from "../../utils/permissions";
import type { Calendar, CalendarEvent, CalendarSettings, EventRecurrence, Id, Member, Role } from "@shared/types";
import type { EnrichedEvent } from "./CalendarEventList";
import type { FormState, ModalMode } from "./CalendarView";
import {
  blankForm,
  expandForMonth,
  getMonthCells,
  toLocalDateStr,
  toLocalDateTimeStr,
} from "./calendarHelpers";

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

  // ── All events with color ──
  const enrichedEvents: EnrichedEvent[] = visible.flatMap((cal) =>
    cal.events
      .filter((ev) => ev.deletedAt === null)
      .map((ev) => ({ ...ev, calendarColor: cal.color, calendarName: cal.name, calendarOwnerId: cal.ownerId }))
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
        const start = ev.isAllDay ? ev.startsAt.slice(0, 10) : toLocalDateStr(new Date(ev.startsAt));
        const end = ev.isAllDay ? ev.endsAt.slice(0, 10) : toLocalDateStr(new Date(ev.endsAt));
        return start <= dateStr && dateStr <= end;
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }

  // ── List events below grid ──
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const monthFirstDay = `${monthPrefix}-01`;
  const monthLastDay = `${monthPrefix}-${String(new Date(viewYear, viewMonth + 1, 0).getDate()).padStart(2, "0")}`;

  const hasFilter = !!q || hiddenCalendarIds.size > 0;
  const todayYM = todayStr.slice(0, 7);
  const viewYM = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const isCurrentMonthView = viewYM === todayYM;
  const hidePast = isCurrentMonthView && !selectedDay && !hasFilter;

  const listEvents = selectedDay
    ? eventsForDay(selectedDay)
    : expandedEvents
        .filter(matchesFilter)
        .filter((ev) => {
          if (hidePast) {
            const end = ev.isAllDay ? ev.endsAt.slice(0, 10) : toLocalDateStr(new Date(ev.endsAt));
            return end >= todayStr;
          }
          return true;
        })
        .filter((ev) => {
          const evStart = ev.isAllDay ? ev.startsAt.slice(0, 10) : toLocalDateStr(new Date(ev.startsAt));
          const evEnd = ev.isAllDay ? ev.endsAt.slice(0, 10) : toLocalDateStr(new Date(ev.endsAt));
          return evStart <= monthLastDay && evEnd >= monthFirstDay;
        })
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  // ── Navigation ──
  function prevMonth() { setSelectedDay(null); setViewMonth((m) => { if (m === 0) { setViewYear((y) => y - 1); return 11; } return m - 1; }); }
  function nextMonth() { setSelectedDay(null); setViewMonth((m) => { if (m === 11) { setViewYear((y) => y + 1); return 0; } return m + 1; }); }

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

  const isEditing = modal?.kind === "edit";
  const eventIsEditable = isEditing && canEditEvent(modal.event);
  const otherMembers = activeMembers.filter((m) => m.id !== currentMember.id);

  return {
    todayStr,
    viewYear,
    viewMonth,
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
    prevMonth,
    nextMonth,
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

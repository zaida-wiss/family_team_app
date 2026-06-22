import { ChevronLeft, ChevronRight, MapPin, Plus, RefreshCw, Repeat, Trash2, X } from "lucide-react";
import { useState } from "react";
import { MemberAvatar } from "../../components/MemberAvatar";
import { canEditSharedResource, canViewResource, hasPermission } from "../../utils/permissions";
import type { Calendar, CalendarEvent, EventRecurrence, Id, Member, Role } from "@shared/types";
import "./CalendarView.css";

// ── Types ────────────────────────────────────────────────────────────────────

type Props = {
  calendars: Calendar[];
  currentMember: Member;
  activeMembers: Member[];
  roles: Role[];
  displayOnly?: boolean;
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (calendarId: string, eventId: string) => void;
  onRsvpEvent?: (calendarId: string, eventId: string, status: "accepted" | "declined") => void;
};

type FormState = {
  calendarId: string;
  title: string;
  isAllDay: boolean;
  startsAt: string;
  endsAt: string;
  location: string;
  notes: string;
  recurrenceType: EventRecurrence["type"];
  recurrenceInterval: number;
  recurrenceUntil: string;
  attendeeIds: string[];
};

type ModalMode = { kind: "new"; prefilledDate?: string } | { kind: "edit"; event: CalendarEvent & { calendarColor: string; calendarName: string } };

// ── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["MÅN", "TIS", "ONS", "TOR", "FRE", "LÖR", "SÖN"];
const MONTHS = [
  "Januari", "Februari", "Mars", "April", "Maj", "Juni",
  "Juli", "Augusti", "September", "Oktober", "November", "December",
];
const RECURRENCE_LABELS: Record<EventRecurrence["type"], string> = {
  none: "Ingen upprepning",
  daily: "Dagligen",
  weekly: "Veckovis",
  monthly: "Månadsvis",
  yearly: "Årsvis",
};
const RECURRENCE_UNIT: Record<EventRecurrence["type"], string> = {
  none: "",
  daily: "dag",
  weekly: "vecka",
  monthly: "månad",
  yearly: "år",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateStr(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toLocalDateTimeStr(date: Date) {
  return `${toLocalDateStr(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtFullDate(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso + (iso.length === 10 ? "T12:00" : "")));
}

function addInterval(date: Date, type: EventRecurrence["type"], interval: number): Date {
  const d = new Date(date);
  if (type === "daily") d.setDate(d.getDate() + interval);
  else if (type === "weekly") d.setDate(d.getDate() + 7 * interval);
  else if (type === "monthly") d.setMonth(d.getMonth() + interval);
  else if (type === "yearly") d.setFullYear(d.getFullYear() + interval);
  return d;
}

function expandForMonth(events: (CalendarEvent & { calendarColor: string; calendarName: string })[], year: number, month: number) {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const result: typeof events = [];

  for (const ev of events) {
    const rec = ev.recurrence ?? { type: "none" as const, interval: 1, until: null };
    if (rec.type === "none") {
      result.push(ev);
      continue;
    }

    const origStart = new Date(ev.startsAt);
    if (origStart > monthEnd) continue;

    const duration = new Date(ev.endsAt).getTime() - origStart.getTime();
    const until = rec.until ? new Date(rec.until) : null;

    // Fast-forward close to monthStart
    let cur = new Date(origStart);
    if (cur < monthStart) {
      const msPerStep = rec.type === "yearly" ? rec.interval * 365.25 * 86400000
        : rec.type === "monthly" ? rec.interval * 30.44 * 86400000
        : rec.type === "weekly" ? rec.interval * 7 * 86400000
        : rec.interval * 86400000;
      const skip = Math.max(0, Math.floor((monthStart.getTime() - cur.getTime()) / msPerStep) - 2);
      for (let i = 0; i < skip; i++) cur = addInterval(cur, rec.type, rec.interval);
      while (cur < monthStart) cur = addInterval(cur, rec.type, rec.interval);
    }

    let guard = 0;
    while (cur <= monthEnd && guard++ < 200) {
      if (until && cur > until) break;
      result.push({
        ...ev,
        id: `${ev.id}~${cur.getTime()}`,
        startsAt: cur.toISOString(),
        endsAt: new Date(cur.getTime() + duration).toISOString(),
      });
      cur = addInterval(new Date(cur), rec.type, rec.interval);
    }
  }

  return result;
}

function getMonthCells(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const startDow = (firstDay.getDay() + 6) % 7;
  const lastDate = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = startDow; i > 0; i--) cells.push({ date: new Date(year, month, 1 - i), isCurrentMonth: false });
  for (let d = 1; d <= lastDate; d++) cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  const trailing = cells.length % 7 === 0 ? 0 : 7 - (cells.length % 7);
  for (let d = 1; d <= trailing; d++) cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
  return cells;
}

function blankForm(defaults: Partial<FormState> = {}): FormState {
  return {
    calendarId: "",
    title: "",
    isAllDay: false,
    startsAt: "",
    endsAt: "",
    location: "",
    notes: "",
    recurrenceType: "none",
    recurrenceInterval: 1,
    recurrenceUntil: "",
    attendeeIds: [],
    ...defaults,
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function CalendarView({ calendars, currentMember, activeMembers, roles, displayOnly = false, onAddEvent, onUpdateEvent, onDeleteEvent, onRsvpEvent }: Props) {
  const now = new Date();
  const todayStr = toLocalDateStr(now);

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalMode | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());

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
  const enrichedEvents = visible.flatMap((cal) =>
    cal.events
      .filter((ev) => ev.deletedAt === null)
      .map((ev) => ({ ...ev, calendarColor: cal.color, calendarName: cal.name }))
  );

  const expandedEvents = expandForMonth(enrichedEvents, viewYear, viewMonth);

  // ── Pending invitations for current user ──
  const pendingInvitations = enrichedEvents.filter(
    (ev) => ev.attendees?.some((a) => a.memberId === currentMember.id && a.status === "pending")
  );

  // ── Events per day ──
  function eventsForDay(dateStr: string) {
    return expandedEvents
      .filter((ev) => {
        // For all-day events use the raw ISO date prefix to avoid timezone shifts
        const start = ev.isAllDay ? ev.startsAt.slice(0, 10) : toLocalDateStr(new Date(ev.startsAt));
        const end = ev.isAllDay ? ev.endsAt.slice(0, 10) : toLocalDateStr(new Date(ev.endsAt));
        return start <= dateStr && dateStr <= end;
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }

  // ── List events below grid ──
  const listEvents = selectedDay
    ? eventsForDay(selectedDay)
    : enrichedEvents
        .filter((ev) => {
          const start = toLocalDateStr(new Date(ev.startsAt));
          return start.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`);
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

  function openEdit(ev: typeof enrichedEvents[number]) {
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

    // All-day events stored at noon UTC so slice(0,10) always gives the correct local date
    const isoStart = form.isAllDay ? `${form.startsAt}T12:00:00.000Z` : new Date(form.startsAt).toISOString();
    const isoEnd = form.isAllDay ? `${form.endsAt}T12:00:00.000Z` : new Date(form.endsAt).toISOString();

    const attendees = form.attendeeIds.map((memberId) => ({ memberId, status: "pending" as const }));

    if (modal?.kind === "new") {
      onAddEvent?.(form.calendarId, {
        title: trimmed,
        isAllDay: form.isAllDay,
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
  const isEditing = modal?.kind === "edit";
  const eventIsEditable = isEditing && canEditEvent(modal.event);
  const otherMembers = activeMembers.filter((m) => m.id !== currentMember.id);

  if (visible.length === 0) {
    return (
      <article className="dashboard">
        <header className="section-header">
          <div><p className="eyebrow">Kalender</p><h2>Inga kalendrar</h2></div>
        </header>
        <p className="empty-note">Du har inga tillgängliga kalendrar. Skapa en i Inställningar.</p>
      </article>
    );
  }

  if (displayOnly) {
    // Build a map: calendarId → display color derived from the owner member's color
    const calendarDisplayColor = new Map<string, string>();
    for (const member of activeMembers) {
      const memberCals = visible.filter((c) => c.ownerId === member.id);
      const baseColor = member.color ?? null;
      memberCals.forEach((cal, idx) => {
        if (!baseColor) {
          calendarDisplayColor.set(cal.id, cal.color);
        } else if (idx === 0) {
          calendarDisplayColor.set(cal.id, baseColor);
        } else {
          // Lighter shade for additional calendars using CSS color-mix at render time
          calendarDisplayColor.set(cal.id, `color-mix(in srgb, ${baseColor} ${Math.max(40, 80 - idx * 20)}%, white)`);
        }
      });
    }

    return (
      <div className="cal-grid-card">
        <div className="cal-grid-nav">
          <button className="icon-button" onClick={prevMonth} type="button"><ChevronLeft size={18} /></button>
          <span className="cal-grid-month">{MONTHS[viewMonth]} {viewYear}</span>
          <button className="icon-button" onClick={nextMonth} type="button"><ChevronRight size={18} /></button>
        </div>
        <div className="cal-day-names">{DAYS.map((d) => <span key={d}>{d}</span>)}</div>
        <div className="cal-grid">
          {cells.map(({ date, isCurrentMonth }) => {
            const dateStr = toLocalDateStr(date);
            const isToday = dateStr === todayStr;
            const dayEvents = isCurrentMonth ? eventsForDay(dateStr) : [];
            return (
              <div
                key={dateStr}
                className={["cal-cell", !isCurrentMonth && "cal-cell--other", isToday && "cal-cell--today"].filter(Boolean).join(" ")}
                style={{ cursor: "default" }}
              >
                <span className="cal-cell-num">{date.getDate()}</span>
                <div className="cal-cell-dots">
                  {dayEvents.slice(0, 5).map((ev) => (
                    <span
                      key={ev.id}
                      className="cal-cell-dot"
                      style={{ background: calendarDisplayColor.get(ev.calendarId) ?? ev.calendarColor }}
                      title={ev.title}
                    />
                  ))}
                  {dayEvents.length > 5 && <span className="cal-cell-dot-more">+{dayEvents.length - 5}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="cal-view">
      {/* ── Header ── */}
      <div className="cal-view-top">
        <div>
          <h2 className="cal-view-title">Kalender</h2>
          <p className="cal-view-sub">Privata och delade händelser, allt på en plats.</p>
        </div>
        {editableCalendars.length > 0 && (
          <button className="primary-button cal-new-btn" onClick={() => openNew()} type="button">
            <Plus size={16} />
            Ny händelse
          </button>
        )}
      </div>

      {/* ── Pending invitations ── */}
      {pendingInvitations.length > 0 && (
        <div className="cal-invitations">
          <p className="cal-invitations-title">Inbjudningar ({pendingInvitations.length})</p>
          {pendingInvitations.map((ev) => (
            <div className="cal-invitation-row" key={ev.id}>
              <div className="cal-event-color-dot" style={{ background: ev.calendarColor }} />
              <div className="cal-event-row-info">
                <span className="cal-event-row-title">{ev.title}</span>
                <span className="cal-event-row-meta">
                  {ev.isAllDay ? fmtFullDate(ev.startsAt.slice(0, 10)) : `${fmtFullDate(ev.startsAt)} · ${fmtTime(ev.startsAt)}`}
                  {ev.location && ` · ${ev.location}`}
                </span>
              </div>
              <div className="cal-rsvp-btns">
                <button className="secondary-button" onClick={() => onRsvpEvent?.(ev.calendarId, ev.id, "declined")} type="button">Tacka nej</button>
                <button className="primary-button" onClick={() => onRsvpEvent?.(ev.calendarId, ev.id, "accepted")} type="button">Acceptera</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Monthly grid ── */}
      <div className="cal-grid-card">
        <div className="cal-grid-nav">
          <button className="icon-button" onClick={prevMonth} type="button"><ChevronLeft size={18} /></button>
          <span className="cal-grid-month">{MONTHS[viewMonth]} {viewYear}</span>
          <button className="icon-button" onClick={nextMonth} type="button"><ChevronRight size={18} /></button>
        </div>
        <div className="cal-day-names">{DAYS.map((d) => <span key={d}>{d}</span>)}</div>
        <div className="cal-grid">
          {cells.map(({ date, isCurrentMonth }) => {
            const dateStr = toLocalDateStr(date);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDay;
            const dayEvents = isCurrentMonth ? eventsForDay(dateStr) : [];

            return (
              <div
                key={dateStr}
                className={["cal-cell", !isCurrentMonth && "cal-cell--other", isToday && "cal-cell--today", isSelected && "cal-cell--selected"].filter(Boolean).join(" ")}
                onClick={() => { if (isCurrentMonth) setSelectedDay((s) => s === dateStr ? null : dateStr); }}
              >
                <span className="cal-cell-num">{date.getDate()}</span>
                <div className="cal-cell-events">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.id}
                      className="cal-event-pill"
                      style={{ "--event-color": ev.calendarColor } as React.CSSProperties}
                      title={ev.title}
                      onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
                    >
                      {!ev.isAllDay && `${fmtTime(ev.startsAt)} `}{ev.title}
                      {ev.recurrence?.type !== "none" && <Repeat size={8} style={{ marginLeft: 2, opacity: 0.7 }} />}
                    </div>
                  ))}
                  {dayEvents.length > 3 && <span className="cal-event-more">+{dayEvents.length - 3}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Event list ── */}
      <div className="cal-event-list">
        <div className="cal-event-list-header">
          <span className="cal-event-list-title">
            {selectedDay ? fmtFullDate(selectedDay) : `${MONTHS[viewMonth]} ${viewYear}`}
          </span>
          {selectedDay && <button className="cal-clear-day" onClick={() => setSelectedDay(null)} type="button">Visa alla</button>}
        </div>
        {listEvents.length === 0 && (
          <p className="cal-empty-note">{selectedDay ? "Inga händelser denna dag." : "Inga händelser denna månad."}</p>
        )}
        {listEvents.map((ev) => (
          <div
            key={ev.id}
            className="cal-event-row"
            onClick={() => openEdit(ev)}
            style={{ cursor: "pointer" }}
          >
            <div className="cal-event-color-dot" style={{ background: ev.calendarColor }} />
            <div className="cal-event-row-info">
              <span className="cal-event-row-title">
                {ev.title}
                {ev.recurrence?.type !== "none" && <Repeat size={12} style={{ marginLeft: 5, opacity: 0.55, verticalAlign: "middle" }} />}
              </span>
              <span className="cal-event-row-meta">
                {ev.isAllDay
                  ? `${fmtFullDate(ev.startsAt.slice(0, 10))} · Heldag`
                  : `${fmtFullDate(ev.startsAt)} · ${fmtTime(ev.startsAt)}–${fmtTime(ev.endsAt)}`
                }
                {ev.location && <> · <MapPin size={11} style={{ verticalAlign: "middle" }} /> {ev.location}</>}
                {" · "}{ev.calendarName}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Event modal ── */}
      {modal && (
        <div className="cal-form-overlay" onClick={closeModal}>
          <div className="cal-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cal-form-hdr">
              <span>{isEditing ? (eventIsEditable ? "Redigera händelse" : "Händelse") : "Ny händelse"}</span>
              <button className="icon-button" onClick={closeModal} type="button"><X size={18} /></button>
            </div>

            {/* Read-only view mode (can't edit) */}
            {isEditing && !eventIsEditable ? (
              <div className="cal-form-body">
                <p style={{ fontWeight: 700, fontSize: "1.05rem" }}>{modal.event.title}</p>
                <p className="cal-event-row-meta">
                  {modal.event.isAllDay
                    ? `${fmtFullDate(modal.event.startsAt.slice(0, 10))} · Heldag`
                    : `${fmtFullDate(modal.event.startsAt)} · ${fmtTime(modal.event.startsAt)}–${fmtTime(modal.event.endsAt)}`}
                </p>
                {modal.event.location && <p className="cal-event-row-meta"><MapPin size={13} /> {modal.event.location}</p>}
                {modal.event.notes && <p style={{ fontSize: "0.875rem" }}>{modal.event.notes}</p>}
              </div>
            ) : (
              <div className="cal-form-body">
                {/* Calendar selector */}
                {editableCalendars.length > 1 && (
                  <select className="text-input" onChange={(e) => setField("calendarId", e.target.value)} value={form.calendarId}>
                    {editableCalendars.map((cal) => <option key={cal.id} value={cal.id}>{cal.name}</option>)}
                  </select>
                )}

                {/* Title */}
                <input
                  autoFocus
                  className="text-input"
                  onChange={(e) => setField("title", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitForm(); }}
                  placeholder="Titel"
                  value={form.title}
                />

                {/* All-day toggle */}
                <label className="cal-allday-row">
                  <input
                    checked={form.isAllDay}
                    onChange={(e) => setField("isAllDay", e.target.checked)}
                    type="checkbox"
                  />
                  <span>Heldag</span>
                </label>

                {/* Start / End */}
                <div className="cal-form-datetimes">
                  <div className="cal-form-row">
                    <label className="field-label">Startar</label>
                    <input
                      className="text-input"
                      onChange={(e) => setField("startsAt", e.target.value)}
                      type={form.isAllDay ? "date" : "datetime-local"}
                      value={form.startsAt}
                    />
                  </div>
                  <div className="cal-form-row">
                    <label className="field-label">Slutar</label>
                    <input
                      className="text-input"
                      onChange={(e) => setField("endsAt", e.target.value)}
                      type={form.isAllDay ? "date" : "datetime-local"}
                      value={form.endsAt}
                    />
                  </div>
                </div>

                {/* Location */}
                <div className="cal-form-location">
                  <MapPin size={15} />
                  <input
                    className="text-input"
                    onChange={(e) => setField("location", e.target.value)}
                    placeholder="Plats (valfritt)"
                    value={form.location}
                  />
                </div>

                {/* Notes */}
                <textarea
                  className="text-input cal-notes"
                  onChange={(e) => setField("notes", e.target.value)}
                  placeholder="Anteckningar (valfritt)"
                  rows={2}
                  value={form.notes}
                />

                {/* Recurrence */}
                <div className="cal-recurrence">
                  <div className="cal-recurrence-top">
                    <RefreshCw size={15} />
                    <select
                      className="text-input"
                      onChange={(e) => setField("recurrenceType", e.target.value as EventRecurrence["type"])}
                      value={form.recurrenceType}
                    >
                      {(Object.keys(RECURRENCE_LABELS) as EventRecurrence["type"][]).map((k) => (
                        <option key={k} value={k}>{RECURRENCE_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
                  {form.recurrenceType !== "none" && (
                    <div className="cal-recurrence-details">
                      <label className="field-label">Var</label>
                      <input
                        className="text-input cal-interval-input"
                        min={1}
                        onChange={(e) => setField("recurrenceInterval", Math.max(1, Number(e.target.value)))}
                        type="number"
                        value={form.recurrenceInterval}
                      />
                      <span className="cal-interval-unit">{RECURRENCE_UNIT[form.recurrenceType]}</span>
                      <label className="field-label" style={{ marginLeft: 12 }}>Slutar</label>
                      <input
                        className="text-input"
                        onChange={(e) => setField("recurrenceUntil", e.target.value)}
                        placeholder="Aldrig"
                        type="date"
                        value={form.recurrenceUntil}
                      />
                    </div>
                  )}
                </div>

                {/* Attendees */}
                {otherMembers.length > 0 && (
                  <div className="cal-attendees">
                    <p className="field-label">Bjud in familjemedlemmar</p>
                    <div className="cal-attendee-list">
                      {otherMembers.map((member) => {
                        const checked = form.attendeeIds.includes(member.id);
                        return (
                          <label className={`cal-attendee-item${checked ? " cal-attendee-item--checked" : ""}`} key={member.id}>
                            <input
                              checked={checked}
                              onChange={() => toggleAttendee(member.id)}
                              style={{ display: "none" }}
                              type="checkbox"
                            />
                            <MemberAvatar member={member} size="small" />
                            <span>{member.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="cal-form-actions">
                  {isEditing && (
                    <button className="danger-button cal-delete-btn" onClick={deleteEvent} type="button">
                      <Trash2 size={15} />
                      Radera
                    </button>
                  )}
                  <button
                    className="primary-button"
                    disabled={!form.title.trim() || !form.startsAt || !form.endsAt}
                    onClick={submitForm}
                    style={{ flex: 1 }}
                    type="button"
                  >
                    {isEditing ? "Spara ändringar" : "Spara händelse"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

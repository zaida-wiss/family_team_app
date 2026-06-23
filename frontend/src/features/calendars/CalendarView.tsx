import { ChevronLeft, ChevronRight, Filter, MapPin, Plus, RefreshCw, Repeat, Search, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { MemberAvatar } from "../../components/MemberAvatar";
import { canEditSharedResource, canViewResource, hasPermission } from "../../utils/permissions";
import type { Calendar, CalendarEvent, CalendarSettings, EventRecurrence, Id, Member, Role } from "@shared/types";
import "./CalendarView.css";

// ── Types ────────────────────────────────────────────────────────────────────

type Props = {
  calendars: Calendar[];
  currentMember: Member;
  activeMembers: Member[];
  roles: Role[];
  displayOnly?: boolean;
  calendarSettings?: CalendarSettings;
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

type EnrichedEvent = CalendarEvent & { calendarColor: string; calendarName: string; calendarOwnerId?: string | null };
type ModalMode = { kind: "new"; prefilledDate?: string } | { kind: "edit"; event: EnrichedEvent };

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

function expandForMonth<T extends CalendarEvent & { calendarColor: string; calendarName: string }>(events: T[], year: number, month: number): T[] {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
  const result: T[] = [];

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

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const HELGDAG_RE = /helgdag|röd dag|nationaldag|jul(?:dag|afton)|påsk|midsommar|nyår|kristi\s+himmel|allhelgon|pingst|trettondagen?|valborg/i;

function isHolidayEvent(ev: { title: string; calendarName: string }): boolean {
  return HELGDAG_RE.test(ev.title) || HELGDAG_RE.test(ev.calendarName);
}

// ── Shared event list component ──────────────────────────────────────────────

type EventListProps = {
  allEvents: EnrichedEvent[];
  selectedDay: string | null;
  viewYear: number;
  viewMonth: number;
  todayStr: string;
  visible: Calendar[];
  calendarDisplayColor: Map<string, string>;
  showHolidays: boolean;
  holidayBgColor: string;
  holidayTextColor: string;
  onEventClick: (ev: EnrichedEvent) => void;
  onClearDay?: () => void;
};

function CalendarEventList({
  allEvents, selectedDay, viewYear, viewMonth, todayStr,
  visible, calendarDisplayColor, showHolidays, holidayBgColor, holidayTextColor,
  onEventClick, onClearDay,
}: EventListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [hiddenCalendarIds, setHiddenCalendarIds] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSearchQuery(""); setHiddenCalendarIds(new Set()); }, [viewYear, viewMonth]);

  useEffect(() => {
    if (!showFilter) return;
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilter]);

  const q = searchQuery.trim().toLowerCase();
  const hasFilter = !!q || hiddenCalendarIds.size > 0;

  // When viewing the current month without filters: hide past events.
  // When browsing a past or future month: show everything (user navigated there intentionally).
  const todayYM = todayStr.slice(0, 7); // "YYYY-MM"
  const viewYM = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const isCurrentMonth = viewYM === todayYM;
  const hidePast = isCurrentMonth && !selectedDay && !hasFilter;

  const filtered = allEvents
    .filter((ev) => hiddenCalendarIds.size === 0 || !hiddenCalendarIds.has(ev.calendarId))
    .filter((ev) => showHolidays || !isHolidayEvent(ev))
    .filter((ev) => {
      if (hidePast) {
        const end = ev.isAllDay ? ev.endsAt.slice(0, 10) : toLocalDateStr(new Date(ev.endsAt));
        return end >= todayStr;
      }
      return true;
    })
    .filter((ev) => !q || (
      ev.title.toLowerCase().includes(q) ||
      ev.calendarName.toLowerCase().includes(q) ||
      (ev.location?.toLowerCase().includes(q) ?? false) ||
      (ev.notes?.replace(/\\n/g, " ").toLowerCase().includes(q) ?? false)
    ));

  return (
    <div className="cal-event-list">
      <div className="cal-event-list-header">
        <span className="cal-event-list-title">
          {selectedDay ? fmtFullDate(selectedDay) : `${MONTHS[viewMonth]} ${viewYear}`}
        </span>
        <div className="cal-list-controls">
          <div className="cal-overview-search">
            <Search size={14} className="cal-search-icon" />
            <input
              className="cal-search-input"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Sök…"
              type="search"
              value={searchQuery}
            />
          </div>
          <div className="cal-filter-wrap" ref={filterRef}>
            <button
              className={`icon-button${hiddenCalendarIds.size > 0 ? " icon-button--active" : ""}`}
              onClick={() => setShowFilter((s) => !s)}
              title="Filtrera kalendrar"
              type="button"
            >
              <Filter size={16} />
            </button>
            {showFilter && (
              <div className="cal-filter-dropdown">
                {visible.map((cal) => (
                  <label className="cal-filter-item" key={cal.id}>
                    <input
                      checked={!hiddenCalendarIds.has(cal.id)}
                      onChange={(e) => {
                        setHiddenCalendarIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.delete(cal.id); else next.add(cal.id);
                          return next;
                        });
                      }}
                      type="checkbox"
                    />
                    <span className="cal-filter-dot" style={{ background: cal.color }} />
                    <span>{cal.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          {selectedDay && onClearDay && (
            <button className="cal-clear-day" onClick={onClearDay} type="button">Visa alla</button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="cal-empty-note">
          {hasFilter
            ? "Inga händelser matchar filtret."
            : selectedDay
              ? "Inga händelser denna dag."
              : "Inga händelser denna månad."}
        </p>
      ) : (
        filtered.map((ev) => {
          const holiday = isHolidayEvent(ev);
          return (
            <div
              className="cal-event-row"
              key={ev.id}
              onClick={() => onEventClick(ev)}
              style={{ cursor: "pointer", ...(holiday ? { background: holidayBgColor, color: holidayTextColor } : {}) }}
            >
              <div className="cal-event-color-dot" style={{ background: holiday ? holidayBgColor : (ev.color ?? calendarDisplayColor.get(ev.calendarId) ?? ev.calendarColor) }} />
              <div className="cal-event-row-info">
                <span className="cal-event-row-title">
                  {ev.title}
                  {ev.recurrence?.type !== "none" && <Repeat size={12} style={{ marginLeft: 5, opacity: 0.55, verticalAlign: "middle" }} />}
                </span>
                <span className="cal-event-row-meta" style={holiday ? { color: holidayTextColor } : undefined}>
                  {ev.isAllDay
                    ? `${fmtFullDate(ev.startsAt.slice(0, 10))} · Heldag`
                    : `${fmtFullDate(ev.startsAt)} · ${fmtTime(ev.startsAt)}–${fmtTime(ev.endsAt)}`}
                  {ev.location && <> · <MapPin size={11} style={{ verticalAlign: "middle" }} /> {ev.location}</>}
                  {" · "}{ev.calendarName}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function CalendarView({ calendars, currentMember, activeMembers, roles, displayOnly = false, calendarSettings, onAddEvent, onUpdateEvent, onDeleteEvent, onRsvpEvent }: Props) {
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

  // ── List events below grid (same overlap logic as eventsForDay) ──
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const monthFirstDay = `${monthPrefix}-01`;
  const monthLastDay = `${monthPrefix}-${String(new Date(viewYear, viewMonth + 1, 0).getDate()).padStart(2, "0")}`;

  const listEvents = selectedDay
    ? eventsForDay(selectedDay)
    : expandedEvents
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

  if (visible.length === 0 && !displayOnly) {
    return (
      <article className="dashboard">
        <header className="section-header">
          <div><p className="eyebrow">Kalender</p><h2>Inga kalendrar</h2></div>
        </header>
        <p className="empty-note">Du har inga tillgängliga kalendrar. Skapa en i Inställningar.</p>
      </article>
    );
  }

  // ── Shared modal (used in both displayOnly and full view) ──
  const eventModalOverlay = modal ? (
    <div className="cal-form-overlay" onClick={closeModal}>
      <div className="cal-form-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cal-form-hdr">
          <span>{isEditing ? (eventIsEditable ? "Redigera händelse" : "Händelse") : "Ny händelse"}</span>
          <button className="icon-button" onClick={closeModal} type="button"><X size={18} /></button>
        </div>
        {isEditing && !eventIsEditable ? (
          <div className="cal-form-body">
            <p style={{ fontWeight: 700, fontSize: "1.05rem" }}>{modal.event.title}</p>
            <p className="cal-event-row-meta">
              {modal.event.isAllDay
                ? `${fmtFullDate(modal.event.startsAt.slice(0, 10))} · Heldag`
                : `${fmtFullDate(modal.event.startsAt)} · ${fmtTime(modal.event.startsAt)}–${fmtTime(modal.event.endsAt)}`}
            </p>
            {modal.event.location && <p className="cal-event-row-meta"><MapPin size={13} /> {modal.event.location}</p>}
            {modal.event.notes && (
              <p style={{ fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>
                {modal.event.notes.replace(/\\n/g, "\n")}
              </p>
            )}
          </div>
        ) : (
          <div className="cal-form-body">
            {editableCalendars.length > 1 && (
              <select className="text-input" onChange={(e) => setField("calendarId", e.target.value)} value={form.calendarId}>
                {editableCalendars.map((cal) => <option key={cal.id} value={cal.id}>{cal.name}</option>)}
              </select>
            )}
            <input
              autoFocus
              className="text-input"
              onChange={(e) => setField("title", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitForm(); }}
              placeholder="Titel"
              value={form.title}
            />
            <label className="cal-allday-row">
              <input
                checked={form.isAllDay}
                onChange={(e) => {
                  const allDay = e.target.checked;
                  setForm((f) => ({
                    ...f,
                    isAllDay: allDay,
                    startsAt: allDay ? f.startsAt.slice(0, 10) : `${f.startsAt.slice(0, 10)}T09:00`,
                    endsAt: allDay ? f.endsAt.slice(0, 10) : `${f.endsAt.slice(0, 10)}T10:00`,
                  }));
                }}
                type="checkbox"
              />
              <span>Heldag</span>
            </label>
            <div className="cal-form-datetimes">
              <div className="cal-form-row">
                <label className="field-label">Startar</label>
                <input className="text-input" onChange={(e) => setField("startsAt", e.target.value)} type={form.isAllDay ? "date" : "datetime-local"} value={form.startsAt} />
              </div>
              <div className="cal-form-row">
                <label className="field-label">Slutar</label>
                <input className="text-input" onChange={(e) => setField("endsAt", e.target.value)} type={form.isAllDay ? "date" : "datetime-local"} value={form.endsAt} />
              </div>
            </div>
            <div className="cal-form-location">
              <MapPin size={15} />
              <input className="text-input" onChange={(e) => setField("location", e.target.value)} placeholder="Plats (valfritt)" value={form.location} />
            </div>
            <textarea className="text-input cal-notes" onChange={(e) => setField("notes", e.target.value)} placeholder="Anteckningar (valfritt)" rows={2} value={form.notes} />
            <div className="cal-recurrence">
              <div className="cal-recurrence-top">
                <RefreshCw size={15} />
                <select className="text-input" onChange={(e) => setField("recurrenceType", e.target.value as EventRecurrence["type"])} value={form.recurrenceType}>
                  {(Object.keys(RECURRENCE_LABELS) as EventRecurrence["type"][]).map((k) => (
                    <option key={k} value={k}>{RECURRENCE_LABELS[k]}</option>
                  ))}
                </select>
              </div>
              {form.recurrenceType !== "none" && (
                <div className="cal-recurrence-details">
                  <label className="field-label">Var</label>
                  <input className="text-input cal-interval-input" min={1} onChange={(e) => setField("recurrenceInterval", Math.max(1, Number(e.target.value)))} type="number" value={form.recurrenceInterval} />
                  <span className="cal-interval-unit">{RECURRENCE_UNIT[form.recurrenceType]}</span>
                  <label className="field-label" style={{ marginLeft: 12 }}>Slutar</label>
                  <input className="text-input" onChange={(e) => setField("recurrenceUntil", e.target.value)} placeholder="Aldrig" type="date" value={form.recurrenceUntil} />
                </div>
              )}
            </div>
            {otherMembers.length > 0 && (
              <div className="cal-attendees">
                <p className="field-label">Bjud in familjemedlemmar</p>
                <div className="cal-attendee-list">
                  {otherMembers.map((member) => {
                    const checked = form.attendeeIds.includes(member.id);
                    return (
                      <label className={`cal-attendee-item${checked ? " cal-attendee-item--checked" : ""}`} key={member.id}>
                        <input checked={checked} onChange={() => toggleAttendee(member.id)} style={{ display: "none" }} type="checkbox" />
                        <MemberAvatar member={member} size="small" />
                        <span>{member.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="cal-form-actions">
              {isEditing && (
                <button className="danger-button cal-delete-btn" onClick={deleteEvent} type="button">
                  <Trash2 size={15} /> Radera
                </button>
              )}
              <button className="primary-button" disabled={!form.title.trim() || !form.startsAt || !form.endsAt} onClick={submitForm} style={{ flex: 1 }} type="button">
                {isEditing ? "Spara ändringar" : "Spara händelse"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  if (displayOnly) {
    const handleDayTouchStart = (dateStr: string) => {
      if (editableCalendars.length === 0 || !onAddEvent) return;
      longPressRef.current = setTimeout(() => { openNew(dateStr); }, 600);
    };
    const handleDayTouchEnd = () => {
      if (longPressRef.current !== null) { clearTimeout(longPressRef.current); longPressRef.current = null; }
    };

    return (
      <div className="cal-overview-wrap">
        {(editableCalendars.length > 0 && onAddEvent) && (
          <div className="cal-overview-header">
            <button className="primary-button cal-new-btn" onClick={() => openNew()} type="button">
              <Plus size={16} /> Ny händelse
            </button>
          </div>
        )}

        <div className="cal-grid-card">
          <div className="cal-grid-nav">
            <button className="icon-button" onClick={prevMonth} type="button"><ChevronLeft size={18} /></button>
            <span className="cal-grid-month">{MONTHS[viewMonth]} {viewYear}</span>
            <button className="icon-button" onClick={nextMonth} type="button"><ChevronRight size={18} /></button>
          </div>
          <div className={`cal-day-names${showWeekNumbers ? " cal-day-names--wk" : ""}`}>
            {showWeekNumbers && <span className="cal-wk-label" />}
            {DAYS.map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className={`cal-grid${showWeekNumbers ? " cal-grid--wk" : ""}`}>
            {weeks.map((week) => (
              <Fragment key={week[0].date.getTime()}>
                {showWeekNumbers && (
                  <span className="cal-wk-num">
                    v.{getISOWeek(week[0].date)}
                  </span>
                )}
                {week.map(({ date, isCurrentMonth }) => {
                  const dateStr = toLocalDateStr(date);
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDay;
                  const dayEvents = isCurrentMonth
                    ? eventsForDay(dateStr).filter((ev) => showHolidays || !isHolidayEvent(ev))
                    : [];
                  return (
                    <div
                      key={dateStr}
                      className={["cal-cell", !isCurrentMonth && "cal-cell--other", isToday && "cal-cell--today", isSelected && "cal-cell--selected"].filter(Boolean).join(" ")}
                      onClick={() => { if (isCurrentMonth) setSelectedDay((s) => s === dateStr ? null : dateStr); }}
                      onTouchCancel={handleDayTouchEnd}
                      onTouchEnd={handleDayTouchEnd}
                      onTouchStart={() => { if (isCurrentMonth) handleDayTouchStart(dateStr); }}
                    >
                      <span className="cal-cell-num">{date.getDate()}</span>
                      <div className="cal-cell-dots">
                        {dayEvents.slice(0, 5).map((ev) => {
                          const holiday = isHolidayEvent(ev);
                          return (
                            <span
                              key={ev.id}
                              className="cal-cell-dot"
                              style={{ background: holiday ? holidayBgColor : (calendarDisplayColor.get(ev.calendarId) ?? ev.calendarColor) }}
                              title={ev.title}
                            />
                          );
                        })}
                        {dayEvents.length > 5 && <span className="cal-cell-dot-more">+{dayEvents.length - 5}</span>}
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>

        <CalendarEventList
          key={`${viewYear}-${viewMonth}`}
          allEvents={listEvents}
          selectedDay={selectedDay}
          viewYear={viewYear}
          viewMonth={viewMonth}
          todayStr={todayStr}
          visible={visible}
          calendarDisplayColor={calendarDisplayColor}
          showHolidays={showHolidays}
          holidayBgColor={holidayBgColor}
          holidayTextColor={holidayTextColor}
          onEventClick={setDetailEvent}
          onClearDay={() => setSelectedDay(null)}
        />

        {/* Event detail panel */}
        {detailEvent && (
          <div className="cal-form-overlay" onClick={() => setDetailEvent(null)}>
            <div className="cal-form-modal" onClick={(e) => e.stopPropagation()}>
              <div className="cal-form-hdr">
                <span>Händelse</span>
                <button className="icon-button" onClick={() => setDetailEvent(null)} type="button"><X size={18} /></button>
              </div>
              <div className="cal-form-body">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <div className="cal-event-color-dot" style={{ background: detailEvent.color ?? calendarDisplayColor.get(detailEvent.calendarId) ?? detailEvent.calendarColor }} />
                  <p style={{ fontWeight: 700, fontSize: "1.1rem", margin: 0 }}>{detailEvent.title}</p>
                </div>
                <p className="cal-event-row-meta">
                  {detailEvent.isAllDay
                    ? `${fmtFullDate(detailEvent.startsAt.slice(0, 10))} · Heldag`
                    : `${fmtFullDate(detailEvent.startsAt)} · ${fmtTime(detailEvent.startsAt)}–${fmtTime(detailEvent.endsAt)}`}
                </p>
                {detailEvent.location && (
                  <p className="cal-event-row-meta" style={{ marginTop: 4 }}>
                    <MapPin size={13} style={{ verticalAlign: "middle" }} /> {detailEvent.location}
                  </p>
                )}
                {detailEvent.notes && (
                  <p style={{ fontSize: "0.875rem", marginTop: 8, whiteSpace: "pre-wrap" }}>
                    {detailEvent.notes.replace(/\\n/g, "\n")}
                  </p>
                )}
                <p className="cal-event-row-meta" style={{ marginTop: 8 }}>
                  {detailEvent.calendarName}
                  {activeMembers.find((m) => m.id === detailEvent.calendarOwnerId) && (
                    <> · {activeMembers.find((m) => m.id === detailEvent.calendarOwnerId)!.name}</>
                  )}
                </p>
                {canEditEvent(detailEvent) && onUpdateEvent && (
                  <button
                    className="primary-button"
                    onClick={() => { setDetailEvent(null); openEdit(detailEvent); }}
                    style={{ marginTop: 12, width: "100%" }}
                    type="button"
                  >
                    Redigera händelse
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {eventModalOverlay}
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
              <div className="cal-event-color-dot" style={{ background: ev.color ?? ev.calendarColor }} />
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
        <div className={`cal-day-names${showWeekNumbers ? " cal-day-names--wk" : ""}`}>
          {showWeekNumbers && <span className="cal-wk-label" />}
          {DAYS.map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className={`cal-grid${showWeekNumbers ? " cal-grid--wk" : ""}`}>
          {weeks.map((week) => (
            <Fragment key={week[0].date.getTime()}>
              {showWeekNumbers && (
                <span className="cal-wk-num">
                  v.{getISOWeek(week[0].date)}
                </span>
              )}
              {week.map(({ date, isCurrentMonth }) => {
                const dateStr = toLocalDateStr(date);
                const isToday = dateStr === todayStr;
                const isSelected = dateStr === selectedDay;
                const dayEvents = isCurrentMonth
                  ? eventsForDay(dateStr).filter((ev) => showHolidays || !isHolidayEvent(ev))
                  : [];

                return (
                  <div
                    key={dateStr}
                    className={["cal-cell", !isCurrentMonth && "cal-cell--other", isToday && "cal-cell--today", isSelected && "cal-cell--selected"].filter(Boolean).join(" ")}
                    onClick={() => { if (isCurrentMonth) setSelectedDay((s) => s === dateStr ? null : dateStr); }}
                  >
                    <span className="cal-cell-num">{date.getDate()}</span>
                    <div className="cal-cell-events">
                      {dayEvents.slice(0, 3).map((ev) => {
                        const holiday = isHolidayEvent(ev);
                        return (
                          <div
                            key={ev.id}
                            className="cal-event-pill"
                            style={holiday
                              ? { "--event-color": holidayBgColor, color: holidayTextColor } as React.CSSProperties
                              : { "--event-color": ev.calendarColor } as React.CSSProperties}
                            title={ev.title}
                            onClick={(e) => { e.stopPropagation(); openEdit(ev); }}
                          >
                            {!ev.isAllDay && `${fmtTime(ev.startsAt)} `}{ev.title}
                            {ev.recurrence?.type !== "none" && <Repeat size={8} style={{ marginLeft: 2, opacity: 0.7 }} />}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && <span className="cal-event-more">+{dayEvents.length - 3}</span>}
                    </div>
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* ── Event list ── */}
      <CalendarEventList
        key={`${viewYear}-${viewMonth}`}
        allEvents={listEvents}
        selectedDay={selectedDay}
        viewYear={viewYear}
        viewMonth={viewMonth}
        todayStr={todayStr}
        visible={visible}
        calendarDisplayColor={calendarDisplayColor}
        showHolidays={showHolidays}
        holidayBgColor={holidayBgColor}
        holidayTextColor={holidayTextColor}
        onEventClick={openEdit}
        onClearDay={() => setSelectedDay(null)}
      />

      {eventModalOverlay}
    </div>
  );
}

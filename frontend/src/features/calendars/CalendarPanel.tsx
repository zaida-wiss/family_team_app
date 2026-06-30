import { CalendarDays, Check, Download, Pencil, Plus, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  canExportCalendar,
  hasPermission
} from "../../utils/permissions";
import styles from "./CalendarPanel.module.css";
import type { AddEventInput } from "./useCalendarsState";
import type { AccessLevel, Calendar, Id, IcsSubscription, Member, Role } from "@shared/types";
import { filterByDateRange, parseIcsEvents, toIcs } from "./calendarIcs";
import type { ImportedCalendarEvent } from "./calendarIcs";
import { canEditCalendar, formatTimeRange } from "./calendarPanelHelpers";
import { PreviewSelector } from "./PreviewSelector";
import { WordTagInput } from "./WordTagInput";
import { CalendarSubscriptionsSection } from "./CalendarSubscriptionsSection";
import { CalendarShareSection } from "./CalendarShareSection";

type CalendarPanelProps = {
  calendars: Calendar[];
  currentMember: Member;
  members: Member[];
  roles: Role[];
  managementOnly?: boolean;
  onAddEvent: (calendarId: Id, event: AddEventInput) => void;
  onCreateCalendar: (name: string, color: string) => void;
  onUpdateCalendarColor: (calendarId: Id, color: string) => void;
  onRenameCalendar: (calendarId: Id, name: string) => void;
  onTransferCalendar: (calendarId: Id, newOwnerId: Id) => void;
  onDeleteCalendar: (calendarId: Id) => void;
  onImportCalendar: (calendarId: Id, sourceName: string, events: ImportedCalendarEvent[]) => void;
  onShareCalendar: (calendarId: Id, memberId: Id, access: AccessLevel) => void;
  onRemoveCalendarShare: (calendarId: Id, memberId: Id) => void;
  onAddSubscription: (calendarId: Id, sub: Omit<IcsSubscription, "id" | "calendarId" | "lastSyncedAt">) => void;
  onUpdateSubscription: (calendarId: Id, subId: Id, patch: Partial<Pick<IcsSubscription, "includeWords" | "excludeWords" | "displaySymbol">>) => Promise<void>;
  onRemoveSubscription: (calendarId: Id, subId: Id) => void;
  onSyncSubscription: (calendarId: Id, subId: Id) => Promise<void>;
  onUpdateCalendarKeepAllHistory?: (calendarId: Id, keepAllHistory: boolean) => void;
};

export function CalendarPanel({
  calendars,
  currentMember,
  members,
  roles,
  managementOnly = false,
  onAddEvent,
  onCreateCalendar,
  onUpdateCalendarColor,
  onRenameCalendar,
  onTransferCalendar,
  onDeleteCalendar,
  onImportCalendar,
  onRemoveCalendarShare,
  onShareCalendar,
  onAddSubscription,
  onUpdateSubscription,
  onRemoveSubscription,
  onSyncSubscription,
  onUpdateCalendarKeepAllHistory,
}: CalendarPanelProps) {
  const canCreateCalendar = hasPermission(currentMember, roles, "canCreateCalendar");
  const canImport = hasPermission(currentMember, roles, "canImportCalendar");

  const visibleCalendars = calendars.filter((cal) => {
    if (cal.deletedAt !== null) return false;
    if (hasPermission(currentMember, roles, "canSeeAllCalendar")) return true;
    return hasPermission(currentMember, roles, "canSeeOwnCalendar") &&
      cal.sharedWith.some((s) => s.memberId === currentMember.id) ||
      (cal as Calendar & { ownerId?: string }).ownerId === currentMember.id;
  });

  const firstEditable = visibleCalendars.find((cal) => canEditCalendar(currentMember, roles, cal, members));
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    firstEditable?.id ?? visibleCalendars[0]?.id ?? ""
  );
  const selectedCalendar = visibleCalendars.find((cal) => cal.id === selectedCalendarId) ?? visibleCalendars[0] ?? null;

  const [calendarName, setCalendarName] = useState("");
  const [newCalendarColor, setNewCalendarColor] = useState(currentMember.color ?? "#2f7d6d");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(selectedCalendar?.name ?? "");
  const [transferOwnerId, setTransferOwnerId] = useState((selectedCalendar as (Calendar & { ownerId?: string }) | null)?.ownerId ?? "");
  const [eventTitle, setEventTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [previewEvents, setPreviewEvents] = useState<ImportedCalendarEvent[] | null>(null);
  const [previewSource, setPreviewSource] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [fileFilterFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [fileFilterTo] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10);
  });

  useEffect(() => {
    setIsRenaming(false);
    setRenameValue(selectedCalendar?.name ?? "");
    setTransferOwnerId((selectedCalendar as (Calendar & { ownerId?: string }) | null)?.ownerId ?? "");
  }, [selectedCalendarId]);

  const canEditSelectedCalendar = selectedCalendar !== null && canEditCalendar(currentMember, roles, selectedCalendar, members);
  const canImportToSelected = !!selectedCalendar && canImport && canEditSelectedCalendar;
  const activeOtherMembers = members.filter((m) => m.id !== currentMember.id && m.deletedAt === null);

  function createCalendar() {
    const name = calendarName.trim();
    if (!name || !canCreateCalendar) return;
    onCreateCalendar(name, newCalendarColor);
    setCalendarName("");
  }

  function toggleFamilyShared() {
    if (!selectedCalendar || !canEditSelectedCalendar) return;
    const isSharedWithAll = activeOtherMembers.length > 0 &&
      activeOtherMembers.every((m) => selectedCalendar.sharedWith.some((s) => s.memberId === m.id));
    if (isSharedWithAll) {
      for (const share of selectedCalendar.sharedWith) onRemoveCalendarShare(selectedCalendar.id, share.memberId);
    } else {
      for (const m of activeOtherMembers) {
        if (!selectedCalendar.sharedWith.some((s) => s.memberId === m.id)) {
          onShareCalendar(selectedCalendar.id, m.id, "view");
        }
      }
    }
  }

  function addEvent() {
    const title = eventTitle.trim();
    if (!title || !startsAt || !endsAt || !selectedCalendar || !canEditSelectedCalendar) return;
    onAddEvent(selectedCalendar.id, { title, startsAt, endsAt, isAllDay: false, notes: null });
    setEventTitle(""); setStartsAt(""); setEndsAt("");
  }

  async function importCalendar(file: File | null) {
    if (!file || !canImportToSelected || !selectedCalendar) return;
    const events = filterByDateRange(parseIcsEvents(await file.text()), fileFilterFrom, fileFilterTo);
    setPreviewSource(file.name);
    setPreviewEvents(events);
    setSelectedEventIds(new Set(events.map((_, i) => String(i))));
  }

  function copySchoolClosedToParents(events: ImportedCalendarEvent[], sourceName: string) {
    if (!selectedCalendar) return;
    const schoolClosed = events.filter((ev) => /stängningsdag|kompetensdag/i.test(ev.title));
    if (schoolClosed.length === 0) return;
    for (const m of members.filter((m) => !m.isChild && m.deletedAt === null && m.id !== (selectedCalendar as Calendar & { ownerId?: string }).ownerId)) {
      const cal = calendars.find((c) => (c as Calendar & { ownerId?: string }).ownerId === m.id && c.deletedAt === null);
      if (cal) onImportCalendar(cal.id, sourceName, schoolClosed);
    }
  }

  function confirmImport() {
    if (!previewEvents || !selectedCalendar) return;
    const chosen = previewEvents.filter((_, i) => selectedEventIds.has(String(i)));
    if (chosen.length === 0) return;
    onImportCalendar(selectedCalendar.id, previewSource, chosen);
    copySchoolClosedToParents(chosen, previewSource);
    setPreviewEvents(null); setSelectedEventIds(new Set()); setPreviewSource("");
  }

  function exportCalendar(calendar: Calendar) {
    if (!canExportCalendar(currentMember, roles, calendar)) return;
    const blob = new Blob([toIcs(calendar)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${calendar.name}.ics`; link.click();
    URL.revokeObjectURL(url);
  }

  if (visibleCalendars.length === 0 && !canCreateCalendar) {
    return <p className="empty-note">Du har ingen kalender att visa.</p>;
  }

  return (
    <div className="dashboard-list">
      <section className={styles.createCard} aria-label="Skapa kalender">
        <div>
          <p className="eyebrow">Ny kalender</p>
          <h3>Skapa privat kalender</h3>
        </div>
        <div className={styles.createRow}>
          <input
            className={styles.colorInput}
            disabled={!canCreateCalendar}
            onChange={(e) => setNewCalendarColor(e.target.value)}
            title="Välj kalenderfärg"
            type="color"
            value={newCalendarColor}
          />
          <input
            className="text-input"
            disabled={!canCreateCalendar}
            onChange={(e) => setCalendarName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createCalendar(); }}
            placeholder="Till exempel Min kalender"
            value={calendarName}
          />
          <button aria-label="Skapa kalender" className="icon-button" disabled={!canCreateCalendar} onClick={createCalendar} type="button">
            <Plus size={16} />
          </button>
        </div>
      </section>

      {selectedCalendar && (
        <section className={styles.toolCard} aria-label="Kalenderverktyg">
          <label>
            Kalender
            <select className="text-input" onChange={(e) => setSelectedCalendarId(e.target.value)} value={selectedCalendar.id}>
              {visibleCalendars.map((cal) => (
                <option key={cal.id} value={cal.id}>{cal.name}</option>
              ))}
            </select>
          </label>

          {canEditSelectedCalendar && isRenaming && (
            <div className={styles.renameRow}>
              <input
                autoFocus
                className="text-input"
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const name = renameValue.trim();
                    if (name && name !== selectedCalendar.name) onRenameCalendar(selectedCalendar.id, name);
                    setIsRenaming(false);
                  }
                  if (e.key === "Escape") { setRenameValue(selectedCalendar.name); setIsRenaming(false); }
                }}
                placeholder="Kalendernamn"
                value={renameValue}
              />
              <button
                aria-label="Spara nytt namn"
                className="icon-button"
                disabled={!renameValue.trim()}
                onClick={() => {
                  const name = renameValue.trim();
                  if (name && name !== selectedCalendar.name) onRenameCalendar(selectedCalendar.id, name);
                  setIsRenaming(false);
                }}
                title="Spara nytt namn"
                type="button"
              >
                <Check size={16} />
              </button>
            </div>
          )}

          {canEditSelectedCalendar && (
            <label className={styles.ownerLabel}>
              Tilldelad till
              <div className={styles.ownerRow}>
                <select
                  className="text-input"
                  onChange={(e) => setTransferOwnerId(e.target.value)}
                  value={transferOwnerId}
                >
                  {members.filter((m) => m.deletedAt === null).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {transferOwnerId !== (selectedCalendar as Calendar & { ownerId?: string }).ownerId && (
                  <button
                    aria-label="Tilldela kalender"
                    className="icon-button"
                    onClick={() => onTransferCalendar(selectedCalendar.id, transferOwnerId)}
                    title="Tilldela kalender"
                    type="button"
                  >
                    <Check size={16} />
                  </button>
                )}
              </div>
            </label>
          )}

          {canEditSelectedCalendar && (
            <div className={styles.settingsRow}>
              <label className={styles.colorLabel}>
                <span>Färg</span>
                <input
                  className={styles.colorInput}
                  onChange={(e) => onUpdateCalendarColor(selectedCalendar.id, e.target.value)}
                  title="Kalenderfärg"
                  type="color"
                  value={selectedCalendar.color}
                />
              </label>
              <button
                className={`secondary-button ${styles.shareToggle} ${
                  activeOtherMembers.length > 0 && activeOtherMembers.every((m) => selectedCalendar.sharedWith.some((s) => s.memberId === m.id))
                    ? styles.shareToggleShared : ""
                }`}
                onClick={toggleFamilyShared}
                title={
                  activeOtherMembers.length > 0 && activeOtherMembers.every((m) => selectedCalendar.sharedWith.some((s) => s.memberId === m.id))
                    ? "Gör kalendern privat" : "Dela med hela familjen"
                }
                type="button"
              >
                {activeOtherMembers.length > 0 && activeOtherMembers.every((m) => selectedCalendar.sharedWith.some((s) => s.memberId === m.id))
                  ? "Delas med familjen" : "Dela med familjen"}
              </button>
            </div>
          )}

          {canEditSelectedCalendar && onUpdateCalendarKeepAllHistory && (
            <label className={styles.keepHistoryRow}>
              <input
                type="checkbox"
                checked={selectedCalendar.keepAllHistory ?? false}
                onChange={(e) => onUpdateCalendarKeepAllHistory(selectedCalendar.id, e.target.checked)}
              />
              <span className={styles.keepHistoryText}>
                <strong>Bevara all historik</strong>
                <small>
                  {selectedCalendar.keepAllHistory
                    ? "Händelser sparas för alltid — inget raderas automatiskt."
                    : "Händelser äldre än 1 månad raderas automatiskt. Bra för prenumerationer med många händelser."}
                </small>
              </span>
            </label>
          )}

          <div className="calendar-actions">
            <button
              aria-label="Radera kalender"
              className="icon-button danger"
              disabled={!canEditSelectedCalendar}
              onClick={() => {
                if (confirm(`Radera "${selectedCalendar.name}"? Detta går inte att ångra.`)) {
                  onDeleteCalendar(selectedCalendar.id);
                }
              }}
              title="Radera kalender"
              type="button"
            >
              <X size={16} />
            </button>
            <button
              aria-label="Byt namn"
              className={`icon-button${isRenaming ? " icon-button--active" : ""}`}
              disabled={!canEditSelectedCalendar}
              onClick={() => { setRenameValue(selectedCalendar.name); setIsRenaming((v) => !v); }}
              title="Byt namn"
              type="button"
            >
              <Pencil size={16} />
            </button>
            <label className="secondary-button">
              <Upload size={16} />
              Importera fil
              <input
                accept=".ics,text/calendar"
                disabled={!canImport || !canEditSelectedCalendar}
                hidden
                onChange={(e) => { void importCalendar(e.target.files?.[0] ?? null); e.target.value = ""; }}
                type="file"
              />
            </label>
            <button
              className="secondary-button"
              disabled={!canExportCalendar(currentMember, roles, selectedCalendar)}
              onClick={() => exportCalendar(selectedCalendar)}
              type="button"
            >
              <Download size={16} />
              Exportera
            </button>
          </div>

          {previewEvents !== null && (
            <div className={styles.importBlock}>
              <p className="eyebrow">Välj händelser att importera</p>
              <PreviewSelector
                events={previewEvents}
                selectedIds={selectedEventIds}
                onChangeSelected={setSelectedEventIds}
                onConfirm={confirmImport}
              />
            </div>
          )}

          {canImport && canEditSelectedCalendar && (
            <CalendarSubscriptionsSection
              selectedCalendar={selectedCalendar}
              canImportToSelected={canImportToSelected}
              onAddSubscription={onAddSubscription}
              onUpdateSubscription={onUpdateSubscription}
              onRemoveSubscription={onRemoveSubscription}
              onSyncSubscription={onSyncSubscription}
            />
          )}
        </section>
      )}

      {selectedCalendar && (
        <CalendarShareSection
          selectedCalendar={selectedCalendar}
          members={members}
          currentMemberId={currentMember.id}
          canEdit={canEditSelectedCalendar}
          onShareCalendar={onShareCalendar}
          onRemoveCalendarShare={onRemoveCalendarShare}
        />
      )}

      {!managementOnly && selectedCalendar && (
        <section className={styles.toolCard} aria-label="Lägg till kalenderhändelse">
          <div className="calendar-event-form">
            <input
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Händelse"
              value={eventTitle}
            />
            <input
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(e) => setStartsAt(e.target.value)}
              type="datetime-local"
              value={startsAt}
            />
            <input
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(e) => setEndsAt(e.target.value)}
              type="datetime-local"
              value={endsAt}
            />
            <button
              aria-label="Lägg till händelse"
              className="icon-button"
              disabled={!canEditSelectedCalendar}
              onClick={addEvent}
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>
        </section>
      )}

      {!managementOnly && visibleCalendars.flatMap((cal) =>
        cal.events
          .filter((ev) => ev.deletedAt === null)
          .map((ev) => (
            <div className="dashboard-row" key={ev.id}>
              <CalendarDays size={18} />
              <span>{ev.title}<small>{cal.name}</small></span>
              <strong>{formatTimeRange(ev.startsAt, ev.endsAt)}</strong>
            </div>
          ))
      )}
    </div>
  );
}

// Re-export for callers that import from this file
export type { ImportedCalendarEvent };
export { WordTagInput };

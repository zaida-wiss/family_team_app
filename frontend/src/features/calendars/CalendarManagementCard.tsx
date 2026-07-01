import { useEffect, useState } from "react";
import { Check, Download, Pencil, Upload, X } from "lucide-react";
import { canExportCalendar } from "../../utils/permissions";
import styles from "./CalendarPanel.module.css";
import type { AccessLevel, Calendar, Id, IcsSubscription, Member, Role } from "@shared/types";
import { filterByDateRange, parseIcsEvents, toIcs } from "./calendarIcs";
import type { ImportedCalendarEvent } from "./calendarIcs";
import { PreviewSelector } from "./PreviewSelector";
import { CalendarSubscriptionsSection } from "./CalendarSubscriptionsSection";

type Props = {
  calendars: Calendar[];
  visibleCalendars: Calendar[];
  members: Member[];
  currentMember: Member;
  roles: Role[];
  selectedCalendar: Calendar;
  onSelectCalendar: (calendarId: Id) => void;
  canEdit: boolean;
  canImport: boolean;
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

export function CalendarManagementCard({
  calendars,
  visibleCalendars,
  members,
  currentMember,
  roles,
  selectedCalendar,
  onSelectCalendar,
  canEdit,
  canImport,
  onUpdateCalendarColor,
  onRenameCalendar,
  onTransferCalendar,
  onDeleteCalendar,
  onImportCalendar,
  onShareCalendar,
  onRemoveCalendarShare,
  onAddSubscription,
  onUpdateSubscription,
  onRemoveSubscription,
  onSyncSubscription,
  onUpdateCalendarKeepAllHistory,
}: Props) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(selectedCalendar.name);
  const [transferOwnerId, setTransferOwnerId] = useState(
    (selectedCalendar as Calendar & { ownerId?: string }).ownerId ?? ""
  );
  const [previewEvents, setPreviewEvents] = useState<ImportedCalendarEvent[] | null>(null);
  const [previewSource, setPreviewSource] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [fileFilterFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [fileFilterTo] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10);
  });

  useEffect(() => {
    setIsRenaming(false);
    setRenameValue(selectedCalendar.name);
    setTransferOwnerId((selectedCalendar as Calendar & { ownerId?: string }).ownerId ?? "");
  }, [selectedCalendar.id, selectedCalendar.name]);

  const canImportToSelected = canImport && canEdit;
  const activeOtherMembers = members.filter((m) => m.id !== currentMember.id && m.deletedAt === null);
  const isSharedWithAll = activeOtherMembers.length > 0 &&
    activeOtherMembers.every((m) => selectedCalendar.sharedWith.some((s) => s.memberId === m.id));

  function toggleFamilyShared() {
    if (!canEdit) return;
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

  async function importCalendar(file: File | null) {
    if (!file || !canImportToSelected) return;
    const events = filterByDateRange(parseIcsEvents(await file.text()), fileFilterFrom, fileFilterTo);
    setPreviewSource(file.name);
    setPreviewEvents(events);
    setSelectedEventIds(new Set(events.map((_, i) => String(i))));
  }

  function copySchoolClosedToParents(events: ImportedCalendarEvent[], sourceName: string) {
    const schoolClosed = events.filter((ev) => /stängningsdag|kompetensdag/i.test(ev.title));
    if (schoolClosed.length === 0) return;
    const ownerId = (selectedCalendar as Calendar & { ownerId?: string }).ownerId;
    for (const m of members.filter((m) => !m.isChild && m.deletedAt === null && m.id !== ownerId)) {
      const cal = calendars.find((c) => (c as Calendar & { ownerId?: string }).ownerId === m.id && c.deletedAt === null);
      if (cal) onImportCalendar(cal.id, sourceName, schoolClosed);
    }
  }

  function confirmImport() {
    if (!previewEvents) return;
    const chosen = previewEvents.filter((_, i) => selectedEventIds.has(String(i)));
    if (chosen.length === 0) return;
    onImportCalendar(selectedCalendar.id, previewSource, chosen);
    copySchoolClosedToParents(chosen, previewSource);
    setPreviewEvents(null); setSelectedEventIds(new Set()); setPreviewSource("");
  }

  function exportCalendar() {
    if (!canExportCalendar(currentMember, roles, selectedCalendar)) return;
    const blob = new Blob([toIcs(selectedCalendar)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${selectedCalendar.name}.ics`; link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={styles.toolCard} aria-label="Kalenderverktyg">
      <label>
        Kalender
        <select className="text-input" onChange={(e) => onSelectCalendar(e.target.value as Id)} value={selectedCalendar.id}>
          {visibleCalendars.map((cal) => (
            <option key={cal.id} value={cal.id}>{cal.name}</option>
          ))}
        </select>
      </label>

      {canEdit && isRenaming && (
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

      {canEdit && (
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
                onClick={() => onTransferCalendar(selectedCalendar.id, transferOwnerId as Id)}
                title="Tilldela kalender"
                type="button"
              >
                <Check size={16} />
              </button>
            )}
          </div>
        </label>
      )}

      {canEdit && (
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
            className={`secondary-button ${styles.shareToggle} ${isSharedWithAll ? styles.shareToggleShared : ""}`}
            onClick={toggleFamilyShared}
            title={isSharedWithAll ? "Gör kalendern privat" : "Dela med hela familjen"}
            type="button"
          >
            {isSharedWithAll ? "Delas med familjen" : "Dela med familjen"}
          </button>
        </div>
      )}

      {canEdit && onUpdateCalendarKeepAllHistory && (
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
          disabled={!canEdit}
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
          disabled={!canEdit}
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
            disabled={!canImport || !canEdit}
            hidden
            onChange={(e) => { void importCalendar(e.target.files?.[0] ?? null); e.target.value = ""; }}
            type="file"
          />
        </label>
        <button
          className="secondary-button"
          disabled={!canExportCalendar(currentMember, roles, selectedCalendar)}
          onClick={exportCalendar}
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

      {canImport && canEdit && (
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
  );
}

import { CalendarDays, Check, Download, Globe, Pencil, Plus, RefreshCw, Share2, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { calendarsApi } from "../../api";
import {
  canEditSharedResource,
  canExportCalendar,
  canViewResource,
  hasPermission
} from "../../utils/permissions";
import type { AddEventInput } from "./useCalendarsState";
import type { AccessLevel, Calendar, Id, IcsSubscription, Member, Role } from "@shared/types";

type ImportedCalendarEvent = {
  title: string;
  startsAt: string;
  endsAt: string;
  isAllDay: boolean;
  color: string | null;
  notes: string | null;
  categories: string[];
};

const SCHOOL_CLOSED_RE = /stängningsdag|kompetensdag/i;
const LOV_RE = /\blov\b|^ledig|ledighet|sportlov|höstlov|jullov|påsklov|sommarlov|höstledigt|sommarledigt/i;
const HELGDAG_RE = /helgdag|röd dag|nationaldag|jul|påsk|midsommar|nyår|kristi|allhelgon|pingst/i;
const SCHOOL_CLOSED_COLOR = "#e07000";

function detectCategories(title: string, isAllDay: boolean, icsRaw: string[]): string[] {
  const cats = new Set<string>(icsRaw);
  if (SCHOOL_CLOSED_RE.test(title)) cats.add("Stängningsdag");
  else if (LOV_RE.test(title)) cats.add("Lov / Ledigt");
  else if (HELGDAG_RE.test(title)) cats.add("Helgdag");
  else if (isAllDay) cats.add("Heldag");
  else cats.add("Övrigt");
  return [...cats];
}

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
  onImportCalendar: (
    calendarId: Id,
    sourceName: string,
    events: ImportedCalendarEvent[]
  ) => void;
  onShareCalendar: (calendarId: Id, memberId: Id, access: AccessLevel) => void;
  onRemoveCalendarShare: (calendarId: Id, memberId: Id) => void;
  onAddSubscription: (calendarId: Id, sub: Omit<IcsSubscription, "id" | "calendarId" | "lastSyncedAt">) => void;
  onUpdateSubscription: (calendarId: Id, subId: Id, patch: Partial<Pick<IcsSubscription, "includeWords" | "excludeWords">>) => Promise<void>;
  onRemoveSubscription: (calendarId: Id, subId: Id) => void;
  onSyncSubscription: (calendarId: Id, subId: Id) => Promise<void>;
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
  onSyncSubscription
}: CalendarPanelProps) {
  const visibleCalendars = calendars.filter((calendar) => {
    if (calendar.deletedAt !== null) {
      return false;
    }

    if (hasPermission(currentMember, roles, "canSeeAllCalendar")) {
      return true;
    }

    return (
      hasPermission(currentMember, roles, "canSeeOwnCalendar") &&
      canViewResource(currentMember, calendar)
    );
  });
  const firstEditableCalendar = visibleCalendars.find((calendar) =>
    canEditCalendar(currentMember, roles, calendar, members)
  );
  const [selectedCalendarId, setSelectedCalendarId] = useState(
    firstEditableCalendar?.id ?? visibleCalendars[0]?.id ?? ""
  );
  const selectedCalendar =
    visibleCalendars.find((calendar) => calendar.id === selectedCalendarId) ??
    visibleCalendars[0] ??
    null;
  const [calendarName, setCalendarName] = useState("");
  const [newCalendarColor, setNewCalendarColor] = useState(currentMember.color ?? "#2f7d6d");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(selectedCalendar?.name ?? "");
  const [transferOwnerId, setTransferOwnerId] = useState(selectedCalendar?.ownerId ?? "");

  useEffect(() => {
    setIsRenaming(false);
    setRenameValue(selectedCalendar?.name ?? "");
    setTransferOwnerId(selectedCalendar?.ownerId ?? "");
  }, [selectedCalendarId]);
  const [eventTitle, setEventTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [shareMemberId, setShareMemberId] = useState(
    members.find((member) => member.id !== currentMember.id)?.id ?? ""
  );
  const [shareAccess, setShareAccess] = useState<AccessLevel>("view");
  const [newSubUrl, setNewSubUrl] = useState("");
  const [newSubIncludeWords, setNewSubIncludeWords] = useState<string[]>([]);
  const [newSubExcludeWords, setNewSubExcludeWords] = useState<string[]>([]);
  const [addingSub, setAddingSub] = useState(false);
  const [syncingSubId, setSyncingSubId] = useState<string | null>(null);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editIncludeWords, setEditIncludeWords] = useState<string[]>([]);
  const [editExcludeWords, setEditExcludeWords] = useState<string[]>([]);
  const [confirmDeleteSubId, setConfirmDeleteSubId] = useState<string | null>(null);
  const [fileFilterFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [fileFilterTo] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [previewEvents, setPreviewEvents] = useState<ImportedCalendarEvent[] | null>(null);
  const [previewSource, setPreviewSource] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());

  const canCreateCalendar = hasPermission(currentMember, roles, "canCreateCalendar");
  const canImport = hasPermission(currentMember, roles, "canImportCalendar");
  const canEditSelectedCalendar =
    selectedCalendar !== null &&
    canEditCalendar(currentMember, roles, selectedCalendar, members);

  function createCalendar() {
    const name = calendarName.trim();
    if (!name || !canCreateCalendar) return;
    onCreateCalendar(name, newCalendarColor);
    setCalendarName("");
  }

  const activeOtherMembers = members.filter(
    (m) => m.id !== currentMember.id && m.deletedAt === null
  );

  function toggleFamilyShared() {
    if (!selectedCalendar || !canEditSelectedCalendar) return;
    const isSharedWithAll =
      activeOtherMembers.length > 0 &&
      activeOtherMembers.every((m) =>
        selectedCalendar.sharedWith.some((s) => s.memberId === m.id)
      );
    if (isSharedWithAll) {
      for (const share of selectedCalendar.sharedWith) {
        onRemoveCalendarShare(selectedCalendar.id, share.memberId);
      }
    } else {
      for (const m of activeOtherMembers) {
        if (!selectedCalendar.sharedWith.some((s) => s.memberId === m.id)) {
          onShareCalendar(selectedCalendar.id, m.id, "view");
        }
      }
    }
  }

  const canImportToSelected = !!selectedCalendar && canImport && canEditSelectedCalendar;

  function addEvent() {
    const title = eventTitle.trim();
    const ready = title && startsAt && endsAt && selectedCalendar && canEditSelectedCalendar;
    if (!ready) return;

    onAddEvent(selectedCalendar.id, {
      title,
      startsAt,
      endsAt,
      isAllDay: false,
      notes: null
    });
    setEventTitle("");
    setStartsAt("");
    setEndsAt("");
  }

  function shareCalendar() {
    const canShare = !!selectedCalendar && !!shareMemberId && canEditSelectedCalendar;
    if (!canShare) return;
    onShareCalendar(selectedCalendar!.id, shareMemberId, shareAccess);
  }

  async function importCalendar(file: File | null) {
    const ready = file !== null && canImportToSelected && selectedCalendar !== null;
    if (!ready) return;
    const events = filterByDateRange(parseIcsEvents(await file!.text()), fileFilterFrom, fileFilterTo);
    setPreviewSource(file!.name);
    setPreviewEvents(events);
    setSelectedEventIds(new Set(events.map((_, i) => String(i))));
  }

  function isActiveParentOf(m: Member) {
    return !m.isChild && m.deletedAt === null && m.id !== selectedCalendar?.ownerId;
  }

  function copySchoolClosedToParents(events: ImportedCalendarEvent[], sourceName: string) {
    if (!selectedCalendar) return;
    const schoolClosed = events.filter((ev) => SCHOOL_CLOSED_RE.test(ev.title));
    if (schoolClosed.length === 0) return;
    for (const m of members.filter(isActiveParentOf)) {
      const cal = calendars.find((c) => c.ownerId === m.id && c.deletedAt === null);
      if (cal) onImportCalendar(cal.id, sourceName, schoolClosed);
    }
  }

  function confirmImport() {
    if (!previewEvents || !selectedCalendar) return;
    const chosen = previewEvents.filter((_, i) => selectedEventIds.has(String(i)));
    if (chosen.length === 0) return;
    onImportCalendar(selectedCalendar.id, previewSource, chosen);
    copySchoolClosedToParents(chosen, previewSource);
    setPreviewEvents(null);
    setSelectedEventIds(new Set());
    setPreviewSource("");
  }

  async function addSubscription() {
    const url = newSubUrl.trim();
    const canAdd = !!url && !!selectedCalendar && canImportToSelected;
    if (!canAdd) return;
    setAddingSub(true);
    try {
      await onAddSubscription(selectedCalendar.id, {
        url,
        includeWords: newSubIncludeWords,
        excludeWords: newSubExcludeWords,
        dateFrom: null,
        dateTo: null
      });
      setNewSubUrl("");
      setNewSubIncludeWords([]);
      setNewSubExcludeWords([]);
    } finally {
      setAddingSub(false);
    }
  }

  async function saveSubEdit(sub: IcsSubscription) {
    if (!selectedCalendar) return;
    await onUpdateSubscription(selectedCalendar.id, sub.id, {
      includeWords: editIncludeWords,
      excludeWords: editExcludeWords
    });
    setEditingSubId(null);
    await syncSub(sub.id);
  }

  async function syncSub(subId: string) {
    if (!selectedCalendar) return;
    setSyncingSubId(subId);
    try {
      await onSyncSubscription(selectedCalendar.id, subId);
    } finally {
      setSyncingSubId(null);
    }
  }

  function exportCalendar(calendar: Calendar) {
    if (!canExportCalendar(currentMember, roles, calendar)) {
      return;
    }

    const blob = new Blob([toIcs(calendar)], {
      type: "text/calendar;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${calendar.name}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (visibleCalendars.length === 0 && !canCreateCalendar) {
    return <p className="empty-note">Du har ingen kalender att visa.</p>;
  }

  return (
    <div className="dashboard-list">
      <section className="shopping-create-card" aria-label="Skapa kalender">
        <div>
          <p className="eyebrow">Ny kalender</p>
          <h3>Skapa privat kalender</h3>
        </div>
        <div className="shopping-add-row cal-create-row">
          <input
            className="cal-color-input"
            disabled={!canCreateCalendar}
            onChange={(e) => setNewCalendarColor(e.target.value)}
            title="Välj kalenderfärg"
            type="color"
            value={newCalendarColor}
          />
          <input
            className="text-input"
            disabled={!canCreateCalendar}
            onChange={(event) => setCalendarName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                createCalendar();
              }
            }}
            placeholder="Till exempel Min kalender"
            value={calendarName}
          />
          <button
            className="icon-button"
            disabled={!canCreateCalendar}
            onClick={createCalendar}
            type="button"
          >
            <Plus size={16} />
          </button>
        </div>
      </section>

      {selectedCalendar ? (
        <section className="calendar-tool-card" aria-label="Kalenderverktyg">
          <label>
            Kalender
            <select
              className="text-input"
              onChange={(event) => setSelectedCalendarId(event.target.value)}
              value={selectedCalendar.id}
            >
              {visibleCalendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}
                </option>
              ))}
            </select>
          </label>

          {canEditSelectedCalendar && isRenaming && (
            <div className="cal-rename-row">
              <input
                autoFocus
                className="text-input"
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const name = renameValue.trim();
                    if (name && name !== selectedCalendar.name) {
                      onRenameCalendar(selectedCalendar.id, name);
                    }
                    setIsRenaming(false);
                  }
                  if (e.key === "Escape") {
                    setRenameValue(selectedCalendar.name);
                    setIsRenaming(false);
                  }
                }}
                placeholder="Kalendernamn"
                value={renameValue}
              />
              <button
                className="icon-button"
                disabled={!renameValue.trim()}
                onClick={() => {
                  const name = renameValue.trim();
                  if (name && name !== selectedCalendar.name) {
                    onRenameCalendar(selectedCalendar.id, name);
                  }
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
            <>

              <label className="cal-owner-label">
                Tilldelad till
                <div className="cal-owner-row">
                  <select
                    className="text-input"
                    onChange={(e) => setTransferOwnerId(e.target.value)}
                    value={transferOwnerId}
                  >
                    {members
                      .filter((m) => m.deletedAt === null)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                  {transferOwnerId !== selectedCalendar.ownerId && (
                    <button
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
            </>
          )}

          {canEditSelectedCalendar && (
            <div className="cal-settings-row">
              <label className="cal-color-label">
                <span>Färg</span>
                <input
                  className="cal-color-input"
                  onChange={(e) => onUpdateCalendarColor(selectedCalendar.id, e.target.value)}
                  title="Kalenderfärg"
                  type="color"
                  value={selectedCalendar.color}
                />
              </label>
              <button
                className={`secondary-button cal-share-toggle ${
                  activeOtherMembers.length > 0 &&
                  activeOtherMembers.every((m) =>
                    selectedCalendar.sharedWith.some((s) => s.memberId === m.id)
                  )
                    ? "cal-share-toggle--shared"
                    : ""
                }`}
                onClick={toggleFamilyShared}
                title={
                  activeOtherMembers.length > 0 &&
                  activeOtherMembers.every((m) =>
                    selectedCalendar.sharedWith.some((s) => s.memberId === m.id)
                  )
                    ? "Gör kalendern privat"
                    : "Dela med hela familjen"
                }
                type="button"
              >
                {activeOtherMembers.length > 0 &&
                activeOtherMembers.every((m) =>
                  selectedCalendar.sharedWith.some((s) => s.memberId === m.id)
                )
                  ? "Delas med familjen"
                  : "Dela med familjen"}
              </button>
            </div>
          )}

          <div className="calendar-actions">
            <button
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
              className={`icon-button${isRenaming ? " icon-button--active" : ""}`}
              disabled={!canEditSelectedCalendar}
              onClick={() => {
                setRenameValue(selectedCalendar.name);
                setIsRenaming((v) => !v);
              }}
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
                onChange={(event) => {
                  void importCalendar(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
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
            <div className="ics-import-block">
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
            <div className="ics-import-block">
              <p className="eyebrow">Prenumerationer</p>

              {/* New subscription form */}
              <div className="ics-sub-form">
                <input
                  className="text-input"
                  onChange={(e) => setNewSubUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void addSubscription(); }}
                  placeholder="iCal-länk (https://…)"
                  value={newSubUrl}
                />
                <WordTagInput
                  label="Inkludera händelser med ord"
                  placeholder="Skriv ord + Enter"
                  words={newSubIncludeWords}
                  onChangeWords={setNewSubIncludeWords}
                />
                <WordTagInput
                  label="Exkludera händelser med ord"
                  placeholder="Skriv ord + Enter"
                  words={newSubExcludeWords}
                  onChangeWords={setNewSubExcludeWords}
                />
                <button
                  className="secondary-button"
                  disabled={!newSubUrl.trim() || addingSub}
                  onClick={() => void addSubscription()}
                  type="button"
                >
                  <Globe size={16} />
                  {addingSub ? "Lägger till…" : "Lägg till prenumeration"}
                </button>
              </div>

              {/* Existing subscriptions */}
              {(selectedCalendar.subscriptions ?? []).length > 0 && (
                <div className="ics-sub-list">
                  {(selectedCalendar.subscriptions ?? []).map((sub) => (
                    <div className="ics-sub-row" key={sub.id}>
                      {editingSubId === sub.id ? (
                        <div className="ics-sub-edit">
                          <WordTagInput
                            label="Inkludera händelser med ord"
                            placeholder="Skriv ord + Enter"
                            words={editIncludeWords}
                            onChangeWords={setEditIncludeWords}
                          />
                          <WordTagInput
                            label="Exkludera händelser med ord"
                            placeholder="Skriv ord + Enter"
                            words={editExcludeWords}
                            onChangeWords={setEditExcludeWords}
                          />
                          <div className="ics-sub-edit-actions">
                            <button
                              className="secondary-button"
                              onClick={() => void saveSubEdit(sub as IcsSubscription)}
                              type="button"
                            >
                              <RefreshCw size={13} />
                              Spara &amp; synka
                            </button>
                            <button
                              className="icon-button"
                              onClick={() => setEditingSubId(null)}
                              type="button"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="ics-sub-info">
                            <span className="ics-sub-url" title={sub.url}>
                              {sub.url.replace(/^https?:\/\//, "").slice(0, 48)}…
                            </span>
                            {sub.includeWords.length > 0 && (
                              <small>Inkludera: {sub.includeWords.join(", ")}</small>
                            )}
                            {sub.excludeWords.length > 0 && (
                              <small>Exkludera: {sub.excludeWords.join(", ")}</small>
                            )}
                            {sub.lastSyncedAt && (
                              <small>Senast synkad: {new Date(sub.lastSyncedAt).toLocaleString("sv-SE")}</small>
                            )}
                          </div>
                          <div className="ics-sub-actions">
                            <button
                              className="icon-button"
                              onClick={() => {
                                setEditingSubId(sub.id);
                                setEditIncludeWords([...sub.includeWords]);
                                setEditExcludeWords([...sub.excludeWords]);
                              }}
                              title="Redigera ord"
                              type="button"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              className="icon-button"
                              disabled={syncingSubId === sub.id}
                              onClick={() => void syncSub(sub.id)}
                              title="Synka nu"
                              type="button"
                            >
                              <RefreshCw size={14} className={syncingSubId === sub.id ? "spin" : undefined} />
                            </button>
                            {confirmDeleteSubId === sub.id ? (
                              <>
                                <button
                                  className="secondary-button ics-confirm-del"
                                  onClick={() => {
                                    onRemoveSubscription(selectedCalendar.id, sub.id);
                                    setConfirmDeleteSubId(null);
                                  }}
                                  type="button"
                                >
                                  Radera
                                </button>
                                <button
                                  className="icon-button"
                                  onClick={() => setConfirmDeleteSubId(null)}
                                  type="button"
                                >
                                  <X size={14} />
                                </button>
                              </>
                            ) : (
                              <button
                                className="icon-button danger"
                                onClick={() => setConfirmDeleteSubId(sub.id)}
                                title="Ta bort prenumeration"
                                type="button"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      ) : null}

      {selectedCalendar ? (
        <section className="calendar-tool-card" aria-label="Dela kalender">
          <div>
            <p className="eyebrow">Delning</p>
            <h3>Dela {selectedCalendar.name}</h3>
          </div>

          <div className="calendar-event-form">
            <select
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(event) => setShareMemberId(event.target.value)}
              value={shareMemberId}
            >
              <option value="">Välj medlem</option>
              {members
                .filter((member) => member.id !== currentMember.id)
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
            </select>
            <select
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(event) => setShareAccess(event.target.value as AccessLevel)}
              value={shareAccess}
            >
              <option value="view">Bara se</option>
              <option value="edit">Redigera</option>
            </select>
            <button
              className="secondary-button"
              disabled={!canEditSelectedCalendar || !shareMemberId}
              onClick={shareCalendar}
              type="button"
            >
              <Share2 size={16} />
              Dela
            </button>
          </div>

          {selectedCalendar.sharedWith.length > 0 ? (
            <div className="share-list">
              {selectedCalendar.sharedWith.map((share) => (
                <div className="share-row" key={share.memberId}>
                  <span>
                    {getMemberName(share.memberId, members)}
                    <small>{share.access === "edit" ? "Kan redigera" : "Kan se"}</small>
                  </span>
                  <button
                    className="icon-button danger"
                    disabled={!canEditSelectedCalendar}
                    onClick={() =>
                      onRemoveCalendarShare(selectedCalendar.id, share.memberId)
                    }
                    type="button"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-note">Kalendern är privat.</p>
          )}
        </section>
      ) : null}

      {!managementOnly && selectedCalendar ? (
        <section className="calendar-tool-card" aria-label="Lägg till kalenderhändelse">
          <div className="calendar-event-form">
            <input
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(event) => setEventTitle(event.target.value)}
              placeholder="Händelse"
              value={eventTitle}
            />
            <input
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(event) => setStartsAt(event.target.value)}
              type="datetime-local"
              value={startsAt}
            />
            <input
              className="text-input"
              disabled={!canEditSelectedCalendar}
              onChange={(event) => setEndsAt(event.target.value)}
              type="datetime-local"
              value={endsAt}
            />
            <button
              className="icon-button"
              disabled={!canEditSelectedCalendar}
              onClick={addEvent}
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>
        </section>
      ) : null}

      {!managementOnly && visibleCalendars.flatMap((calendar) =>
        calendar.events
          .filter((event) => event.deletedAt === null)
          .map((event) => (
            <div className="dashboard-row" key={event.id}>
              <CalendarDays size={18} />
              <span>
                {event.title}
                <small>{calendar.name}</small>
              </span>
              <strong>{formatTimeRange(event.startsAt, event.endsAt)}</strong>
            </div>
          ))
      )}
    </div>
  );
}

type PreviewSelectorProps = {
  events: ImportedCalendarEvent[];
  selectedIds: Set<string>;
  onChangeSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  onConfirm: () => void;
};

const SW = new Set([
  "och","för","av","i","på","med","är","att","en","ett","de","det","den",
  "till","från","men","om","så","vid","som","har","vi","du","ni","han",
  "hon","kan","ska","var","dag","dagar","kl","år","vecka"
]);

function buildKeywordGroups(events: ImportedCalendarEvent[]): Map<string, number[]> {
  const freq = new Map<string, number[]>();
  for (const [i, ev] of events.entries()) {
    const words = ev.title.toLowerCase().match(/[a-zåäö]{3,}/g) ?? [];
    for (const word of new Set(words)) {
      if (SW.has(word)) continue;
      const bucket = freq.get(word) ?? [];
      if (bucket.length === 0) freq.set(word, bucket);
      bucket.push(i);
    }
  }
  return new Map(
    [...freq.entries()]
      .filter(([, idx]) => idx.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 20)
      .map(([word, idx]) => [word.charAt(0).toUpperCase() + word.slice(1), idx])
  );
}

function buildCategoryGroups(events: ImportedCalendarEvent[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const [i, ev] of events.entries()) {
    for (const cat of ev.categories) {
      const bucket = groups.get(cat) ?? [];
      if (bucket.length === 0) groups.set(cat, bucket);
      bucket.push(i);
    }
  }
  return groups;
}

function PreviewSelector({ events, selectedIds, onChangeSelected, onConfirm }: PreviewSelectorProps) {
  if (events.length === 0) {
    return <p className="empty-note">Inga händelser i valt datumintervall.</p>;
  }

  const groups = buildCategoryGroups(events);
  const keywords = buildKeywordGroups(events);

  function toggleGroup(indices: number[]) {
    const allSelected = indices.every((i) => selectedIds.has(String(i)));
    onChangeSelected((prev) => {
      const next = new Set(prev);
      for (const i of indices) {
        if (allSelected) next.delete(String(i)); else next.add(String(i));
      }
      return next;
    });
  }

  function toggleAll() {
    const allSelected = selectedIds.size === events.length;
    onChangeSelected(allSelected ? new Set() : new Set(events.map((_, i) => String(i))));
  }

  function renderChip(label: string, indices: number[], modifier?: string) {
    const selectedCount = indices.filter((i) => selectedIds.has(String(i))).length;
    const allOn = selectedCount === indices.length;
    const someOn = selectedCount > 0 && !allOn;
    const cls = ["ics-cat-btn", allOn && "ics-cat-btn--on", someOn && "ics-cat-btn--partial", modifier]
      .filter(Boolean).join(" ");
    return (
      <button key={label} className={cls} onClick={() => toggleGroup(indices)} type="button">
        <span className="ics-cat-name">{label}</span>
        <span className="ics-cat-count">{selectedCount}/{indices.length}</span>
      </button>
    );
  }

  return (
    <div className="ics-preview">
      <div className="ics-preview-header">
        <span className="ics-preview-count">{selectedIds.size} av {events.length} händelser valda</span>
        <button className="ics-bulk-btn" onClick={toggleAll} type="button">
          {selectedIds.size === events.length ? "Ingen" : "Alla"}
        </button>
      </div>

      <div className="ics-cat-grid">
        {[...groups.entries()].map(([cat, idx]) =>
          renderChip(cat, idx, cat === "Stängningsdag" ? "ics-cat-btn--special" : undefined)
        )}
      </div>

      {keywords.size > 0 && (
        <>
          <p className="ics-keyword-label">Nyckelord</p>
          <div className="ics-keyword-row">
            {[...keywords.entries()].map(([word, idx]) => renderChip(word, idx))}
          </div>
        </>
      )}

      <button
        className="primary-button"
        disabled={selectedIds.size === 0}
        onClick={onConfirm}
        type="button"
      >
        Importera {selectedIds.size} händelser
      </button>
    </div>
  );
}

function canEditCalendar(member: Member, roles: Role[], calendar: Calendar, members: Member[]) {
  if (!hasPermission(member, roles, "canEditCalendar")) return false;
  if (canEditSharedResource(member, calendar)) return true;
  // Non-child members can edit calendars owned by children or by unknown/deleted owners
  if (!member.isChild) {
    const owner = members.find((m) => m.id === calendar.ownerId);
    if (!owner || owner.isChild) return true;
  }
  return false;
}

function getMemberName(memberId: Id, members: Member[]) {
  return members.find((member) => member.id === memberId)?.name ?? "Okänd medlem";
}

function parseIcsEvents(text: string): ImportedCalendarEvent[] {
  // Unfold iCal lines: CRLF or LF + whitespace = continuation
  const unfolded = text.replace(/\r?\n[ \t]/g, "");

  return unfolded
    .split("BEGIN:VEVENT")
    .slice(1)
    .map((block) => block.split("END:VEVENT")[0] ?? "")
    .map((block) => {
      const title = getIcsValue(block, "SUMMARY") ?? "Importerad händelse";
      const dtstart = getIcsValue(block, "DTSTART");
      const dtend = getIcsValue(block, "DTEND") ?? getIcsValue(block, "DURATION");
      const startsAt = parseIcsDate(dtstart);
      const endsAt = parseIcsDate(dtend) ?? startsAt;

      if (!startsAt || !endsAt) return null;

      const isAllDay = /^\d{8}$/.test(dtstart ?? "");
      const color = SCHOOL_CLOSED_RE.test(title) ? SCHOOL_CLOSED_COLOR : null;

      const description = getIcsValue(block, "DESCRIPTION");
      const location = getIcsValue(block, "LOCATION");
      const notes = [description, location].filter(Boolean).join(" · ") || null;

      const rawCats = (getIcsValue(block, "CATEGORIES") ?? "")
        .split(",").map((s) => s.trim()).filter(Boolean);
      const categories = detectCategories(title, isAllDay, rawCats);

      return { title, startsAt, endsAt, isAllDay, color, notes, categories };
    })
    .filter((event): event is ImportedCalendarEvent => event !== null);
}

function getIcsValue(block: string, key: string) {
  const line = block
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}:`) || l.startsWith(`${key};`));
  if (!line) return null;
  // Strip any parameter part (e.g. DTSTART;TZID=Europe/Stockholm:...)
  return line.slice(line.indexOf(":") + 1).trim() || null;
}

function parseIcsDate(value: string | null): string | null {
  if (!value) return null;

  // 20240615T120000Z  — UTC datetime
  if (/^\d{8}T\d{6}Z$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}Z`;
  }
  // 20240615T120000   — local datetime (no Z)
  if (/^\d{8}T\d{6}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`;
  }
  // 20240615          — all-day date (Tempus format)
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00.000Z`;
  }

  return null;
}

function toIcs(calendar: Calendar) {
  const events = calendar.events
    .filter((event) => event.deletedAt === null)
    .map((event) => {
      return [
        "BEGIN:VEVENT",
        `UID:${event.id}`,
        `SUMMARY:${escapeIcs(event.title)}`,
        `DTSTART:${formatIcsDate(event.startsAt)}`,
        `DTEND:${formatIcsDate(event.endsAt)}`,
        event.notes ? `DESCRIPTION:${escapeIcs(event.notes)}` : null,
        "END:VEVENT"
      ]
        .filter(Boolean)
        .join("\r\n");
    })
    .join("\r\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Family Team App//SV",
    `X-WR-CALNAME:${escapeIcs(calendar.name)}`,
    events,
    "END:VCALENDAR"
  ].join("\r\n");
}

function formatIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function filterByDateRange(
  events: ImportedCalendarEvent[],
  from: string,
  to: string
): ImportedCalendarEvent[] {
  if (!from && !to) return events;
  return events.filter((ev) => {
    const date = ev.startsAt.slice(0, 10);
    return (!from || date >= from) && (!to || date <= to);
  });
}

function formatTimeRange(startsAt: string, endsAt: string) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

  return `${formatter.format(new Date(startsAt))}–${formatter.format(new Date(endsAt))}`;
}

function WordTagInput({
  words,
  onChangeWords,
  placeholder,
  label
}: {
  words: string[];
  onChangeWords: (words: string[]) => void;
  placeholder?: string;
  label?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const word = draft.trim().replace(/,+$/, "");
    const isNew = word.length > 0 && !words.includes(word);
    if (isNew) onChangeWords([...words, word]);
    setDraft("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const isCommit = e.key === "Enter" || e.key === ",";
    const isBackspaceOnEmpty = e.key === "Backspace" && !draft && words.length > 0;
    if (isCommit) { e.preventDefault(); commit(); }
    else if (isBackspaceOnEmpty) { onChangeWords(words.slice(0, -1)); }
  }

  return (
    <div className="word-tag-field-wrap">
      {label && <span className="word-tag-label">{label}</span>}
      <div className="word-tag-input">
        {words.map((w) => (
          <span key={w} className="word-tag">
            {w}
            <button
              className="word-tag-remove"
              onClick={() => onChangeWords(words.filter((x) => x !== w))}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="word-tag-draft"
          onBlur={commit}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={words.length === 0 ? placeholder : ""}
          value={draft}
        />
      </div>
    </div>
  );
}

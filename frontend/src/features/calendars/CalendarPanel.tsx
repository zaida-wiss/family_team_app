import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { hasPermission } from "../../utils/permissions";
import type { AddEventInput } from "./useCalendarsState";
import type { AccessLevel, Calendar, Id, IcsSubscription, Member, Role } from "@shared/types";
import type { ImportedCalendarEvent } from "./calendarIcs";
import { canEditCalendar, formatTimeRange } from "./calendarPanelHelpers";
import { WordTagInput } from "./WordTagInput";
import { CalendarShareSection } from "./CalendarShareSection";
import { CalendarCreateCard } from "./CalendarCreateCard";
import { CalendarManagementCard } from "./CalendarManagementCard";
import { CalendarEventForm } from "./CalendarEventForm";

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

  const canEditSelectedCalendar = selectedCalendar !== null && canEditCalendar(currentMember, roles, selectedCalendar, members);

  if (visibleCalendars.length === 0 && !canCreateCalendar) {
    return <p className="empty-note">Du har ingen kalender att visa.</p>;
  }

  return (
    <div className="dashboard-list">
      <CalendarCreateCard
        canCreate={canCreateCalendar}
        defaultColor={currentMember.color ?? "#2f7d6d"}
        onCreateCalendar={onCreateCalendar}
      />

      {selectedCalendar && (
        <CalendarManagementCard
          calendars={calendars}
          visibleCalendars={visibleCalendars}
          members={members}
          currentMember={currentMember}
          roles={roles}
          selectedCalendar={selectedCalendar}
          onSelectCalendar={setSelectedCalendarId}
          canEdit={canEditSelectedCalendar}
          canImport={canImport}
          onUpdateCalendarColor={onUpdateCalendarColor}
          onRenameCalendar={onRenameCalendar}
          onTransferCalendar={onTransferCalendar}
          onDeleteCalendar={onDeleteCalendar}
          onImportCalendar={onImportCalendar}
          onShareCalendar={onShareCalendar}
          onRemoveCalendarShare={onRemoveCalendarShare}
          onAddSubscription={onAddSubscription}
          onUpdateSubscription={onUpdateSubscription}
          onRemoveSubscription={onRemoveSubscription}
          onSyncSubscription={onSyncSubscription}
          onUpdateCalendarKeepAllHistory={onUpdateCalendarKeepAllHistory}
        />
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
        <CalendarEventForm
          canEdit={canEditSelectedCalendar}
          onAddEvent={(event) => onAddEvent(selectedCalendar.id, event)}
        />
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

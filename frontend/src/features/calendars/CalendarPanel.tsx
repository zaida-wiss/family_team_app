import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { hasPermission } from "../../utils/permissions";
import type { AddEventInput } from "./useCalendarsState";
import type { AccessLevel, Calendar, Id, IcsSubscription, Member, Role } from "@shared/types";
import type { AppleCalDavAccountSummary } from "../../api/calendars";
import type { ImportedCalendarEvent } from "./calendarIcs";
import { canEditCalendar, formatTimeRange } from "./calendarPanelHelpers";
import { WordTagInput } from "./WordTagInput";
import { CalendarShareSection } from "./CalendarShareSection";
import { MyDashboardCalendarsSection } from "./MyDashboardCalendarsSection";
import { CalendarCreateCard } from "./CalendarCreateCard";
import { CalendarManagementCard } from "./CalendarManagementCard";
import { AppleCalDavAccountsSection } from "./AppleCalDavAccountsSection";
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
  onSetDashboardVisibility: (calendarId: Id, memberId: Id) => void;
  onRemoveDashboardVisibility: (calendarId: Id, memberId: Id) => void;
  onAddSubscription: (calendarId: Id, sub: Omit<IcsSubscription, "id" | "calendarId" | "lastSyncedAt">) => void;
  onUpdateSubscription: (calendarId: Id, subId: Id, patch: Partial<Pick<IcsSubscription, "includeWords" | "excludeWords" | "displaySymbol">>) => Promise<void>;
  onRemoveSubscription: (calendarId: Id, subId: Id) => void;
  onSyncSubscription: (calendarId: Id, subId: Id) => Promise<void>;
  onUpdateCalendarKeepAllHistory?: (calendarId: Id, keepAllHistory: boolean) => void;
  onUpdateCalendarShareAcrossMyAccounts: (calendarId: Id, shareAcrossMyAccounts: boolean) => void;
  appleAccounts: AppleCalDavAccountSummary[];
  onRefreshAppleAccounts: () => Promise<AppleCalDavAccountSummary[]>;
  onAddAppleAccount: (accountEmail: string, appSpecificPassword: string) => Promise<AppleCalDavAccountSummary>;
  onRemoveAppleAccount: (appleAccountId: Id) => Promise<void>;
  onListCalendarsForAppleAccount: (appleAccountId: Id) => Promise<{ url: string; name: string }[]>;
  onConnectAppleCalDav: (calendarId: Id, appleAccountId: Id, calendarUrl: string) => Promise<void>;
  onDisconnectCalDav: (calendarId: Id, connectionId: Id) => Promise<void>;
  onUpdateCalDavInterval: (calendarId: Id, connectionId: Id, syncIntervalMinutes: number) => Promise<void>;
  onSyncCalDavNow: (calendarId: Id, connectionId: Id) => Promise<void>;
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
  onSetDashboardVisibility,
  onRemoveDashboardVisibility,
  onAddSubscription,
  onUpdateSubscription,
  onRemoveSubscription,
  onSyncSubscription,
  onUpdateCalendarKeepAllHistory,
  onUpdateCalendarShareAcrossMyAccounts,
  appleAccounts,
  onRefreshAppleAccounts,
  onAddAppleAccount,
  onRemoveAppleAccount,
  onListCalendarsForAppleAccount,
  onConnectAppleCalDav,
  onDisconnectCalDav,
  onUpdateCalDavInterval,
  onSyncCalDavNow,
}: CalendarPanelProps) {
  const canCreateCalendar = hasPermission(currentMember, roles, "canCreateCalendar");
  const canImport = hasPermission(currentMember, roles, "canImportCalendar");

  const visibleCalendars = calendars.filter((cal) => {
    // Cross-account/Familjeanslutning-kalendrar (readOnly, 2026-07-30) hör
    // inte hemma i den här hanteringslistan — de går inte att byta namn på,
    // dela, koppla CalDAV mot eller radera härifrån, bara att SE i själva
    // Kalender-panelen (CalendarView.tsx).
    if (cal.readOnly) return false;
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

      <AppleCalDavAccountsSection
        canManage={canCreateCalendar}
        appleAccounts={appleAccounts}
        onRefreshAppleAccounts={onRefreshAppleAccounts}
        onAddAppleAccount={onAddAppleAccount}
        onRemoveAppleAccount={onRemoveAppleAccount}
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
          onUpdateCalendarShareAcrossMyAccounts={onUpdateCalendarShareAcrossMyAccounts}
          appleAccounts={appleAccounts}
          onListCalendarsForAppleAccount={onListCalendarsForAppleAccount}
          onConnectAppleCalDav={onConnectAppleCalDav}
          onDisconnectCalDav={onDisconnectCalDav}
          onUpdateCalDavInterval={onUpdateCalDavInterval}
          onSyncCalDavNow={onSyncCalDavNow}
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

      <MyDashboardCalendarsSection
        calendars={calendars}
        members={members}
        currentMember={currentMember}
        onSetDashboardVisibility={onSetDashboardVisibility}
        onRemoveDashboardVisibility={onRemoveDashboardVisibility}
      />

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

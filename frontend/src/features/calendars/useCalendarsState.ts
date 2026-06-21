import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { calendars as initialCalendars } from "../../data/sampleData";
import type { AccessLevel, Calendar, Id } from "@shared/types";

type AddEventInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  notes?: string | null;
};

type ImportEventInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
};

export function useCalendarsState() {
  const [calendars, setCalendars] = useLocalStorageState<Calendar[]>(
    "family-team-app:calendars",
    initialCalendars
  );

  function createCalendar(name: string, memberId: Id) {
    setCalendars((current) => [
      ...current,
      {
        id: `calendar-${crypto.randomUUID()}`,
        name,
        ownerId: memberId,
        color: "#2f7d6d",
        sharedWith: [],
        importedSources: [],
        deletedAt: null,
        deletedBy: null,
        events: []
      }
    ]);
  }

  function addCalendarEvent(calendarId: Id, event: AddEventInput, memberId: Id) {
    setCalendars((current) =>
      current.map((calendar) => {
        if (calendar.id !== calendarId) {
          return calendar;
        }

        return {
          ...calendar,
          events: [
            ...calendar.events,
            {
              id: `event-${crypto.randomUUID()}`,
              calendarId,
              title: event.title,
              startsAt: event.startsAt,
              endsAt: event.endsAt,
              notes: event.notes ?? null,
              createdBy: memberId,
              deletedAt: null,
              deletedBy: null
            }
          ]
        };
      })
    );
  }

  function importCalendarEvents(
    calendarId: Id,
    sourceName: string,
    events: ImportEventInput[],
    memberId: Id
  ) {
    setCalendars((current) =>
      current.map((calendar) => {
        if (calendar.id !== calendarId) {
          return calendar;
        }

        return {
          ...calendar,
          importedSources: [
            ...calendar.importedSources,
            {
              id: `import-${crypto.randomUUID()}`,
              type: "ics-file" as const,
              name: sourceName,
              importedAt: new Date().toISOString()
            }
          ],
          events: [
            ...calendar.events,
            ...events.map((event) => ({
              id: `event-${crypto.randomUUID()}`,
              calendarId,
              title: event.title,
              startsAt: event.startsAt,
              endsAt: event.endsAt,
              notes: event.notes,
              createdBy: memberId,
              deletedAt: null,
              deletedBy: null
            }))
          ]
        };
      })
    );
  }

  function shareCalendar(calendarId: Id, memberId: Id, access: AccessLevel) {
    setCalendars((current) =>
      current.map((calendar) => {
        if (calendar.id !== calendarId) {
          return calendar;
        }

        const existingShare = calendar.sharedWith.find(
          (share) => share.memberId === memberId
        );

        return {
          ...calendar,
          sharedWith: existingShare
            ? calendar.sharedWith.map((share) =>
                share.memberId === memberId ? { ...share, access } : share
              )
            : [...calendar.sharedWith, { memberId, access }]
        };
      })
    );
  }

  function removeCalendarShare(calendarId: Id, memberId: Id) {
    setCalendars((current) =>
      current.map((calendar) => {
        if (calendar.id !== calendarId) {
          return calendar;
        }

        return {
          ...calendar,
          sharedWith: calendar.sharedWith.filter((share) => share.memberId !== memberId)
        };
      })
    );
  }

  function restoreCalendar(calendarId: Id) {
    setCalendars((current) =>
      current.map((calendar) => {
        if (calendar.id !== calendarId) {
          return calendar;
        }

        return {
          ...calendar,
          deletedAt: null,
          deletedBy: null,
          events: calendar.events.map((event) => {
            if (event.deletedBy !== calendar.deletedBy) {
              return event;
            }

            return { ...event, deletedAt: null, deletedBy: null };
          })
        };
      })
    );
  }

  function softDeleteCalendarsForMember(memberId: Id, deletedAt: string) {
    setCalendars((current) =>
      current.map((calendar) => {
        const ownsCalendar = calendar.ownerId === memberId;

        return {
          ...calendar,
          sharedWith: calendar.sharedWith.filter((share) => share.memberId !== memberId),
          deletedAt: ownsCalendar ? deletedAt : calendar.deletedAt,
          deletedBy: ownsCalendar ? memberId : calendar.deletedBy,
          events: calendar.events.map((event) => {
            if (event.createdBy !== memberId) {
              return event;
            }

            return { ...event, deletedAt, deletedBy: memberId };
          })
        };
      })
    );
  }

  return {
    calendars,
    createCalendar,
    addCalendarEvent,
    importCalendarEvents,
    shareCalendar,
    removeCalendarShare,
    restoreCalendar,
    softDeleteCalendarsForMember
  };
}

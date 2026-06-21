import { useEffect, useState } from "react";
import { calendarsApi } from "../../api";
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
  const [calendars, setCalendars] = useState<Calendar[]>([]);

  useEffect(() => {
    calendarsApi.getAll().then(setCalendars).catch(console.error);
  }, []);

  function createCalendar(name: string, memberId: Id) {
    const newCalendar: Calendar = {
      id: `calendar-${crypto.randomUUID()}`,
      name,
      ownerId: memberId,
      color: "#2f7d6d",
      sharedWith: [],
      importedSources: [],
      deletedAt: null,
      deletedBy: null,
      events: []
    };

    calendarsApi.create(newCalendar).catch(console.error);
    setCalendars((current) => [...current, newCalendar]);
  }

  function addCalendarEvent(calendarId: Id, event: AddEventInput, memberId: Id) {
    const newEvent: Calendar["events"][number] = {
      id: `event-${crypto.randomUUID()}`,
      calendarId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      notes: event.notes ?? null,
      createdBy: memberId,
      deletedAt: null,
      deletedBy: null
    };

    calendarsApi.addEvent(calendarId, newEvent).catch(console.error);
    setCalendars((current) =>
      current.map((calendar) => {
        if (calendar.id !== calendarId) {
          return calendar;
        }

        return { ...calendar, events: [...calendar.events, newEvent] };
      })
    );
  }

  function importCalendarEvents(
    calendarId: Id,
    sourceName: string,
    events: ImportEventInput[],
    memberId: Id
  ) {
    const source = {
      id: `import-${crypto.randomUUID()}`,
      type: "ics-file" as const,
      name: sourceName,
      importedAt: new Date().toISOString()
    };
    const newEvents = events.map((event) => ({
      id: `event-${crypto.randomUUID()}`,
      calendarId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      notes: event.notes,
      createdBy: memberId,
      deletedAt: null,
      deletedBy: null
    }));

    calendarsApi.importEvents(calendarId, source, newEvents).catch(console.error);

    setCalendars((current) =>
      current.map((calendar) => {
        if (calendar.id !== calendarId) {
          return calendar;
        }

        return {
          ...calendar,
          importedSources: [...calendar.importedSources, source],
          events: [...calendar.events, ...newEvents]
        };
      })
    );
  }

  function shareCalendar(calendarId: Id, memberId: Id, access: AccessLevel) {
    calendarsApi.share(calendarId, memberId, access).catch(console.error);
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
    calendarsApi.unshare(calendarId, memberId).catch(console.error);
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
    calendarsApi.restore(calendarId).catch(console.error);
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

        if (ownsCalendar) {
          calendarsApi.remove(calendar.id).catch(console.error);
        }

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

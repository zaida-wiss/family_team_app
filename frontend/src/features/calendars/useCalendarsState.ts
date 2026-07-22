import { useEffect, useRef, useState } from "react";
import { calendarsApi } from "../../api";
import { trackEvent } from "../../utils/analytics";
import { generateId } from "../../utils/uuid";
import { useCalendarSubscriptions } from "./useCalendarSubscriptions";
import { readCache, writeCache } from "../../utils/localCache";
import type { AccessLevel, Calendar, EventAttendee, EventRecurrence, Id } from "@shared/types";

const CALS_CACHE_KEY = "cals_v1";

export type AddEventInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  isAllDay?: boolean;
  location?: string | null;
  notes?: string | null;
  recurrence?: EventRecurrence;
  attendees?: EventAttendee[];
  symbol?: string | null;
};

type ImportEventInput = {
  title: string;
  startsAt: string;
  endsAt: string;
  isAllDay?: boolean;
  color?: string | null;
  notes: string | null;
};

function monthWindow(year: number, month: number) {
  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const until = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, until };
}

export function useCalendarsState() {
  // Stale-while-revalidate: visa cachad data direkt, hämta färsk i bakgrunden
  // (samma delade cache-hjälpare som övriga state-hookar sedan 2026-07-17,
  // tidigare en egen lokal implementation här — enda stället som hade
  // cachning innan dess). En enda skriv-effekt nedan (beroende på hela
  // `calendars`) täcker ALLA ändringar (ny hämtning, loadEventsForMonth,
  // samt varje create/update/delete-funktion i denna fil) istället för att
  // varje mutation manuellt behöver komma ihåg att skriva till cachen.
  const [calendars, setCalendars] = useState<Calendar[]>(() => readCache(CALS_CACHE_KEY, []));
  const loadedFrom = useRef<string>("");
  const loadedUntil = useRef<string>("");

  useEffect(() => {
    const now = new Date();
    const { from, until } = monthWindow(now.getFullYear(), now.getMonth());
    loadedFrom.current = from;
    loadedUntil.current = until;
    calendarsApi.getAll(from, until).then(setCalendars).catch(console.error);
  }, []);

  useEffect(() => {
    writeCache(CALS_CACHE_KEY, calendars);
  }, [calendars]);

  async function loadEventsForMonth(year: number, month: number) {
    const { from, until } = monthWindow(year, month);
    if (from >= loadedFrom.current && until <= loadedUntil.current) return;
    const expandFrom = from < loadedFrom.current ? from : loadedFrom.current;
    const expandUntil = until > loadedUntil.current ? until : loadedUntil.current;
    loadedFrom.current = expandFrom;
    loadedUntil.current = expandUntil;
    try {
      const updated = await calendarsApi.getAll(expandFrom, expandUntil);
      setCalendars(prev => prev.map(cal => {
        const fresh = updated.find(c => c.id === cal.id);
        if (!fresh) return cal;
        const existing = new Set(cal.events.map(e => e.id));
        const toAdd = fresh.events.filter(e => !existing.has(e.id));
        return toAdd.length ? { ...cal, events: [...cal.events, ...toAdd] } : cal;
      }));
    } catch { /* keep existing state */ }
  }

  function createCalendar(name: string, memberId: Id, color: string) {
    const newCalendar: Calendar = {
      id: `calendar-${generateId()}`,
      name,
      ownerId: memberId,
      color,
      sharedWith: [],
      importedSources: [],
      subscriptions: [],
      deletedAt: null,
      deletedBy: null,
      events: []
    };

    calendarsApi.create(newCalendar).catch(console.error);
    setCalendars((current) => [...current, newCalendar]);
  }

  function updateCalendarColor(calendarId: Id, color: string) {
    calendarsApi.update(calendarId, { color }).catch(console.error);
    setCalendars((current) =>
      current.map((cal) => (cal.id !== calendarId ? cal : { ...cal, color }))
    );
  }

  function renameCalendar(calendarId: Id, name: string) {
    calendarsApi.update(calendarId, { name }).catch(console.error);
    setCalendars((current) =>
      current.map((cal) => (cal.id !== calendarId ? cal : { ...cal, name }))
    );
  }

  function transferCalendar(calendarId: Id, ownerId: Id) {
    calendarsApi.update(calendarId, { ownerId }).catch(console.error);
    setCalendars((current) =>
      current.map((cal) => (cal.id !== calendarId ? cal : { ...cal, ownerId }))
    );
  }

  function updateCalendarKeepAllHistory(calendarId: Id, keepAllHistory: boolean) {
    calendarsApi.update(calendarId, { keepAllHistory }).catch(console.error);
    setCalendars((current) =>
      current.map((cal) => (cal.id !== calendarId ? cal : { ...cal, keepAllHistory }))
    );
  }

  function addCalendarEvent(calendarId: Id, event: AddEventInput, memberId: Id) {
    const newEvent: Calendar["events"][number] = {
      id: `event-${generateId()}`,
      calendarId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      isAllDay: event.isAllDay ?? false,
      color: null,
      uid: null,
      subscriptionId: null,
      location: event.location ?? null,
      notes: event.notes ?? null,
      recurrence: event.recurrence ?? { type: "none", interval: 1, until: null },
      attendees: event.attendees ?? [],
      symbol: event.symbol ?? null,
      createdBy: memberId,
      deletedAt: null,
      deletedBy: null
    };

    calendarsApi.addEvent(calendarId, newEvent).catch(console.error);
    trackEvent("calendar-event-added");
    setCalendars((current) =>
      current.map((calendar) =>
        calendar.id !== calendarId
          ? calendar
          : { ...calendar, events: [...calendar.events, newEvent] }
      )
    );
  }

  function updateCalendarEvent(
    calendarId: Id,
    eventId: Id,
    updates: Partial<Calendar["events"][number]>
  ) {
    calendarsApi.updateEvent(calendarId, eventId, updates).catch(console.error);

    // Kalenderbyte (2026-07-15, buggfix): ett avvikande updates.calendarId
    // betyder att händelsen ska flyttas till en annan kalender, inte bara
    // få ett nytt fältvärde — den ligger inbäddad i sin kalenders egen
    // events-array, så flytten görs genom att ta bort den ur den gamla
    // arrayen och lägga in den (med uppdaterade fält) i den nya.
    if (updates.calendarId && updates.calendarId !== calendarId) {
      const targetCalendarId = updates.calendarId;
      setCalendars((current) => {
        const source = current.find((c) => c.id === calendarId);
        const movedEvent = source?.events.find((ev) => ev.id === eventId);
        if (!movedEvent) return current;
        const merged = { ...movedEvent, ...updates };
        return current.map((calendar) => {
          if (calendar.id === calendarId) {
            return { ...calendar, events: calendar.events.filter((ev) => ev.id !== eventId) };
          }
          if (calendar.id === targetCalendarId) {
            return { ...calendar, events: [...calendar.events, merged] };
          }
          return calendar;
        });
      });
      return;
    }

    setCalendars((current) =>
      current.map((calendar) =>
        calendar.id !== calendarId
          ? calendar
          : {
              ...calendar,
              events: calendar.events.map((ev) =>
                ev.id !== eventId ? ev : { ...ev, ...updates }
              )
            }
      )
    );
  }

  function deleteCalendarEvent(calendarId: Id, eventId: Id, memberId: Id) {
    const deletedAt = new Date().toISOString();
    calendarsApi.deleteEvent(calendarId, eventId).catch(console.error);
    setCalendars((current) =>
      current.map((calendar) =>
        calendar.id !== calendarId
          ? calendar
          : {
              ...calendar,
              events: calendar.events.map((ev) =>
                ev.id !== eventId ? ev : { ...ev, deletedAt, deletedBy: memberId }
              )
            }
      )
    );
  }

  function rsvpCalendarEvent(
    calendarId: Id,
    eventId: Id,
    memberId: Id,
    status: "accepted" | "declined"
  ) {
    calendarsApi.rsvpEvent(calendarId, eventId, memberId, status).catch(console.error);
    setCalendars((current) =>
      current.map((calendar) =>
        calendar.id !== calendarId
          ? calendar
          : {
              ...calendar,
              events: calendar.events.map((ev) =>
                ev.id !== eventId
                  ? ev
                  : {
                      ...ev,
                      attendees: ev.attendees.map((a) =>
                        a.memberId !== memberId ? a : { ...a, status }
                      )
                    }
              )
            }
      )
    );
  }

  function importCalendarEvents(
    calendarId: Id,
    sourceName: string,
    events: ImportEventInput[],
    memberId: Id
  ) {
    const source = {
      id: `import-${generateId()}`,
      type: "ics-file" as const,
      name: sourceName,
      importedAt: new Date().toISOString()
    };
    const newEvents: Calendar["events"] = events.map((event) => ({
      id: `event-${generateId()}`,
      calendarId,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      isAllDay: event.isAllDay ?? false,
      color: event.color ?? null,
      uid: null,
      subscriptionId: null,
      location: null,
      notes: event.notes,
      recurrence: { type: "none" as const, interval: 1, until: null },
      attendees: [],
      symbol: null,
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

  function deleteCalendar(calendarId: Id, memberId: Id) {
    const deletedAt = new Date().toISOString();
    calendarsApi.remove(calendarId).catch(console.error);
    setCalendars((current) =>
      current.map((calendar) => {
        if (calendar.id !== calendarId) return calendar;
        return {
          ...calendar,
          deletedAt,
          deletedBy: memberId,
          events: calendar.events.map((ev) =>
            ev.deletedAt ? ev : { ...ev, deletedAt, deletedBy: memberId }
          )
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

  // ADR-0025 (2026-07-23) — permanent, oåterkallelig tömning av papperskorgen.
  async function purgeCalendarsTrash() {
    await calendarsApi.purgeTrash();
    setCalendars((current) => current.filter((calendar) => calendar.deletedAt === null));
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

  const { addSubscription, updateSubscription, removeSubscription, syncSubscription } =
    useCalendarSubscriptions(setCalendars);

  return {
    calendars,
    loadEventsForMonth,
    createCalendar,
    updateCalendarColor,
    renameCalendar,
    transferCalendar,
    updateCalendarKeepAllHistory,
    addCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    deleteCalendar,
    rsvpCalendarEvent,
    importCalendarEvents,
    shareCalendar,
    removeCalendarShare,
    restoreCalendar,
    purgeCalendarsTrash,
    softDeleteCalendarsForMember,
    addSubscription,
    updateSubscription,
    removeSubscription,
    syncSubscription
  };
}

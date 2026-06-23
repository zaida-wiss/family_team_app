import type { EventRecurrence } from "@shared/types";
import type { EnrichedEvent } from "./CalendarEventList";

export type CalendarFilter = {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  hiddenCalendarIds: Set<string>;
  setHiddenCalendarIds: (ids: Set<string>) => void;
};

export type FormState = {
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

export type ModalMode =
  | { kind: "new"; prefilledDate?: string }
  | { kind: "edit"; event: EnrichedEvent };

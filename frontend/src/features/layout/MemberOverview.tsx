import { CheckSquare, ShoppingCart } from "lucide-react";
import { CalendarView } from "../calendars/CalendarView";
import type { CalendarFilter } from "../calendars/CalendarView";
import { MemberAvatar } from "../../components/MemberAvatar";
import type { Calendar, CalendarEvent, CalendarSettings, Id, Member, Role, ShoppingList, Todo } from "@shared/types";
import styles from "./MemberOverview.module.css";

type Props = {
  currentMember: Member;
  accountName: string;
  roles: Role[];
  activeMembers: Member[];
  selectedMemberId: string;
  calendars: Calendar[];
  canSeeCalendar: boolean;
  calendarFilter?: CalendarFilter;
  onSelectMember: (memberId: string) => void;
  onOpenCalendar?: () => void;
  onAddEvent?: (calendarId: Id, event: Omit<CalendarEvent, "id" | "calendarId" | "createdBy" | "deletedAt" | "deletedBy">) => void;
  onUpdateEvent?: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => void;
  onDeleteEvent?: (calendarId: string, eventId: string) => void;
  calendarSettings?: CalendarSettings;
  onLoadEventsForMonth?: (year: number, month: number) => Promise<void>;
  fixedCalendarTimes?: boolean;
  // Hemvyns familjeöversikt (2026-07-30, Zaidas önskemål: "i hemmet skall du
  // kunna växla mellan olika familjer och där skall gemensamma
  // inköpslistor, todos, kalendrar, medlemmar visas") — kompakta, läsbara
  // sammanfattningar bredvid kalendern, samma "dashboard/section-header"-
  // kort-mönster som redan används av "Lägg till barn"-kortet nedanför.
  todos?: Todo[];
  canSeeTodos?: boolean;
  onOpenTodos?: () => void;
  shoppingLists?: ShoppingList[];
  canSeeShopping?: boolean;
  onOpenShopping?: () => void;
  canSeeMembers?: boolean;
};

export function MemberOverview({
  currentMember,
  accountName,
  roles,
  activeMembers,
  calendars,
  canSeeCalendar,
  calendarFilter,
  onSelectMember,
  onOpenCalendar,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  calendarSettings,
  onLoadEventsForMonth,
  fixedCalendarTimes,
  todos = [],
  canSeeTodos = false,
  onOpenTodos,
  shoppingLists = [],
  canSeeShopping = false,
  onOpenShopping,
  canSeeMembers = false,
}: Props) {
  // Mallar (recurringSourceId===null && recurrence.type!=="none") är frusna
  // definitioner, inte riktiga uppgifter att göra — samma exkludering som
  // ParentTodoThreadView.tsx redan använder på flera ställen.
  const pendingTodos = todos.filter(
    (t) => t.status === "pending" && t.deletedAt === null && (t.recurrence.type === "none" || t.recurringSourceId !== null)
  );
  const activeLists = shoppingLists.filter((l) => l.deletedAt === null);
  const activeFamilyMembers = activeMembers.filter((m) => m.deletedAt === null);

  return (
    <div className={styles.home}>
      {canSeeCalendar && (
        <div className={styles.calendarWrap}>
          <div className={styles.calendarToolbar}>
            <span className={styles.calendarLabel}>Familjens kalender</span>
          </div>
          <CalendarView
            displayOnly
            calendars={calendars}
            currentMember={currentMember}
            activeMembers={activeMembers}
            roles={roles}
            calendarSettings={calendarSettings}
            filter={calendarFilter}
            onAddEvent={onAddEvent}
            onUpdateEvent={onUpdateEvent}
            onDeleteEvent={onDeleteEvent}
            onMonthChange={onLoadEventsForMonth}
            fixedCalendarTimes={fixedCalendarTimes}
          />
        </div>
      )}

      {canSeeMembers && activeFamilyMembers.length > 0 && (
        <article className="dashboard">
          <header className="section-header">
            <div><p className="eyebrow">{accountName}</p><h2>Medlemmar</h2></div>
          </header>
          <div className={styles.memberRow}>
            {activeFamilyMembers.map((m) => (
              <button
                className={styles.memberButton}
                key={m.id}
                onClick={() => onSelectMember(m.id)}
                title={m.name}
                type="button"
              >
                <MemberAvatar member={m} size="small" />
                <span>{m.name}</span>
              </button>
            ))}
          </div>
        </article>
      )}

      {canSeeTodos && (
        <article className="dashboard">
          <header className="section-header">
            <div><p className="eyebrow">Uppgifter</p><h2>{pendingTodos.length} väntar</h2></div>
            {onOpenTodos && (
              <button className="secondary-button" onClick={onOpenTodos} type="button">Öppna</button>
            )}
          </header>
          {pendingTodos.length === 0 ? (
            <p className="empty-note">Inget väntar just nu.</p>
          ) : (
            <div className="dashboard-list">
              {pendingTodos.slice(0, 5).map((t) => (
                <div className="dashboard-row" key={t.id}>
                  <CheckSquare size={18} />
                  <span>{t.title}</span>
                </div>
              ))}
            </div>
          )}
        </article>
      )}

      {canSeeShopping && (
        <article className="dashboard">
          <header className="section-header">
            <div><p className="eyebrow">Inköp</p><h2>{activeLists.length} listor</h2></div>
            {onOpenShopping && (
              <button className="secondary-button" onClick={onOpenShopping} type="button">Öppna</button>
            )}
          </header>
          {activeLists.length === 0 ? (
            <p className="empty-note">Inga inköpslistor ännu.</p>
          ) : (
            <div className="dashboard-list">
              {activeLists.map((l) => {
                const remaining = l.items.filter((i) => !i.done && i.deletedAt === null).length;
                return (
                  <div className="dashboard-row" key={l.id}>
                    <ShoppingCart size={18} />
                    <span>{l.name}</span>
                    <strong>{remaining} kvar</strong>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      )}
    </div>
  );
}

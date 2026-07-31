import { useMemo, useState } from "react";
import { CheckSquare, ShoppingCart } from "lucide-react";
import { CalendarView } from "../calendars/CalendarView";
import type { CalendarFilter } from "../calendars/CalendarView";
import { MemberAvatar } from "../../components/MemberAvatar";
import type {
  Calendar, CalendarEvent, CalendarSettings, Id, Member, MembershipMemberSummary, Role, ShoppingList, Todo
} from "@shared/types";
import styles from "./MemberOverview.module.css";

// Hem-vyns familjefilter (2026-07-31, Zaidas önskemål: "om jag väljer en
// familj, då vill jag att endast den familjens kalenderhändelser, todos och
// medlemmar visas, men möjlighet att välja samtliga familjer så att allt
// visas i hemvyn") — en medlem från en annan familj (cross-account/
// Familjeanslutning) kommer bara som en MembershipMemberSummary, aldrig en
// fullständig Member, taggad med källfamiljens accountId.
type ExtraMember = MembershipMemberSummary & { accountId: Id };
type FamilyOption = { accountId: Id; accountName: string };

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
  // Familjefilter (2026-07-31) — familyOptions inkluderar redan mitt eget
  // konto (satt av MemberShellContent.tsx), så listan här är den KOMPLETTA
  // uppsättningen att välja mellan. extraMembers är andra familjers
  // medlemmar (cross-account + Familjeanslutningar), redan taggade med sin
  // egen accountId. calendars/todos har redan .accountId satt av backend
  // (både egna och delade), ingen extra taggning behövs för dem.
  familyOptions?: FamilyOption[];
  extraMembers?: ExtraMember[];
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
  familyOptions = [],
  extraMembers = [],
}: Props) {
  const [selectedFamilyId, setSelectedFamilyId] = useState<Id | "all">("all");
  const ownAccountId = currentMember.accountId;
  const familyNameById = useMemo(
    () => new Map(familyOptions.map((f) => [f.accountId, f.accountName])),
    [familyOptions]
  );
  const showFamilyFilter = familyOptions.length > 1;

  const filteredCalendars = useMemo(
    () => (selectedFamilyId === "all" ? calendars : calendars.filter((c) => c.accountId === selectedFamilyId)),
    [calendars, selectedFamilyId]
  );

  const filteredTodos = useMemo(
    () => (selectedFamilyId === "all" ? todos : todos.filter((t) => (t.accountId ?? ownAccountId) === selectedFamilyId)),
    [todos, selectedFamilyId, ownAccountId]
  );

  // Mallar (recurringSourceId===null && recurrence.type!=="none") är frusna
  // definitioner, inte riktiga uppgifter att göra — samma exkludering som
  // ParentTodoThreadView.tsx redan använder på flera ställen.
  const pendingTodos = filteredTodos.filter(
    (t) => t.status === "pending" && t.deletedAt === null && (t.recurrence.type === "none" || t.recurringSourceId !== null)
  );
  // Inköpslistor slås ännu inte samman mellan familjer i Hem-vyn (bara
  // kalender/todos/medlemmar, per Zaidas uttryckliga uppräkning) — listan är
  // alltid mitt EGET konto, opåverkad av familjefiltret.
  const activeLists = shoppingLists.filter((l) => l.deletedAt === null);
  const activeFamilyMembers = activeMembers.filter((m) => m.deletedAt === null);

  const filteredMembers = useMemo(() => {
    const own = activeFamilyMembers.map((m) => ({ ...m, accountId: ownAccountId, isOwn: true as const }));
    const extra = extraMembers.map((m) => ({ ...m, isOwn: false as const }));
    if (selectedFamilyId === "all") return [...own, ...extra];
    if (selectedFamilyId === ownAccountId) return own;
    return extra.filter((m) => m.accountId === selectedFamilyId);
  }, [activeFamilyMembers, extraMembers, ownAccountId, selectedFamilyId]);

  return (
    <div className={styles.home}>
      {showFamilyFilter && (
        <label className="field-label" style={{ maxWidth: 260, marginBottom: 4 }}>
          Visa familj
          <select
            className="text-input"
            onChange={(e) => setSelectedFamilyId(e.target.value as Id | "all")}
            value={selectedFamilyId}
          >
            <option value="all">Alla familjer</option>
            {familyOptions.map((f) => (
              <option key={f.accountId} value={f.accountId}>{f.accountName}</option>
            ))}
          </select>
        </label>
      )}

      {canSeeCalendar && (
        <div className={styles.calendarWrap}>
          <div className={styles.calendarToolbar}>
            <span className={styles.calendarLabel}>Familjens kalender</span>
          </div>
          <CalendarView
            displayOnly
            calendars={filteredCalendars}
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

      {canSeeMembers && filteredMembers.length > 0 && (
        <article className="dashboard">
          <header className="section-header">
            <div><p className="eyebrow">{accountName}</p><h2>Medlemmar</h2></div>
          </header>
          <div className={styles.memberRow}>
            {filteredMembers.map((m) =>
              m.isOwn ? (
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
              ) : (
                <div
                  className={`${styles.memberButton} ${styles["memberButton--static"]}`}
                  key={`${m.accountId}-${m.id}`}
                  title={m.name}
                >
                  <MemberAvatar member={m} size="small" />
                  <span>{m.name}</span>
                  {selectedFamilyId === "all" && (
                    <small>{familyNameById.get(m.accountId) ?? "Okänd familj"}</small>
                  )}
                </div>
              )
            )}
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
                  <span>
                    {t.title}
                    {selectedFamilyId === "all" && t.accountId && t.accountId !== ownAccountId && (
                      <small>{familyNameById.get(t.accountId) ?? "Okänd familj"}</small>
                    )}
                  </span>
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

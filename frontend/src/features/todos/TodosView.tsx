import { CheckCircle2, Pencil, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import type { Id, Member, Reward, Role, Todo, TodoCategory, TodoCategoryTemplate, TodoTemplate, TodoTemplateTask, TodoThreadRange, TodoViewMode } from "@shared/types";
import { TodoCreatorModal } from "./TodoCreatorModal";
import { TodoEditModal } from "./TodoEditModal";
import { ParentTodoThreadView } from "./ParentTodoThreadView";
import { TodoThreadToolbar } from "./TodoThreadToolbar";
import { FamilyTodoThreads } from "./FamilyTodoThreads";
import type { FamilyThreadSource } from "./FamilyTodoThreads";
import { getAssigneeName, getMyTodosViewTodos, isDueWithinRange, isTodoHistory } from "./selectors";
import { isRecurringTemplate } from "./recurringTodos";
import { hasPermission } from "../../utils/permissions";

type Props = {
  currentMember: Member;
  members: Member[];
  allMembers: Member[];
  roles: Role[];
  todos: Todo[];
  rewards: Reward[];
  canApproveTodos: boolean;
  canSeeTodos: boolean;
  fixedTodoTimes: boolean;
  wishStars: Record<Id, number>;
  // Visningsläget (lista/tråd) väljs i Inställningar (2026-07-05, Zaidas
  // beslut) — ingen egen växlare i panelen, bara kategori/+-knappen/todos syns.
  todoViewMode: TodoViewMode;
  todoThreadOrder: Id[];
  onReorderThreads: (order: Id[]) => void;
  todoBubbleOrder: Record<Id, Id[]>;
  onReorderBubbles: (threadId: Id, order: Id[]) => void;
  // Hur mycket som visas i tråd-vyn (2026-07-06, Zaidas önskemål) — väljs i
  // Inställningar, samma mönster som todoViewMode.
  todoThreadRange: TodoThreadRange;
  // Vågrätt avstånd mellan kategoritrådarna (2026-07-26, Zaidas önskemål) —
  // väljs i Inställningar, samma mönster som todoThreadRange.
  todoThreadGap?: number;
  // Bubblornas storlek (2026-07-27, Zaidas önskemål) — väljs i
  // Inställningar, samma mönster som todoThreadGap.
  todoBubbleSize?: number;
  // Barn-tråden i Todos-panelen (2026-07-31, Zaidas önskemål) — av som
  // standard, en toggle i Inställningar → Utseende.
  showChildTodosInOwnView?: boolean;
  // Todos-panelens EGNA "signade familjeuppgifter"-trådar (2026-08-01,
  // Zaidas rättelse: "andra familjers todo" hörde inte hemma i Todos-
  // panelen alls — bara det jag faktiskt SIGNAT UPP på från Hem-vyn, en
  // egen tråd per familj namngiven efter familjen (2026-08-05, Zaidas
  // bekräftelse: "bra som det är nu att kategorin heter familjenamnet, om
  // man är med i flera familjer blir det tydligt"). Redan hopkopplad med
  // rätt mutationer per familj, se MemberShellContent.tsx/FamilyTodoThreads.tsx.
  personalSignedUpThreadSources?: FamilyThreadSource[];
  onCreateTodo: (todo: Todo) => void;
  onToggleSubtask: (todoId: Id, subtaskId: Id) => void;
  onToggleTodoInProgress: (todoId: Id, targetMemberId: Id) => void;
  onUpdateTodo: (todoId: Id, patch: Partial<Todo>) => void;
  onRefreshRoutine: (routineId: Id) => void;
  onCompleteTodo: (todoId: Id) => void;
  personalCategories: TodoCategory[];
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onRenameCategory: (id: Id, name: string) => void;
  onRemoveCategory: (id: Id) => void;
  onSetCategoryHidden: (id: Id, hidden: boolean) => void;
  taskTemplates: TodoTemplate[];
  categoryTemplates: TodoCategoryTemplate[];
  onCreateTaskTemplate: (task: TodoTemplateTask) => Promise<TodoTemplate>;
  onCreateCategoryTemplate: (
    name: string,
    tasks: TodoTemplateTask[],
    sourceCategoryId?: Id | null
  ) => Promise<TodoCategoryTemplate>;
  onUpdateCategoryTemplate: (id: Id, name: string, tasks: TodoTemplateTask[]) => Promise<TodoCategoryTemplate>;
  onSoftDeleteTodo: (todoId: Id) => void;
  onApproveWish: (rewardId: Id) => void;
  onRejectWish: (rewardId: Id) => void;
  onSetWishStars: (rewardId: Id, stars: number) => void;
};

function getTodoSummary(todo: { status: string; starValue: number }) {
  if (todo.status === "expired") return "Utgången";
  if (todo.status === "done") return "Väntar";
  return `${todo.starValue} stjärnor`;
}

export function TodosView({
  currentMember,
  members,
  allMembers,
  roles,
  todos,
  rewards,
  canApproveTodos,
  canSeeTodos,
  fixedTodoTimes,
  wishStars,
  todoViewMode,
  todoThreadOrder,
  onReorderThreads,
  todoBubbleOrder,
  onReorderBubbles,
  todoThreadRange,
  todoThreadGap,
  todoBubbleSize,
  showChildTodosInOwnView = false,
  personalSignedUpThreadSources = [],
  onCreateTodo,
  onToggleSubtask,
  onToggleTodoInProgress,
  onUpdateTodo,
  onRefreshRoutine,
  onCompleteTodo,
  personalCategories,
  onCreateCategory,
  onRenameCategory,
  onRemoveCategory,
  onSetCategoryHidden,
  taskTemplates,
  categoryTemplates,
  onCreateTaskTemplate,
  onCreateCategoryTemplate,
  onUpdateCategoryTemplate,
  onSoftDeleteTodo,
  onApproveWish,
  onRejectWish,
  onSetWishStars
}: Props) {
  // Återkommande MALLAR ska aldrig visas som en egen rad/boll — bara deras
  // dagliga occurrence gör det (samma exkludering som barnens egen dashboard,
  // se ChildShellContent.tsx). Utan detta syntes mallen som en till synes
  // duplicerad todo bredvid sin egen occurrence (Zaida, 2026-07-06).
  const visibleTodos = canSeeTodos
    ? getMyTodosViewTodos(currentMember, roles, allMembers, todos, showChildTodosInOwnView).filter(
        (t) => !isTodoHistory(t) && !isRecurringTemplate(t)
      )
    : [];
  // Tidsspannet (idag/vecka/månad/allt, Inställningar → Utseende) gäller nu
  // även listläget (2026-07-27, Zaidas önskemål) — tidigare visade listläget
  // ALLTID allt oavsett Syns från/Försvinner, medvetet, för att kunna hitta
  // en felaktigt daterad engångsuppgift. Det går fortfarande: väljer man
  // "Allt i framtiden" är beteendet identiskt med det gamla. Bara "pending"-
  // uppgifter filtreras mot spannet — en redan avklarad men ej godkänd
  // uppgift ("done") ska alltid synas oavsett datum, samma princip som i
  // tråd-vyn (som aldrig ens tar med "done" i sin egen spann-filtrerade
  // bollista, den har redan "löst upp" ur den vanliga vyn).
  const today = new Date();
  const rangeFilteredTodos =
    todoViewMode === "list"
      ? visibleTodos.filter((t) => t.status !== "pending" || isDueWithinRange(t, today, todoThreadRange))
      : visibleTodos;
  const canCreate = hasPermission(currentMember, roles, "canCreateTodos");
  const suggestedRewards = canApproveTodos
    ? rewards.filter((r) => r.status === "suggested" && r.deletedAt === null)
    : [];

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  // Sätts när "Lägg till uppgift" väljs från en kategoris meny (2026-07-05) —
  // förvalt i skapa-modalen, fortsatt ändringsbart där.
  const [createDefaultCategoryId, setCreateDefaultCategoryId] = useState<Id | null>(null);
  // Listläget öppnar nu samma fullständiga redigera-modal som tråd-vyn
  // (2026-07-06, Zaidas fråga om var man rättar ett fel datum) — ersätter den
  // gamla inline-titel-redigeringen, som inte kunde ändra Syns från/Försvinner
  // och därför var en återvändsgränd om en engångsuppgift råkat få fel datum
  // och därmed blivit osynlig i tråd-vyn (den enda andra platsen redigera-
  // modalen nåddes ifrån).
  const [editTodoId, setEditTodoId] = useState<Id | null>(null);
  const editTodo = todos.find((t) => t.id === editTodoId) ?? null;

  // Massradering i listläget (2026-08-04, Zaidas önskemål: "gör det möjligt
  // att massradera genom att kryssa i rader på todos som skall tas bort") —
  // samma tvåstegsbekräftade "Ta bort"→"Bekräfta radering"-mönster som
  // redan finns i Hem-vyns FamilyTodoThreads.tsx. Anropar samma
  // onSoftDeleteTodo som varje rads egen enskilda radera-knapp redan gör,
  // ingen extra ägarskaps-gren — backend (canEditTodo/canDeleteTodo,
  // ADR-0016) avgör redan om anropet faktiskt får verkan.
  const [selectedListTodoIds, setSelectedListTodoIds] = useState<Set<Id>>(new Set());
  const [confirmingBulkDeleteList, setConfirmingBulkDeleteList] = useState(false);

  function toggleListTodoSelected(todoId: Id) {
    setSelectedListTodoIds((current) => {
      const next = new Set(current);
      if (next.has(todoId)) next.delete(todoId);
      else next.add(todoId);
      return next;
    });
    setConfirmingBulkDeleteList(false);
  }

  function cancelListSelection() {
    setSelectedListTodoIds(new Set());
    setConfirmingBulkDeleteList(false);
  }

  function handleBulkDeleteListTodos() {
    if (selectedListTodoIds.size === 0) return;
    if (!confirmingBulkDeleteList) {
      setConfirmingBulkDeleteList(true);
      return;
    }
    for (const todoId of selectedListTodoIds) {
      onSoftDeleteTodo(todoId);
    }
    cancelListSelection();
  }

  function openCreateModalForCategory(categoryId: Id | null) {
    setCreateDefaultCategoryId(categoryId);
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setCreateDefaultCategoryId(null);
  }

  return (
    <article className="dashboard">
      {/* Tråd-läget (2026-07-25, Zaidas önskemål: "helst rymmas på samma
          rad") visar ingen egen rubrikrad här — "Bubbelsysslor ✨" flyttad in
          i ParentTodoThreadView.tsx:s eget verktygsfält istället, så titel
          och info/redigera/plus-knapparna delar en rad och bubblorna får
          mer plats på höjden. */}
      {todoViewMode !== "thread" && (
        <header className="section-header">
          <div>
            <p className="eyebrow">Uppgifter</p>
            <h2>Todos</h2>
          </div>
        </header>
      )}

      <div className="dashboard-list">
        {/* Visningsläget (lista/tråd) väljs i Inställningar, ingen egen
            växlare här (2026-07-05, Zaidas beslut) — panelen visar bara
            kategori/todouppgifterna. Den fristående +-knappen togs bort
            2026-07-06 (Zaidas beslut) — nya uppgifter/kategorier skapas nu
            enbart via en trådens egen "Lägg till uppgift"-menyval istället
            (kategorierna eller den gemensamma Barn-tråden). */}
        {isCreateModalOpen && (
          <TodoCreatorModal
            currentMember={currentMember}
            members={members}
            roles={roles}
            categories={personalCategories}
            defaultCategoryId={createDefaultCategoryId}
            onCreateCategory={onCreateCategory}
            onCreateTodo={onCreateTodo}
            taskTemplates={taskTemplates}
            categoryTemplates={categoryTemplates}
            onClose={closeCreateModal}
            fixedTodoTimes={fixedTodoTimes}
          />
        )}

        {editTodo && (
          <TodoEditModal
            todo={editTodo}
            currentMember={currentMember}
            members={allMembers}
            roles={roles}
            categories={personalCategories}
            todos={todos}
            onUpdateTodo={onUpdateTodo}
            onCreateCategory={onCreateCategory}
            onCreateTaskTemplate={onCreateTaskTemplate}
            onDeleteTodo={onSoftDeleteTodo}
            onRefreshRoutine={onRefreshRoutine}
            onClose={() => setEditTodoId(null)}
            fixedTodoTimes={fixedTodoTimes}
          />
        )}

        {/* Delad verktygsrad (2026-08-06, Zaidas fynd: "familjens todo som
            jag assignat mig på" hamnade inte i samma container som mina
            egna kategorier) — låg tidigare INUTI ParentTodoThreadView.tsx,
            ovanför bara DESS EGEN .todo-thread-view. FamilyTodoThreads.tsx
            hade ingen motsvarande rad ovanför sig, så med align-items:
            flex-start i .todo-threads-row hamnade familjetrådens rubrik i
            höjd med DENNA rad istället för i höjd med de andra kategorierna,
            under den. Flyttad hit — en enda delad rad, ovanför HELA
            .todo-threads-row — löser det, se TodoThreadToolbar.tsx. */}
        {todoViewMode === "thread" && canSeeTodos && (
          <TodoThreadToolbar
            categoryTemplates={categoryTemplates}
            currentMember={currentMember}
            members={allMembers}
            onAddTodoToCategory={openCreateModalForCategory}
            onCreateCategory={onCreateCategory}
            onCreateTodo={onCreateTodo}
            todos={todos}
          />
        )}

        {/* Gemensam rad (2026-08-03, Zaidas önskemål: "jag vill ha dem i
            samma rad") — mina egna trådar och signade familjeuppgifter
            ligger sida vid sida istället för staplade som två separata
            rader. Fortsatt två oberoende, egna skrollbara grupper bakom
            kulisserna (varsin ParentTodoThreadView/FamilyTodoThreads-
            komponent, med olika mutationsmodeller — en fullständig
            sammanslagning till EN skrollbar lista är en större omskrivning,
            medvetet inte gjord denna gång). */}
        <div className="todo-threads-row">
        {todoViewMode === "thread" && canSeeTodos && (
          <ParentTodoThreadView
            todos={visibleTodos}
            allTodos={todos}
            members={allMembers}
            roles={roles}
            currentMember={currentMember}
            categories={personalCategories}
            showChildTodos={showChildTodosInOwnView}
            onToggleSubtask={onToggleSubtask}
            onToggleTodoInProgress={onToggleTodoInProgress}
            onUpdateTodo={onUpdateTodo}
            onRefreshRoutine={onRefreshRoutine}
            onCompleteTodo={onCompleteTodo}
            onCreateCategory={onCreateCategory}
            onRenameCategory={onRenameCategory}
            onRemoveCategory={onRemoveCategory}
            onSetCategoryHidden={onSetCategoryHidden}
            onCreateTaskTemplate={onCreateTaskTemplate}
            onCreateCategoryTemplate={onCreateCategoryTemplate}
            onUpdateCategoryTemplate={onUpdateCategoryTemplate}
            categoryTemplates={categoryTemplates}
            onDeleteTodo={onSoftDeleteTodo}
            onAddTodoToCategory={openCreateModalForCategory}
            todoThreadOrder={todoThreadOrder}
            onReorderThreads={onReorderThreads}
            todoBubbleOrder={todoBubbleOrder}
            onReorderBubbles={onReorderBubbles}
            range={todoThreadRange}
            threadGap={todoThreadGap}
            bubbleSize={todoBubbleSize}
            fixedTodoTimes={fixedTodoTimes}
          />
        )}

        {/* Signade familjeuppgifter (2026-08-01, Zaidas rättelse: "andra
            familjers todo" hörde inte hemma i Todos-panelen — bara det jag
            faktiskt SIGNAT UPP på från Hem-vyn, en egen tråd per familj
            namngiven efter familjen. Att BLÄDDRA i en familjs hela pool
            (Delade barn/Mina familjekonton/Familjeanslutningar) hör bara
            hemma i Hem-vyn nu, se MemberOverview.tsx. */}
        {todoViewMode === "thread" && personalSignedUpThreadSources.length > 0 && (
          <FamilyTodoThreads
            onReorderBubbles={onReorderBubbles}
            range={todoThreadRange}
            sources={personalSignedUpThreadSources}
            todoBubbleOrder={todoBubbleOrder}
            todoBubbleSize={todoBubbleSize}
            todoThreadGap={todoThreadGap}
          />
        )}
        </div>

        {todoViewMode === "list" && selectedListTodoIds.size > 0 && (
          <div className="todo-thread__select-bar">
            <span className="todo-thread__select-count">{selectedListTodoIds.size} valda</span>
            <button
              className="todo-thread__select-remove danger-button"
              onClick={handleBulkDeleteListTodos}
              type="button"
            >
              {confirmingBulkDeleteList ? "Bekräfta radering" : "Radera valda"}
            </button>
            <button onClick={cancelListSelection} type="button">
              Avbryt
            </button>
          </div>
        )}

        {todoViewMode === "list" && rangeFilteredTodos.map((todo) => (
          <div className="dashboard-row todo-dashboard-row" key={todo.id}>
            <input
              aria-label={`Välj ${todo.title} för massradering`}
              checked={selectedListTodoIds.has(todo.id)}
              onChange={() => toggleListTodoSelected(todo.id)}
              type="checkbox"
            />
            <span>
              {todo.title}
              <small>{getAssigneeName(todo, allMembers)}</small>
            </span>
            <strong>{getTodoSummary(todo)}</strong>
            <div className="todo-row-actions">
              <button className="icon-button" onClick={() => setEditTodoId(todo.id)} title="Redigera" type="button">
                <Pencil size={16} />
              </button>
              <button className="icon-button danger" onClick={() => onSoftDeleteTodo(todo.id)} title="Radera" type="button">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}

        {visibleTodos.length === 0 && !canCreate && (
          <p className="empty-note">Inga todos att visa.</p>
        )}

        {suggestedRewards.length > 0 && (
          <section className="approval-panel" aria-label="Önskningar att godkänna">
            <div className="approval-header">
              <strong>Önskningar</strong>
              <span>{suggestedRewards.length}</span>
            </div>
            {suggestedRewards.map((reward) => (
              <div className="approval-row" key={reward.id}>
                <div>
                  <strong>{reward.title}</strong>
                  <small>
                    <input
                      aria-label="Antal stjärnor"
                      className="stars-input"
                      max={100}
                      min={1}
                      onChange={(e) => onSetWishStars(reward.id, Number(e.target.value))}
                      type="number"
                      value={wishStars[reward.id] ?? 10}
                    />{" "}
                    stjärnor
                  </small>
                </div>
                <div className="approval-actions">
                  <button className="icon-button" onClick={() => onApproveWish(reward.id)} title="Godkänn" type="button">
                    <CheckCircle2 size={16} />
                  </button>
                  <button className="icon-button danger" onClick={() => onRejectWish(reward.id)} title="Neka" type="button">
                    <XCircle size={16} />
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </article>
  );
}

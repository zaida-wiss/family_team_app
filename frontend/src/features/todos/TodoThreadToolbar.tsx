import "./ParentTodoThreadView.css";
import { useState } from "react";
import { BarChart3, Info, Plus, X } from "lucide-react";
import type { Id, Member, Todo, TodoCategory, TodoCategoryTemplate } from "@shared/types";
import { TodoStatsModal } from "./TodoStatsModal";
import { NEW_CATEGORY_VALUE } from "./TodoCreatorModal";
import { dateOnlyToISO } from "./recurringTodos";
import { generateId } from "../../utils/uuid";
import { useOverlayDismiss } from "../../hooks/useOverlayDismiss";

type Props = {
  currentMember: Member;
  members: Member[];
  todos: Todo[];
  categoryTemplates: TodoCategoryTemplate[];
  onCreateCategory: (name: string) => Promise<TodoCategory>;
  onCreateTodo: (todo: Todo) => void;
  onAddTodoToCategory: (categoryId: Id | null) => void;
};

// Verktygsraden (titel + info/statistik/+-knappar), utbruten ur
// ParentTodoThreadView.tsx (2026-08-06, Zaidas fynd: "familjens todo som jag
// assignat mig på" hamnade inte i samma container som mina egna kategorier —
// grundorsaken var att bara ParentTodoThreadView.tsx hade en egen toolbar
// OVANFÖR sin .todo-thread-view, medan FamilyTodoThreads.tsx:s tråd (samma
// flex-rad, .todo-threads-row i TodosView.tsx) inte hade det. Med
// align-items:flex-start i raden hamnade familjetrådens rubrik därför i
// höjd med DENNA toolbar istället för i höjd med de andra kategorierna,
// under den. Lösningen är att lyfta toolbaren en nivå upp — en enda delad
// rad i TodosView.tsx, ovanför HELA .todo-threads-row — istället för att
// duplicera den, eller ge FamilyTodoThreads en egen tom platshållare.
export function TodoThreadToolbar({
  currentMember,
  members,
  todos,
  categoryTemplates,
  onCreateCategory,
  onCreateTodo,
  onAddTodoToCategory
}: Props) {
  const [showInfo, setShowInfo] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // Ny kategori-knapp (+) längst till höger (2026-07-25, Zaidas önskemål:
  // "lägga till en ny kategori eller hämta en från mall"). 2026-08-05,
  // Zaidas rättelse: "aldrig bara en kategori" — det tidigare "Tom
  // kategori"-läget (skapade en kategori helt utan uppgift) togs bort. Vill
  // man INTE använda en sparad kategorimall öppnas nu hela Ny uppgift-
  // modalen direkt i "+Ny kategori…"-läge (samma onAddTodoToCategory-prop
  // som redan används av kategorimenyns "Lägg till uppgift", bara med
  // NEW_CATEGORY_VALUE istället för ett riktigt kategori-id eller null) —
  // kategori och första uppgift skapas då alltid i samma steg. Finns inga
  // sparade kategorimallar alls hoppar "+"-knappen över den här minimodalen
  // helt och öppnar Ny uppgift-modalen direkt, se knappens onClick nedan.
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryTemplateId, setNewCategoryTemplateId] = useState("");
  const [newCategoryTemplateStartDate, setNewCategoryTemplateStartDate] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const canSubmitNewCategory = Boolean(newCategoryTemplateId && newCategoryTemplateStartDate);

  function closeNewCategoryModal() {
    setShowNewCategory(false);
    setNewCategoryTemplateId("");
    setNewCategoryTemplateStartDate("");
  }

  const newCategoryOverlay = useOverlayDismiss(closeNewCategoryModal);
  const infoOverlay = useOverlayDismiss(() => setShowInfo(false));

  function openCreateModalForNewCategory() {
    closeNewCategoryModal();
    onAddTodoToCategory(NEW_CATEGORY_VALUE);
  }

  async function submitNewCategory() {
    if (!canSubmitNewCategory || creatingCategory) return;
    setCreatingCategory(true);
    try {
      const template = categoryTemplates.find((t) => t.id === newCategoryTemplateId);
      if (!template) return;
      const category = await onCreateCategory(template.name);
      for (const task of template.tasks) {
        onCreateTodo({
          id: `todo-${generateId()}`,
          title: task.title,
          createdBy: currentMember.id,
          assignedTo: currentMember.id,
          isShared: false,
          status: "pending",
          starValue: task.starValue,
          visual: task.visual,
          recurrence: task.recurrence,
          recurringSourceId: null,
          occurrenceDate: null,
          visibleFrom: dateOnlyToISO(newCategoryTemplateStartDate),
          expiresAt: null,
          completedAt: null,
          approvedBy: null,
          approvedAt: null,
          rejectedBy: null,
          rejectedAt: null,
          rejectedReason: null,
          deletedAt: null,
          deletedBy: null,
          personalCategoryId: category.id,
          notes: null,
          subtasks: task.subtasks.map((s) => ({ id: generateId(), title: s.title, done: false })),
          timerEnabled: false,
          plannedDurationMinutes: null,
          elapsedMs: null
        });
      }
    } finally {
      setCreatingCategory(false);
      closeNewCategoryModal();
    }
  }

  return (
    <div className="todo-thread-view__toolbar">
      <h2 className="todo-thread-view__toolbar-title">Bubbelsysslor ✨</h2>
      <div className="todo-thread-view__toolbar-actions">
        {/* Ikonstorleken minimerad (2026-08-09, Zaidas önskemål: "minimera
            resten av texten... infoknapparna") — knappens EGEN klickyta
            (.icon-button, components.css) förblir 44×44px oavsett, det
            icke förhandlingsbara touch-målsgolvet (CLAUDE.md), bara den
            synliga glyfen krymper (var 16px). */}
        <button
          aria-label="Hur fungerar bubbelsysslorna?"
          className="icon-button"
          onClick={() => setShowInfo(true)}
          title="Hur fungerar bubbelsysslorna?"
          type="button"
        >
          <Info size={14} />
        </button>
        <button
          aria-label="Statistik"
          className="icon-button"
          onClick={() => setShowStats(true)}
          title="Statistik — senaste 7 dagarna"
          type="button"
        >
          <BarChart3 size={14} />
        </button>
        <button
          aria-label="Ny kategori"
          className="icon-button"
          onClick={() => {
            // Inget att välja mellan utan sparade kategorimallar — hoppa
            // rakt till Ny uppgift-modalens "+Ny kategori…"-läge istället
            // för att visa en minimodal utan reellt innehåll.
            if (categoryTemplates.length === 0) {
              onAddTodoToCategory(NEW_CATEGORY_VALUE);
              return;
            }
            setShowNewCategory(true);
          }}
          title="Ny kategori — från mall, eller som en del av en ny uppgift"
          type="button"
        >
          <Plus size={14} />
        </button>
      </div>

      {showStats && <TodoStatsModal members={members} todos={todos} onClose={() => setShowStats(false)} />}

      {showNewCategory && (
        <div className="todo-thread-view__reuse-overlay" {...newCategoryOverlay}>
          <div
            aria-labelledby="new-category-title"
            aria-modal="true"
            className="todo-thread-view__reuse-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="todo-thread-view__info-header">
              <h3 id="new-category-title">Ny kategori från mall</h3>
              <button aria-label="Stäng" className="icon-button" onClick={closeNewCategoryModal} type="button">
                <X size={16} />
              </button>
            </div>

            <label className="field-label">
              Mall
              <select
                className="text-input"
                onChange={(e) => setNewCategoryTemplateId(e.target.value)}
                value={newCategoryTemplateId}
              >
                <option disabled value="">Välj en mall…</option>
                {categoryTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.tasks.length} uppgifter)</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Startdatum för uppgifterna
              <input
                className="text-input"
                onChange={(e) => setNewCategoryTemplateStartDate(e.target.value)}
                type="date"
                value={newCategoryTemplateStartDate}
              />
            </label>

            {/* "Tom kategori" borttagen (2026-08-05, Zaidas beslut: "aldrig
                bara en kategori") — vill man inte använda en mall öppnas
                istället Ny uppgift-modalen direkt i "+Ny kategori…"-läge,
                kategori och första uppgift skapas då i samma steg. */}
            <button
              className="secondary-button"
              onClick={openCreateModalForNewCategory}
              type="button"
            >
              Skapa istället via en ny uppgift…
            </button>

            <div className="todo-thread-view__reuse-actions">
              <button className="secondary-button" onClick={closeNewCategoryModal} type="button">
                Avbryt
              </button>
              <button
                className="primary-button"
                disabled={!canSubmitNewCategory || creatingCategory}
                onClick={() => void submitNewCategory()}
                type="button"
              >
                {creatingCategory ? "Skapar…" : "Skapa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div className="todo-thread-view__reuse-overlay" {...infoOverlay}>
          <div
            aria-labelledby="bubble-info-title"
            aria-modal="true"
            className="todo-thread-view__reuse-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="todo-thread-view__info-header">
              <h3 id="bubble-info-title">Så fungerar bubbelsysslorna</h3>
              <button aria-label="Stäng" className="icon-button" onClick={() => setShowInfo(false)} type="button">
                <X size={16} />
              </button>
            </div>
            <ul className="todo-thread-view__info-list">
              <li><strong>Kort tryck</strong> på en bubbla öppnar uppgiften — anteckningar och delmoment.</li>
              <li><strong>Dubbeltryck</strong> markerar att du håller på med uppgiften, så andra ser det.</li>
              <li><strong>Håll intryckt i två sekunder</strong> markerar hela uppgiften klar.</li>
              <li><strong>Håll och dra i ett kategorinamn</strong> för att ändra ordning på trådarna.</li>
              <li><strong>Tre snabba tryck på ett kategorinamn</strong> växlar flyttläge för just den kategorin — dra då enskilda bubblor för att ändra ordning inom kategorin (kategorin i sig går alltid att dra i, oavsett läge).</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

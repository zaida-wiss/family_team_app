import { FamilyTodoThreads } from "./FamilyTodoThreads";
import type { FamilyThreadSource } from "./FamilyTodoThreads";
import { useSharedCategoryTodos } from "./useTodoCategorySharesState";
import type { TodoThreadRange } from "@shared/types";

// Delade EGNA kategorier (2026-08-06, Zaidas önskemål: "det skall vara
// möjligt att dela sina egna kategorier med utvalda familjer") — en tråd
// PER kategori som delats MED mig, samma återanvända FamilyTodoThreads-
// komponent (bubbel-gester/checklista/detaljvy) som resten av Hem-vyns
// familjetrådar, till skillnad från SharedChildrenThreads.tsx (som byggde
// en egen, enklare bubbel-rendering eftersom den föregick FamilyTodoThreads).
// Ingen signup-gest ("vem håller på med den här") — en delad kategoris
// mottagare har ingen egen identitet i ägarkontot, samma princip som redan
// gäller Familjeanslutningars trådar. onComplete/onToggleSubtask är
// medvetet ALLTID wired (även vid "view"-åtkomst) — samma etablerade mönster
// som MemberShellContent.tsx:s connections-trådar (backend svarar 403 om
// åtkomsten faktiskt saknas, ingen client-side gating av just gesten).
type Props = {
  range: TodoThreadRange;
  todoBubbleSize?: number;
  todoThreadGap?: number;
};

export function SharedCategoryThreads({ range, todoBubbleSize, todoThreadGap }: Props) {
  const { threads, completeTodo, toggleSubtask } = useSharedCategoryTodos();

  if (threads.length === 0) return null;

  const sources: FamilyThreadSource[] = threads.map(({ category, todos }) => ({
    id: category.id,
    accountId: category.accountId,
    label: `${category.name} (${category.accountName})`,
    todos,
    members: [],
    onComplete: (todoId) => completeTodo(category.accountId, todoId),
    onToggleSubtask: (todoId, subtaskId) => toggleSubtask(category.accountId, todoId, subtaskId)
  }));

  return <FamilyTodoThreads onReorderBubbles={() => {}} range={range} sources={sources} todoBubbleOrder={{}} todoBubbleSize={todoBubbleSize} todoThreadGap={todoThreadGap} />;
}

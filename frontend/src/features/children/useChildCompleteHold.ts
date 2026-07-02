import type { Id, Todo } from "@shared/types";
import { useHoldToConfirm } from "../../hooks/useHoldToConfirm";

const HOLD_DURATION_MS = 2000;

export function useChildCompleteHold(
  activeChildTodos: Todo[],
  onCompleteTodo: (todoId: Id) => void
) {
  const { heldId, startHold: startHoldGeneric, clearHold } = useHoldToConfirm(HOLD_DURATION_MS);

  function startHold(todoId: Id) {
    const todo = activeChildTodos.find((t) => t.id === todoId);
    if (!todo) return;
    startHoldGeneric(todoId, () => onCompleteTodo(todoId));
  }

  return { heldTodoId: heldId as Id | null, startHold, clearHold };
}

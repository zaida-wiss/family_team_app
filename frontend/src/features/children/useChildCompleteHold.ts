import { useEffect, useRef, useState } from "react";
import type { Id, Todo } from "@shared/types";

export function useChildCompleteHold(
  activeChildTodos: Todo[],
  onCompleteTodo: (todoId: Id) => void
) {
  const [heldTodoId, setHeldTodoId] = useState<Id | null>(null);
  const holdRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (holdRef.current !== null) window.clearTimeout(holdRef.current);
    },
    []
  );

  function clearHold() {
    if (holdRef.current !== null) {
      window.clearTimeout(holdRef.current);
      holdRef.current = null;
    }
    setHeldTodoId(null);
  }

  function startHold(todoId: Id) {
    const todo = activeChildTodos.find((t) => t.id === todoId);
    if (!todo) return;
    clearHold();
    setHeldTodoId(todoId);
    holdRef.current = window.setTimeout(() => {
      onCompleteTodo(todoId);
      holdRef.current = null;
      setHeldTodoId(null);
    }, 2000);
  }

  return { heldTodoId, startHold, clearHold };
}

import { useEffect, useRef, useState } from "react";
import type { Id, Todo } from "@shared/types";

type CompletedCue = {
  id: Id;
  title: string;
  visual: string;
  starValue: number;
};

export function useChildCompleteHold(
  activeChildTodos: Todo[],
  onCompleteTodo: (todoId: Id) => void
) {
  const [heldTodoId, setHeldTodoId] = useState<Id | null>(null);
  const [completedCue, setCompletedCue] = useState<CompletedCue | null>(null);
  const holdRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const cueRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (holdRef.current !== null) window.clearTimeout(holdRef.current);
      if (cueRef.current !== null) window.clearTimeout(cueRef.current);
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
      setCompletedCue({
        id: todo.id,
        title: todo.title,
        visual: todo.visual.value,
        starValue: todo.starValue,
      });
      onCompleteTodo(todoId);
      holdRef.current = null;
      setHeldTodoId(null);
      if (cueRef.current !== null) window.clearTimeout(cueRef.current);
      cueRef.current = window.setTimeout(() => {
        setCompletedCue(null);
        cueRef.current = null;
      }, 1800);
    }, 2000);
  }

  return { heldTodoId, completedCue, startHold, clearHold };
}

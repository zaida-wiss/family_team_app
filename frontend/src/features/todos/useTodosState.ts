import { useEffect, useRef, useState } from "react";
import { todosApi } from "../../api";
import { canCompleteTodo, canDeleteTodo, canEditTodo } from "../../utils/permissions";
import { getDateKey, getDueRecurringTodoOccurrences } from "./recurringTodos";
import type { Id, Member, Role, Todo } from "@shared/types";
import { trackEvent } from "../../utils/analytics";

export function useTodosState() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const todosRef = useRef<Todo[]>([]);
  const [editingTodoId, setEditingTodoId] = useState<Id | null>(null);
  const [editingTodoTitle, setEditingTodoTitle] = useState("");

  useEffect(() => {
    refreshTodos().catch(console.error);
  }, []);

  useEffect(() => {
    return todosApi.subscribeToChanges(() => {
      refreshTodos().catch(console.error);
    });
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(syncScheduledTodos, 30_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  async function refreshTodos() {
    const loadedTodos = await todosApi.getAll();
    todosRef.current = loadedTodos;
    setTodos(expirePendingTodos(loadedTodos, Date.now()));
    await syncScheduledTodos(loadedTodos);
  }

  async function syncScheduledTodos(baseTodos = todosRef.current) {
    const currentDate = new Date();
    const currentTime = currentDate.getTime();
    const occurrences = getDueRecurringTodoOccurrences(baseTodos, currentDate);
    const savedOccurrences = await Promise.all(
      occurrences.map(async (todo) => {
        try {
          await todosApi.create(todo);
          return todo;
        } catch (error) {
          console.error(error);
          return null;
        }
      })
    );

    setTodos((current) =>
      expirePendingTodos(
        addMissingTodos(
          current,
          savedOccurrences.filter((todo): todo is Todo => todo !== null)
        ),
        currentTime
      )
    );
  }

  function createTodo(todo: Todo) {
    todosApi.create(todo).catch(console.error);
    setTodos((current) => [...current, todo]);
  }

  function updateTodo(todoId: Id, patch: Partial<Todo>) {
    todosApi.update(todoId, patch).catch(console.error);
    setTodos((current) =>
      current.map((todo) => (todo.id === todoId ? { ...todo, ...patch } : todo))
    );
  }

  function completeTodo(member: Member, todoId: Id, roles: Role[]) {
    const todoToComplete = todos.find((todo) => todo.id === todoId);
    if (!todoToComplete || !canCompleteTodo(member, roles, todoToComplete)) {
      return;
    }

    persistTodoIfGeneratedOccurrence(todoToComplete)
      .then(() => todosApi.complete(todoId))
      .catch(console.error);
    trackEvent("todo-completed");

    setTodos((current) =>
      current.map((todo) =>
        todo.id !== todoId
          ? todo
          : {
              ...todo,
              status: "done" as const,
              completedAt: new Date().toISOString()
            }
      )
    );
  }

  function startEditingTodo(todo: Todo, member: Member, roles: Role[]) {
    if (!canEditTodo(member, roles, todo)) {
      return;
    }

    setEditingTodoId(todo.id);
    setEditingTodoTitle(todo.title);
  }

  function saveTodoTitle(todoId: Id, member: Member, roles: Role[]) {
    const trimmedTitle = editingTodoTitle.trim();

    if (!trimmedTitle) {
      return;
    }

    setTodos((current) =>
      current.map((todo) => {
        if (todo.id !== todoId || !canEditTodo(member, roles, todo)) {
          return todo;
        }

        return { ...todo, title: trimmedTitle };
      })
    );
    setEditingTodoId(null);
    setEditingTodoTitle("");
  }

  function cancelEditingTodo() {
    setEditingTodoId(null);
    setEditingTodoTitle("");
  }

  function softDeleteTodo(todoId: Id, member: Member, roles: Role[]) {
    setTodos((current) =>
      current.map((todo) => {
        if (todo.id !== todoId || !canDeleteTodo(member, roles, todo)) {
          return todo;
        }

        todosApi.remove(todoId).catch(console.error);
        return {
          ...todo,
          deletedAt: new Date().toISOString(),
          deletedBy: member.id
        };
      })
    );

    if (editingTodoId === todoId) {
      cancelEditingTodo();
    }
  }

  function restoreTodo(todoId: Id) {
    setTodos((current) =>
      current.map((todo) => {
        if (todo.id !== todoId) {
          return todo;
        }

        todosApi.restore(todoId).catch(console.error);
        return { ...todo, deletedAt: null, deletedBy: null };
      })
    );
  }

  function approveTodo(todoId: Id, approverId: Id) {
    setTodos((current) =>
      current.map((todo) => {
        if (todo.id !== todoId || todo.status !== "done") {
          return todo;
        }

        todosApi.approve(todoId).catch(console.error);
        trackEvent("todo-approved");
        return {
          ...todo,
          status: "approved" as const,
          approvedBy: approverId,
          approvedAt: new Date().toISOString()
        };
      })
    );
  }

  function rejectTodo(todoId: Id, rejecterId: Id) {
    setTodos((current) =>
      current.map((todo) => {
        if (todo.id !== todoId || todo.status !== "done") {
          return todo;
        }

        todosApi.reject(todoId).catch(console.error);
        if (canRetryRejectedTodo(todo)) {
          return {
            ...todo,
            status: "pending" as const,
            completedAt: null,
            approvedBy: null,
            approvedAt: null,
            rejectedBy: null,
            rejectedAt: null
          };
        }

        return {
          ...todo,
          status: "rejected" as const,
          rejectedBy: rejecterId,
          rejectedAt: new Date().toISOString()
        };
      })
    );
  }

  function dismissRejectedTodo(todoId: Id, memberId: Id) {
    setTodos((current) =>
      current.map((todo) => {
        if (todo.id !== todoId || todo.status !== "rejected" || todo.assignedTo !== memberId) {
          return todo;
        }

        todosApi.remove(todoId).catch(console.error);
        return {
          ...todo,
          deletedAt: new Date().toISOString(),
          deletedBy: memberId
        };
      })
    );
  }

  function softDeleteTodosForMember(memberId: Id, deletedAt: string) {
    setTodos((current) =>
      current.map((todo) => {
        if (todo.createdBy !== memberId && todo.assignedTo !== memberId) {
          return todo;
        }

        todosApi.remove(todo.id).catch(console.error);
        return { ...todo, deletedAt, deletedBy: memberId };
      })
    );
  }

  function refreshRoutineOccurrence(routineId: Id) {
    const current = todosRef.current;
    const routine = current.find((todo) => todo.id === routineId);
    if (!routine) {
      return;
    }

    const today = getDateKey(new Date());
    const existingOccurrence = current.find(
      (todo) => todo.recurringSourceId === routineId && todo.occurrenceDate === today
    );
    const pendingPatch: Partial<Todo> = {
      status: "pending",
      completedAt: null,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      deletedAt: null,
      deletedBy: null
    };

    if (existingOccurrence) {
      updateTodo(existingOccurrence.id, pendingPatch);
      return;
    }

    const [newOccurrence] = getDueRecurringTodoOccurrences([routine], new Date());
    if (newOccurrence) {
      todosApi.create(newOccurrence).catch(console.error);
      setTodos((items) => addMissingTodos(items, [newOccurrence]));
    }
  }

  return {
    todos,
    editingTodoId,
    editingTodoTitle,
    setEditingTodoTitle,
    createTodo,
    updateTodo,
    completeTodo,
    startEditingTodo,
    saveTodoTitle,
    cancelEditingTodo,
    softDeleteTodo,
    restoreTodo,
    approveTodo,
    rejectTodo,
    dismissRejectedTodo,
    softDeleteTodosForMember,
    refreshRoutineOccurrence
  };
}

function canRetryRejectedTodo(todo: Todo, now = Date.now()) {
  if (!todo.expiresAt) {
    return true;
  }

  return new Date(todo.expiresAt).getTime() > now;
}

async function persistTodoIfGeneratedOccurrence(todo: Todo) {
  if (!todo.recurringSourceId || !todo.occurrenceDate) {
    return;
  }

  await todosApi.create(todo);
}

function addMissingTodos(current: Todo[], incoming: Todo[]) {
  const existingIds = new Set(current.map((todo) => todo.id));
  return [
    ...current,
    ...incoming.filter((todo) => !existingIds.has(todo.id))
  ];
}

function expirePendingTodos(current: Todo[], currentTime: number) {
  return current.map((todo) => {
    if (
      todo.status !== "pending" ||
      todo.deletedAt !== null ||
      !todo.expiresAt ||
      new Date(todo.expiresAt).getTime() > currentTime
    ) {
      return todo;
    }

    return { ...todo, status: "expired" as const };
  });
}

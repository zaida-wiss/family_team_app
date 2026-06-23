import { useEffect, useState } from "react";
import { todosApi } from "../../api";
import { canCompleteTodo, canDeleteTodo, canEditTodo } from "../../utils/permissions";
import { getDueRecurringTodoOccurrences } from "./recurringTodos";
import type { Id, Member, Role, Todo } from "@shared/types";

export function useTodosState() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [editingTodoId, setEditingTodoId] = useState<Id | null>(null);
  const [editingTodoTitle, setEditingTodoTitle] = useState("");

  useEffect(() => {
    todosApi.getAll().then(setTodos).catch(console.error);
  }, []);

  useEffect(() => {
    function syncScheduledTodos() {
      const currentDate = new Date();
      const currentTime = currentDate.getTime();

      setTodos((current) =>
        [
          ...current,
          ...getDueRecurringTodoOccurrences(current, currentDate)
        ].map((todo) => {
          if (
            todo.status !== "pending" ||
            todo.deletedAt !== null ||
            !todo.expiresAt ||
            new Date(todo.expiresAt).getTime() > currentTime
          ) {
            return todo;
          }

          return { ...todo, status: "expired" as const };
        })
      );
    }

    syncScheduledTodos();
    const intervalId = window.setInterval(syncScheduledTodos, 30_000);

    return () => window.clearInterval(intervalId);
  }, []);

  function createTodo(todo: Todo) {
    todosApi.create(todo).catch(console.error);
    setTodos((current) => [...current, todo]);
  }

  function completeTodo(member: Member, todoId: Id, roles: Role[]) {
    setTodos((current) =>
      current.map((todo) => {
        if (todo.id !== todoId || !canCompleteTodo(member, roles, todo)) {
          return todo;
        }

        todosApi.complete(todoId).catch(console.error);
        return {
          ...todo,
          status: "done" as const,
          completedAt: new Date().toISOString()
        };
      })
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

  return {
    todos,
    editingTodoId,
    editingTodoTitle,
    setEditingTodoTitle,
    createTodo,
    completeTodo,
    startEditingTodo,
    saveTodoTitle,
    cancelEditingTodo,
    softDeleteTodo,
    restoreTodo,
    approveTodo,
    rejectTodo,
    dismissRejectedTodo,
    softDeleteTodosForMember
  };
}

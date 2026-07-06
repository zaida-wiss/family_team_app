import { useEffect, useRef, useState } from "react";
import { todosApi } from "../../api";
import { canCompleteTodo, canDeleteTodo } from "../../utils/permissions";
import { applyTemplateToOccurrence, getDateKey, getDueRecurringTodoOccurrences } from "./recurringTodos";
import type { Id, Member, Role, Todo } from "@shared/types";
import { trackEvent } from "../../utils/analytics";

export function useTodosState() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const todosRef = useRef<Todo[]>([]);
  // refreshTodos triggas från fyra oberoende källor (mount, SSE, visibilitychange,
  // efter godkänn/neka/avklara) som kan överlappa. Utan detta kan ett äldre svar
  // hinna komma in efter ett nyare och skriva över ett nyss godkänt uppdrag tillbaka
  // till sitt gamla, inaktuella tillstånd — "hoppar tillbaka till listan".
  const refreshTokenRef = useRef(0);
  // Skydd mot en ANNAN variant av samma symptom: en oberoende bakgrundsrefresh
  // (inte den som själva mutationen triggar) kan hinna svara med en server-
  // snapshot från INNAN godkänn/neka-anropet hann landa, och skriver då över den
  // optimistiska uppdateringen. Todo-id:n med en pågående mutation skyddas här
  // tills mutationen själv bekräftat resultatet.
  const pendingMutationIds = useRef<Set<Id>>(new Set());

  useEffect(() => {
    refreshTodos().catch(console.error);
  }, []);

  useEffect(() => {
    return todosApi.subscribeToChanges(() => {
      refreshTodos().catch(console.error);
    });
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        refreshTodos().catch(console.error);
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(syncScheduledTodos, 30_000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  async function refreshTodos() {
    const token = ++refreshTokenRef.current;
    const loadedTodos = await todosApi.getAll();
    if (token !== refreshTokenRef.current) {
      // En senare refreshTodos() har redan startat — det här svaret är inaktuellt,
      // kasta det istället för att skriva över nyare (t.ex. nyss godkänd) state.
      return;
    }
    todosRef.current = loadedTodos;
    setTodos((current) => {
      const fresh = expirePendingTodos(loadedTodos, Date.now());
      if (pendingMutationIds.current.size === 0) return fresh;
      return fresh.map((todo) => {
        if (!pendingMutationIds.current.has(todo.id)) return todo;
        const optimistic = current.find((t) => t.id === todo.id);
        if (!optimistic) return todo;
        // Servern har hunnit ikapp den optimistiska statusen — mutationen är
        // bekräftad, sluta skydda den. Innan dess: behåll den optimistiska vyn.
        // Skyddet får INTE tas bort bara för att den här specifika
        // godkänn/neka-anropets EGEN refreshTodos()-anrop råkar vinna
        // token-racet — vid flera samtidiga godkännanden (t.ex. godkänn alla 19
        // i snabb följd) kan en ANNAN mutations refresh vinna med data hämtad
        // innan DEN HÄR mutationen hunnit landa på servern, vilket annars
        // skriver tillbaka den till "done" igen.
        if (todo.status === optimistic.status) {
          pendingMutationIds.current.delete(todo.id);
          return todo;
        }
        return optimistic;
      });
    });
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

  // Föräldravyn med delmoment (Sprint 6 S3) — bockar av/på ett enskilt delmoment,
  // oberoende av övriga delmoment och av complete/approve/reject-flödet.
  function toggleSubtask(todoId: Id, subtaskId: Id) {
    todosApi.toggleSubtask(todoId, subtaskId).catch(console.error);
    setTodos((current) =>
      current.map((todo) =>
        todo.id !== todoId
          ? todo
          : {
              ...todo,
              subtasks: todo.subtasks?.map((s) =>
                s.id === subtaskId ? { ...s, done: !s.done } : s
              )
            }
      )
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

  async function approveTodo(todoId: Id, approverId: Id) {
    // Eligibiliteten avgörs mot todosRef.current (en vanlig ref, alltid synkront
    // läsbar) — INTE genom att läsa tillbaka en yttre variabel som muterats inuti
    // setTodos-uppdateraren. React 18 garanterar inte att en funktionell
    // setState-uppdaterare körs synkront: vid snabbt upprepade godkännanden i rad
    // hann uppdateraren för klick nummer två (och senare) INTE köras än när koden
    // direkt efter setTodos() kollade den yttre "eligible"-flaggan — den var
    // fortfarande sitt ursprungsvärde false, så resten av funktionen (API-anropet)
    // hoppades felaktigt över, trots att den optimistiska uppdateringen senare
    // ändå slog igenom (uppgiften försvann visuellt utan att någonsin sparas på
    // servern) — upptäckt 2026-07-05, Zaida rapporterade att stjärnor/pengar
    // delades ut men uppgifterna låg kvar att godkänna efter en sidomladdning.
    const target = todosRef.current.find((t) => t.id === todoId);
    if (!target || target.status !== "done") return;

    setTodos((current) =>
      current.map((todo) =>
        todo.id === todoId
          ? {
              ...todo,
              status: "approved" as const,
              approvedBy: approverId,
              approvedAt: new Date().toISOString()
            }
          : todo
      )
    );

    pendingMutationIds.current.add(todoId);
    trackEvent("todo-approved");

    try {
      await todosApi.approve(todoId);
      await refreshTodos();
    } catch (error) {
      console.error(error);
      // API-anropet misslyckades — återställ den optimistiska uppdateringen så UI inte
      // visar en godkänd uppgift som aldrig faktiskt sparades på servern (samma mönster
      // som approveWish i useRewardsState.ts). Skyddet tas bort direkt här (inte i en
      // gemensam finally) eftersom refreshTodos() själv nu lazy-rensar det när servern
      // bekräftar — vid ett misslyckat anrop vet vi redan sanningen och behöver inte vänta.
      pendingMutationIds.current.delete(todoId);
      setTodos((current) =>
        current.map((todo) =>
          todo.id === todoId
            ? { ...todo, status: "done" as const, approvedBy: null, approvedAt: null }
            : todo
        )
      );
    }
  }

  async function rejectTodo(todoId: Id, rejecterId: Id, reason: string | null) {
    // Se motsvarande kommentar i approveTodo — eligibilitet och rollback-värdet
    // avgörs mot todosRef.current innan setTodos anropas, inte genom att läsa
    // tillbaka en yttre variabel muterad inuti uppdateraren (osäkert vid snabbt
    // upprepade anrop, uppdateraren garanteras inte köras synkront).
    const previousTodo = todosRef.current.find((t) => t.id === todoId);
    if (!previousTodo || previousTodo.status !== "done") return;

    setTodos((current) =>
      current.map((todo) => {
        if (todo.id !== todoId) return todo;
        if (canRetryRejectedTodo(todo)) {
          return {
            ...todo,
            status: "pending" as const,
            completedAt: null,
            approvedBy: null,
            approvedAt: null,
            rejectedBy: null,
            rejectedAt: null,
            rejectedReason: reason
          };
        }
        return {
          ...todo,
          status: "rejected" as const,
          rejectedBy: rejecterId,
          rejectedAt: new Date().toISOString(),
          rejectedReason: reason
        };
      })
    );
    pendingMutationIds.current.add(todoId);

    try {
      await todosApi.reject(todoId, reason);
      await refreshTodos();
    } catch (error) {
      console.error(error);
      // Se motsvarande kommentar i approveTodo — skyddet tas bort direkt här
      // (inte i en gemensam finally) eftersom refreshTodos() själv nu lazy-rensar
      // det när servern bekräftar mutationen.
      pendingMutationIds.current.delete(todoId);
      setTodos((current) =>
        current.map((todo) => (todo.id === todoId ? previousTodo : todo))
      );
    }
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
      // Synka samtidigt med mallens aktuella värden — annars visas fortsatt
      // gårdagens/en redigerad tid/titel trots att uppdraget "visas igen".
      updateTodo(existingOccurrence.id, {
        ...applyTemplateToOccurrence(existingOccurrence, routine),
        ...pendingPatch
      });
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
    createTodo,
    updateTodo,
    toggleSubtask,
    completeTodo,
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

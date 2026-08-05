import { useEffect, useRef, useState } from "react";
import { todosApi } from "../../api";
import { canCompleteTodo, canDeleteTodo } from "../../utils/permissions";
import { applyTemplateToOccurrence, getDateKey, getDueRecurringTodoOccurrences } from "./recurringTodos";
import type { Id, Member, Role, Todo } from "@shared/types";
import { trackEvent } from "../../utils/analytics";
import { readCache, writeCache } from "../../utils/localCache";
import { deferToIdle } from "../../utils/deferToIdle";

const TODOS_CACHE_KEY = "todos_v1";

export type ImportUndo = {
  // Uppdaterade rader: id + de värden de hade INNAN denna import.
  updated: { id: Id; previous: Partial<Todo> }[];
  // Nyskapade rader: bara deras id, ångras med en mjuk radering.
  createdIds: Id[];
};

// deleted (2026-08-04, Zaidas önskemål: en Radera-kolumn i CSV:n) — raderade
// rader spåras MEDVETET inte i ImportUndo (ovan), en mjuk-raderad todo landar
// redan i den vanliga papperskorgen (TrashView.tsx) och kan återställas
// därifrån om en import raderade fel rad.
export type ImportResult = { created: number; updated: number; deleted: number; errors: string[] };

export function useTodosState(fixedTodoTimes = false) {
  // Stale-while-revalidate (2026-07-17, Zaidas önskemål: "allt ska vara i
  // local storage" — barnen kunde inte se sina uppgifter utan nät): visar
  // senast kända todos direkt vid mount, uppdateras i bakgrunden. Cachen
  // skrivs om varje gång todos-listan ändras (se effekten nedan) — även en
  // rent optimistisk ändring (skapad/avklarad medan offline) sparas alltså
  // lokalt, inte bara redan hämtad serverdata.
  const [todos, setTodos] = useState<Todo[]>(() => readCache(TODOS_CACHE_KEY, []));
  const todosRef = useRef<Todo[]>([]);
  // Senaste CSV-importens resultat + ångra-underlag (2026-07-08, Zaidas
  // önskemål: "ångra senaste import måste vara kvar även om jag växlar vy,
  // eftersom jag behöver upptäcka eventuella fel") — låg tidigare som lokal
  // state i TodoImportExport.tsx, men Shell.tsx:s <ErrorBoundary key={activePanel}>
  // ommonterar hela panelträdet vid varje panelbyte, vilket nollställde den.
  // Lever här istället, i samma hook som redan överlever panelbyten.
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null);
  const [lastImportUndo, setLastImportUndo] = useState<ImportUndo | null>(null);
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
  // syncScheduledTodos triggas oberoende från FEM källor (mount/SSE/
  // visibilitychange/30s-intervallet/efter-mutation, se refreshTodos-
  // kommentaren ovan) — utan detta skydd kan två anrop råka köra samtidigt,
  // båda läsa samma todos-ögonblicksbild INNAN någonderas skapade
  // occurrences hunnit synas, och båda avgöra att samma mall "saknar" dagens
  // occurrence — resultat: en riktig dubblett-uppgift i databasen (2026-07-16,
  // Zaidas fynd, sannolikt utlöst av att "Kopiera rutiner" skapar många nya
  // mallar på en gång, vilket ökar risken för att SSE-anrop och intervallet
  // kolliderar). Ett enda in-flight-lås räcker — en överhoppad körning tas
  // igen av nästa trigger, ingen data går förlorad.
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    // Skjuts upp till efter första målningen (2026-07-26, prestandaomgången
    // S1a) — se deferToIdle.ts. Bara den INLEDANDE hämtningen, inte SSE/
    // visibilitychange/intervallet nedan, som redan är händelsestyrda.
    deferToIdle(() => { refreshTodos().catch(console.error); });
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
    writeCache(TODOS_CACHE_KEY, todos);
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
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      const currentDate = new Date();
      const currentTime = currentDate.getTime();
      const occurrences = getDueRecurringTodoOccurrences(baseTodos, currentDate, fixedTodoTimes);
      // Skapas i småbuntar om 4 i taget istället för alla samtidigt (2026-07-16,
      // produktionsincident) — ett konto med många återkommande mallar (t.ex.
      // strax efter "Kopiera rutiner" till ett nytt barn) kunde annars skjuta
      // iväg tiotals parallella POST-anrop i en enda Promise.all, vilket i
      // kombination med resten av en aktiv familjs samtidiga trafik (delad
      // hem-IP, se app.ts:s globalLimiter-kommentar) kunde trigga 429:or.
      const BATCH_SIZE = 4;
      const savedOccurrences: (Todo | null)[] = [];
      for (let i = 0; i < occurrences.length; i += BATCH_SIZE) {
        const batch = occurrences.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (todo) => {
            try {
              await todosApi.create(todo);
              return todo;
            } catch (error) {
              console.error(error);
              return null;
            }
          })
        );
        savedOccurrences.push(...results);
      }

      setTodos((current) =>
        expirePendingTodos(
          addMissingTodos(
            current,
            savedOccurrences.filter((todo): todo is Todo => todo !== null)
          ),
          currentTime
        )
      );
    } finally {
      syncInFlightRef.current = false;
    }
  }

  // Returnerar nu ett promise (2026-08-04, Zaidas fynd: "kvällsrutiner och
  // tvätt blir dubletter" efter en snabb Ångra-senaste-import→ny-import) —
  // fortsatt "skicka och glöm" för ALLA vanliga anropsställen (ingen av dem
  // väntar in det), men TodoImportExport.tsx:s runImport kan nu MEDVETET
  // invänta varje rad innan nästa påbörjas. Utan det kunde en snabbt
  // påföljande "Ångra"-radering hinna nå servern INNAN skapandet ens
  // hunnit sparas där — raderingen missade sitt mål, och den "ångrade"
  // uppgiften dök upp igen (som en dublett) vid nästa hämtning. Fångar
  // fortfarande felet internt (aldrig en avvisad promise) så inget annat
  // anropsställe som redan ignorerar returvärdet plötsligt får en ohanterad
  // avvisning i konsolen.
  // Resultatet avslöjar nu lyckat/misslyckat (2026-08-04, Zaidas fynd: en
  // stor CSV-import verkade lyckas — kategorier skapades — men uppgifterna
  // syntes aldrig, troligen ett tyst misslyckat serversvar som `.catch(console.error)`
  // dolde helt) — bara `TodoImportExport.tsx`:s `runImport` väntar in och
  // läser resultatet (verifierat, enda anroparen), så detta ändrar ingen
  // annan plats i appen; en obevakad (fire-and-forget) anropare påverkas
  // inte, promisen förkastas fortfarande aldrig.
  function createTodo(todo: Todo): Promise<{ ok: true } | { ok: false; error: unknown }> {
    const request = todosApi.create(todo).then(
      () => ({ ok: true as const }),
      (error: unknown) => {
        console.error(error);
        return { ok: false as const, error };
      }
    );
    setTodos((current) => [...current, todo]);
    return request;
  }

  function updateTodo(todoId: Id, patch: Partial<Todo>): Promise<{ ok: true } | { ok: false; error: unknown }> {
    const request = todosApi.update(todoId, patch).then(
      () => ({ ok: true as const }),
      (error: unknown) => {
        console.error(error);
        return { ok: false as const, error };
      }
    );
    setTodos((current) =>
      current.map((todo) => (todo.id === todoId ? { ...todo, ...patch } : todo))
    );
    return request;
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

  // "Någon håller på med den här"-indikator (2026-07-22) — targetMemberId är
  // medlemmen som läggs till/tas bort, inte nödvändigtvis den inloggade
  // (avatarväljaren i ParentTodoThreadView.tsx låter dig markera valfri
  // familjemedlem, samma "delat hushållsdon"-mönster som håll-in-flödet).
  function toggleTodoInProgress(todoId: Id, targetMemberId: Id) {
    const todo = todos.find((t) => t.id === todoId);
    if (!todo) return;
    const current = todo.inProgressBy ?? [];
    const alreadyIn = current.includes(targetMemberId);
    const nextList = alreadyIn ? current.filter((m) => m !== targetMemberId) : [...current, targetMemberId];
    const nextSince = nextList.length > 0 ? todo.inProgressSince ?? new Date().toISOString() : null;

    todosApi.toggleInProgress(todoId, targetMemberId).catch(console.error);
    setTodos((current) =>
      current.map((t) =>
        t.id === todoId ? { ...t, inProgressBy: nextList, inProgressSince: nextSince } : t
      )
    );
  }

  // Massradering i "Mina uppgifter" (2026-08-03, Zaidas önskemål): en uppgift
  // som inte är min egen (någon annan skapade/tilldelade den) ska bara sluta
  // vara tilldelad mig, inte raderas — familjens uppgifter tas bara bort från
  // Hem-vyns familjeflik. personalCategoryId nollställs samtidigt (samma
  // mönster som backend, se todosService.ts:s unassignSelf) så uppgiften
  // faktiskt blir en synlig familjeuppgift istället för att tyst försvinna.
  function unassignSelf(todoId: Id) {
    todosApi.unassignSelf(todoId).catch(console.error);
    setTodos((current) =>
      current.map((t) => (t.id === todoId ? { ...t, assignedTo: null, personalCategoryId: null } : t))
    );
  }

  function completeTodo(member: Member, todoId: Id, roles: Role[], elapsedMs: number | null = null) {
    const todoToComplete = todos.find((todo) => todo.id === todoId);
    if (!todoToComplete || !canCompleteTodo(member, roles, todoToComplete)) {
      return;
    }

    persistTodoIfGeneratedOccurrence(todoToComplete)
      .then(() => todosApi.complete(todoId, elapsedMs))
      .catch(console.error);
    trackEvent("todo-completed");

    setTodos((current) =>
      current.map((todo) =>
        todo.id !== todoId
          ? todo
          : {
              ...todo,
              status: "done" as const,
              completedAt: new Date().toISOString(),
              ...(todo.timerEnabled && elapsedMs !== null ? { elapsedMs } : {})
            }
      )
    );
  }

  // 2026-07-28, Zaidas fynd: "när jag klickar in i barnvyn ser jag uppgifter
  // där som jag inte får bort" — grundorsak: "Ta bort serien" (Återkommande
  // uppgifter) raderade bara MALLEN. En redan genererad dagens-occurrence är
  // ett eget, separat Todo-dokument (recurringSourceId pekar på mallen) och
  // fanns kvar orört — stoppar bara FRAMTIDA dagars kopior, exakt som
  // recurringTodos.ts:s egen kommentar om Återanvänd-funktionen redan säger,
  // men ingen hade kopplat det till radering tidigare. Raderar man mallen
  // (recurringSourceId===null, recurrence.type!=="none") tas nu även alla
  // dess ännu ej raderade occurrences bort i samma svep.
  // Returnerar nu ett promise som avslöjar lyckat/misslyckat (2026-08-05,
  // Zaidas fynd: en stor CSV-massradering via Radera-kolumnen gav
  // "net::ERR_INSUFFICIENT_RESOURCES" — den anropande koden (TodoImportExport.tsx:s
  // runImport) körde tidigare denna funktion helt osynkroniserat rad för
  // rad, samma "skicka-och-glöm"-fälla som redan fixades för skapande/
  // uppdatering 2026-08-04, men aldrig applicerad på radering. En radering
  // kan påverka FLERA todos samtidigt (en återkommande mall + dess redan
  // genererade dagens-occurrence, cascade-raderas ihop) — Promise.all
  // väntar in alla, `ok` är sant bara om SAMTLIGA lyckades.
  function softDeleteTodo(todoId: Id, member: Member, roles: Role[]): Promise<{ ok: boolean }> {
    const requests: Promise<boolean>[] = [];
    // Måste avgöras INNAN setTodos-uppdateraren körs (2026-08-05, Zaidas
    // fynd: "varför fungerar det inte att radera... vad gör jag för fel?")
    // — en riktig, allvarlig bugg i gårdagens fix: om targetTodo:n hittas
    // men canDeleteTodo (shared/permissions.ts — kräver createdBy===member.id
    // ELLER canDeleteAnyTodos, INTE bara assignedTo) blockerar den, pushades
    // ALDRIG något till requests — Promise.all([]).every(Boolean) på en TOM
    // array är sant genom "vacuous truth", så funktionen rapporterade
    // {ok:true} trots att NOLL todos faktiskt raderades. TodoImportExport.tsx:s
    // runImport räknade då raden som lyckad ("N raderade" i resultatet) trots
    // att uppgiften låg orörd kvar — en tyst lögn, exakt matchande symptomet.
    // Avgör nu explicit om målet HITTADES ALLS (oavsett behörighet), så en
    // permissions-blockerad radering korrekt rapporteras som misslyckad
    // istället för att smygas in som "lyckad" via en tom array.
    let targetFound = false;
    setTodos((current) => {
      const target = current.find((t) => t.id === todoId);
      targetFound = !!target;
      const isRecurringTemplate =
        !!target && target.recurringSourceId === null && target.recurrence.type !== "none";

      return current.map((todo) => {
        const isTarget = todo.id === todoId;
        const isActiveOccurrenceOfTarget =
          isRecurringTemplate && todo.recurringSourceId === todoId && todo.deletedAt === null;
        if ((!isTarget && !isActiveOccurrenceOfTarget) || !canDeleteTodo(member, roles, todo)) {
          return todo;
        }

        requests.push(
          todosApi.remove(todo.id).then(
            () => true,
            (error) => {
              console.error(error);
              return false;
            }
          )
        );
        return {
          ...todo,
          deletedAt: new Date().toISOString(),
          deletedBy: member.id
        };
      });
    });
    if (targetFound && requests.length === 0) {
      // Hittades, men canDeleteTodo blockerade den — t.ex. en uppgift skapad
      // av någon annan, tilldelad mig men inte skapad av mig (assignedTo
      // räcker INTE för radering, bara createdBy eller canDeleteAnyTodos).
      return Promise.resolve({ ok: false });
    }
    return Promise.all(requests).then((results) => ({ ok: requests.length > 0 && results.every(Boolean) }));
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

  // ADR-0025 (2026-07-23) — permanent, oåterkallelig tömning av papperskorgen.
  async function purgeTodosTrash() {
    await todosApi.purgeTrash();
    setTodos((current) => current.filter((todo) => todo.deletedAt === null));
  }

  // Samma ADR-0025-undantag, per rad (2026-08-05, Zaidas önskemål: "möjlighet
  // att ångra eller att göra en hard delete" per uppgift i TrashView.tsx).
  // Rör inte den centrala todos-listan — mjuk-raderade todos finns inte kvar
  // där sedan pagineringen 2026-07-26 (TrashView.tsx:s egen
  // useTodosHistoryState äger den listan och tar bort raden lokalt själv).
  async function purgeTodo(todoId: Id) {
    await todosApi.purge(todoId);
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
        ...applyTemplateToOccurrence(existingOccurrence, routine, fixedTodoTimes),
        ...pendingPatch
      });
      return;
    }

    const [newOccurrence] = getDueRecurringTodoOccurrences([routine], new Date(), fixedTodoTimes);
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
    toggleTodoInProgress,
    unassignSelf,
    completeTodo,
    softDeleteTodo,
    restoreTodo,
    purgeTodosTrash,
    purgeTodo,
    approveTodo,
    rejectTodo,
    dismissRejectedTodo,
    softDeleteTodosForMember,
    refreshRoutineOccurrence,
    lastImportResult,
    setLastImportResult,
    lastImportUndo,
    setLastImportUndo
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

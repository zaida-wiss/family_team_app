import { useEffect, useRef, useState } from "react";
import { todosApi } from "../../api";
import { canCompleteTodo, canDeleteTodo } from "../../utils/permissions";
import { applyTemplateToOccurrence, getDateKey, getDueRecurringTodoOccurrences } from "./recurringTodos";
import type { Id, Member, Role, Todo } from "@shared/types";
import { trackEvent } from "../../utils/analytics";
import { readCache, writeCache } from "../../utils/localCache";

const TODOS_CACHE_KEY = "todos_v1";

export type ImportUndo = {
  // Uppdaterade rader: id + de värden de hade INNAN denna import.
  updated: { id: Id; previous: Partial<Todo> }[];
  // Nyskapade rader: bara deras id, ångras med en mjuk radering.
  createdIds: Id[];
  // Cross-account-rader (2026-08-08, Familj-kolumnen routad till ETT AV
  // MINA ANDRA konton) — spåras separat eftersom de kräver ett accountId
  // för att ångras korrekt (deleteCrossAccountTodo/updateCrossAccountTodo
  // istället för de lokala onDeleteTodo/onUpdateTodo). Optional/additiv,
  // ingen brytande ändring för befintlig kod.
  crossAccountCreated?: { id: Id; accountId: Id }[];
  crossAccountUpdated?: { id: Id; accountId: Id; previous: Partial<Todo> }[];
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
  // Rekord-firande (2026-08-09, Zaidas önskemål: "skulle det kunna komma en
  // pokal med tiden över skärmen då? och att det blinkar lite grönt i
  // bakgrunden") — servern räknar redan ut isNewRecord när en ÖPPEN
  // tidtagen uppgift avklaras (todosService.ts:s recordAutoTimedAttempt),
  // men kastade det bort direkt. Nu skickas det med i completeTodo:s svar
  // och sätts här, renderas som en overlay på Shell.tsx-nivå (oavsett vilken
  // av barnets/vuxnas/familjens vyer uppgiften avklarades ifrån).
  const [recordCelebration, setRecordCelebration] = useState<{ title: string; elapsedMs: number } | null>(null);
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
  // updateTodo skydd mot omkastad nätverksordning (2026-08-12, hittat under
  // felsökning av TodoEditModal.tsx:s autospara för återkommande uppgifter:
  // ett fältbyte som pausas >700ms mitt i, t.ex. kategori valt, sedan en
  // paus, sedan emoji valt) kan trigga TVÅ separata debounce-varv — en
  // tidig autospara med det GAMLA fältvärdet, sedan en till med det NYA.
  // Två oberoende, samtidiga fetch()-anrop mot SAMMA todo-id har ingen
  // garanterad ankomstordning (bekräftat: 60-67% felfrekvens under CPU-
  // belastning, se sprintbackloggen) — anländer den tidiga (inaktuella)
  // skrivningen sist vinner den, och det NYA fältvärdet skrivs tyst över.
  // En kö per todo-id garanterar att skrivning nummer två inte ens SKICKAS
  // förrän skrivning nummer ett har landat — samma anropsordning som
  // ankomstordning, utan att fördröja det VANLIGA fallet (en enda
  // uppdatering per id, kön är då bara ett redan avklarat promise).
  const updateChains = useRef<Map<Id, Promise<unknown>>>(new Map());
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
    // INTE längre uppskjuten till idle (2026-08-05, uppföljning av S1a) —
    // en Lighthouse-körning mot produktion visade att todos (45 KB) är en
    // av tio hookar vars idle-uppskjutna förstahämtning alla konkurrerar om
    // webbläsarens begränsade antal parallella anslutningar under en trög
    // uppkoppling, vilket fastnade i LCP:s kritiska nätverkskedja (3,7s) —
    // samma "trängsel"-mönster som redan lösts för /api/calendars samma
    // dag. Todos-datan renderas direkt i Hem-vyns familjeflikar, precis som
    // kalenderns egna händelser, så den bör inte vänta på idle heller.
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
        //
        // Jämför ÄVEN subtasks (2026-08-08) — toggleSubtask ändrar aldrig
        // status (bara ett enskilt delmoments done-fält), så en jämförelse
        // som bara tittar på status hade släppt skyddet på FÖRSTA refresh
        // efter en avbockning, oavsett om just DEN mutationen faktiskt
        // hunnit landa på servern än.
        const subtasksMatch = JSON.stringify(todo.subtasks) === JSON.stringify(optimistic.subtasks);
        if (todo.status === optimistic.status && subtasksMatch) {
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
    // Väntar in en redan pågående skrivning mot SAMMA id (om någon) innan
    // denna faktiskt skickas — se updateChains-kommentaren ovan. .catch här
    // är bara för att en tidigare skrivnings fel inte ska avbryta KEDJAN
    // (denna skrivning ska ändå skickas); det verkliga felet hanteras redan
    // av den tidigare anropets egen .then/catch nedan.
    const previous = updateChains.current.get(todoId) ?? Promise.resolve();
    const request = previous
      .catch(() => {})
      .then(() => todosApi.update(todoId, patch))
      .then(
        () => ({ ok: true as const }),
        (error: unknown) => {
          console.error(error);
          return { ok: false as const, error };
        }
      );
    updateChains.current.set(todoId, request);
    setTodos((current) =>
      current.map((todo) => (todo.id === todoId ? { ...todo, ...patch } : todo))
    );
    return request;
  }

  // Föräldravyn med delmoment (Sprint 6 S3) — bockar av/på ett enskilt delmoment,
  // oberoende av övriga delmoment och av complete/approve/reject-flödet.
  //
  // pendingMutationIds-skyddat (2026-08-08, Zaidas fynd: "ingenting av det
  // jag kryssat för av avklarat sparas... det blir ett streck i en halv
  // sekund, sedan stängs modalen, sedan öppnas den igen och inget är
  // markerat längre") — samma bugklass som redan dokumenterats och fixats
  // för approve/reject (se refreshTodos-kommentaren): backendens egen
  // toggleSubtask broadcastar todos-changed EFTER varje toggle, vilket
  // triggar en SSE-driven refreshTodos() på samma klient. toggleSubtask var
  // den ENDA muterande funktionen i den här filen som aldrig lade sitt eget
  // todo-id i pendingMutationIds — en helt VANLIG, oberoende bakgrunds-
  // refresh (SSE, 30s-intervallet, ett annat konto-medlemsjobb) kunde alltså
  // fritt skriva över den optimistiska avbockningen med en server-snapshot
  // hämtad EFTER den optimistiska uppdateringen men INNAN just den här
  // PATCH:en hunnit committa — UI:t "studsade tillbaka" till obockat.
  async function toggleSubtask(todoId: Id, subtaskId: Id) {
    const previousTodo = todosRef.current.find((t) => t.id === todoId);
    setTodos((current) =>
      current.map((todo) =>
        todo.id !== todoId
          ? todo
          : {
              ...todo,
              subtasks: todo.subtasks?.map((s) =>
                s.id === subtaskId ? { ...s, done: !s.done, completedAt: !s.done ? new Date().toISOString() : null } : s
              )
            }
      )
    );
    pendingMutationIds.current.add(todoId);
    try {
      await todosApi.toggleSubtask(todoId, subtaskId);
      await refreshTodos();
    } catch (error) {
      console.error(error);
      pendingMutationIds.current.delete(todoId);
      if (previousTodo) {
        setTodos((current) => current.map((todo) => (todo.id === todoId ? previousTodo : todo)));
      }
    }
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

  function completeTodo(member: Member, todoId: Id, roles: Role[], elapsedMs: number | null = null) {
    const todoToComplete = todos.find((todo) => todo.id === todoId);
    if (!todoToComplete || !canCompleteTodo(member, roles, todoToComplete)) {
      return;
    }

    persistTodoIfGeneratedOccurrence(todoToComplete)
      .then(() => todosApi.complete(todoId, elapsedMs))
      .then((res) => {
        if (res.isNewRecord && elapsedMs !== null) {
          setRecordCelebration({ title: todoToComplete.title, elapsedMs });
        }
      })
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
        // "done"/"approved" occurrences cascade-raderas MEDVETET INTE
        // (2026-08-05, Zaidas önskemål) — de ska finnas kvar så ikonen syns
        // i barnets tidslinje (ChildTimeline.tsx:s completedTodos-filter
        // läser exakt dessa två statusar). En mall som tas bort tar alltså
        // bara med sig sina ännu OavgJorda (pending/rejected/expired)
        // occurrences, inte redan avklarad historik.
        const isActiveOccurrenceOfTarget =
          isRecurringTemplate &&
          todo.recurringSourceId === todoId &&
          todo.deletedAt === null &&
          todo.status !== "done" &&
          todo.status !== "approved";
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

  // Ångra klarmarkering (2026-08-10, Zaidas önskemål: barnet ska kunna ångra
  // ett håll-in som gjordes av misstag, via håll-in+dra-uppåt-gesten på
  // ChildPendingBadges.tsx) — samma canCompleteTodo-behörighet och samma
  // pendingMutationIds-skydd mot en oberoende bakgrundsrefresh som redan
  // används av approveTodo/rejectTodo (se refreshTodos-kommentaren) — utan
  // det kunde en SSE-driven refresh mitt i anropet skriva tillbaka "done"
  // innan denna mutation hunnit committa på servern.
  function uncompleteTodo(member: Member, todoId: Id, roles: Role[]) {
    const previousTodo = todosRef.current.find((t) => t.id === todoId);
    if (!previousTodo || previousTodo.status !== "done" || !canCompleteTodo(member, roles, previousTodo)) {
      return;
    }

    setTodos((current) =>
      current.map((todo) =>
        todo.id === todoId
          ? { ...todo, status: "pending" as const, completedAt: null, elapsedMs: null }
          : todo
      )
    );
    pendingMutationIds.current.add(todoId);

    todosApi
      .uncomplete(todoId)
      .then(() => refreshTodos())
      .catch((error) => {
        console.error(error);
        pendingMutationIds.current.delete(todoId);
        setTodos((current) => current.map((todo) => (todo.id === todoId ? previousTodo : todo)));
      });
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

  // templatePatch (2026-08-07, Zaidas fynd: "uppdatera todon till kategori
  // Fordon & Underhåll och ändra emoji... fungerar inte") — TodoEditModal.tsx
  // anropar onUpdateTodo(template.id, seriesPatch) och sedan OMEDELBART
  // (samma synkrona anrop) onRefreshRoutine(template.id). setTodos:s
  // uppdatering hinner inte hunnit slå igenom i todosRef.current än (den
  // synkas via en useEffect, som körs EFTER denna funktion redan returnerat)
  // — routine hittades alltså med GÅRDAGENS värden, och applyTemplateToOccurrence
  // kopierade tillbaka den gamla kategorin/emojin på dagens occurrence, både
  // lokalt OCH till servern (via updateTodo). templatePatch är de redan
  // KÄNDA, precis sparade fälten — mergas ovanpå den (annars korrekta)
  // ref-uppslagningen istället för att lita på att den hunnit uppdateras.
  function refreshRoutineOccurrence(routineId: Id, templatePatch?: Partial<Todo>) {
    const current = todosRef.current;
    const routineBase = current.find((todo) => todo.id === routineId);
    if (!routineBase) {
      return;
    }
    const routine = templatePatch ? { ...routineBase, ...templatePatch } : routineBase;

    const today = getDateKey(new Date());
    // En mall med flera tidsrutor (2026-08-09, samma fynd som
    // windowForOccurrence i recurringTodos.ts: "jag uppdaterade
    // anteckningar... och uppgiften försvann igen") kan ha FLERA occurrences
    // samma dag (morgon+kväll) — .find() plockade tidigare bara EN, så en
    // redigering synkade aldrig den andra rutans occurrence (den förblev
    // osynlig/inaktuell tills den genererades om nästa dag). Synka ALLA
    // redan existerande, generera de som fortfarande saknas.
    const existingOccurrences = current.filter(
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

    for (const existingOccurrence of existingOccurrences) {
      // Synka samtidigt med mallens aktuella värden — annars visas fortsatt
      // gårdagens/en redigerad tid/titel trots att uppdraget "visas igen".
      updateTodo(existingOccurrence.id, {
        ...applyTemplateToOccurrence(existingOccurrence, routine, fixedTodoTimes),
        ...pendingPatch
      });
    }

    // getDueRecurringTodoOccurrences([routine], ...) känner bara till
    // MALLEN själv (inte current) — dess egen "redan existerar"-koll ser
    // därför alltid tom och skulle annars duplicera en ruta som redan
    // synkades ovan. Filtrera bort dem explicit istället.
    const existingIds = new Set(existingOccurrences.map((t) => t.id));
    const missingOccurrences = getDueRecurringTodoOccurrences(
      [routine], new Date(), fixedTodoTimes
    ).filter((occ) => !existingIds.has(occ.id));
    if (missingOccurrences.length > 0) {
      for (const occ of missingOccurrences) {
        todosApi.create(occ).catch(console.error);
      }
      setTodos((items) => addMissingTodos(items, missingOccurrences));
    }
  }

  return {
    todos,
    createTodo,
    updateTodo,
    toggleSubtask,
    toggleTodoInProgress,
    completeTodo,
    uncompleteTodo,
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
    setLastImportUndo,
    recordCelebration,
    setRecordCelebration
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

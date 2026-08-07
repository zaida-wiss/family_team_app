import { describe, test, expect } from "vitest";
import {
  buildTemplateCsv,
  parseCsvText,
  parseTodoCsv,
  todosToCsv,
  TODO_CSV_HEADERS
} from "../src/features/todos/todoCsv";
import { createMember, createTodo } from "./testUtils";

describe("todoCsv", () => {
  test("parseCsvText hanterar citerade fält med kommatecken, citattecken och radbrytning", () => {
    const table = parseCsvText(
      'Titel,Anteckningar\r\n"Handla mat","Mjölk, bröd och ""specialost"""\r\n"Städa","Rad ett\nrad två"'
    );
    expect(table).toEqual([
      ["Titel", "Anteckningar"],
      ["Handla mat", 'Mjölk, bröd och "specialost"'],
      ["Städa", "Rad ett\nrad två"]
    ]);
  });

  // 2026-08-03: mallen fick två nya kolumner (Fler tidsrutor/Slutar) och två
  // nya exempelrader som visar dem — Zaidas exakta önskemål om tidsbegränsade
  // återkommande uppgifter (synlig kl. X, försvinner kl. Y, nästa dags kopia
  // oberoende av gårdagens). 2026-08-04: en tredje ny kolumn (Radera) och en
  // femte exempelrad som visar den.
  // 2026-08-06: mallen fick två nya exempelrader (en engångsuppgift som
  // stannar kvar tills avklarad, och en timer-uppgift) — Zaidas önskemål om
  // att tydligt visa "kvarstående vs. försvinner efter en tid vs.
  // återkommande vs. timer" i en och samma nedladdningsbara mall.
  test("buildTemplateCsv innehåller alla rubriker plus exempel för kvarstående-, försvinner-, enkel återkommande-, flera-tidsrutor-, slutar-, timer- och radera-uppgifter", () => {
    const csv = buildTemplateCsv();
    const table = parseCsvText(csv);
    const headerIndex = new Map(table[0].map((h, i) => [h, i]));
    expect(table[0]).toEqual([...TODO_CSV_HEADERS]);
    expect(table.length).toBe(9);
    const titleCol = headerIndex.get("Titel")!;
    expect(table[1][titleCol]).toBe("Handla mat");
    expect(table[1][headerIndex.get("Startdatum")!]).toBe("");
    expect(table[1][headerIndex.get("Slutdatum")!]).toBe("");
    expect(table[2][titleCol]).toBe("Hämta paket");
    expect(table[2][headerIndex.get("Slutdatum")!]).not.toBe("");
    expect(table[3][titleCol]).toBe("Andningsövning");
    expect(table[3][headerIndex.get("Återkommer")!]).toBe("Dag");
    expect(table[4][titleCol]).toBe("Borsta tänderna");
    expect(table[4][headerIndex.get("Fler tidsrutor")!]).toBe("19:00-19:15");
    expect(table[5][titleCol]).toBe("Öva piano");
    expect(table[5][headerIndex.get("Slutar")!]).toBe("30");
    expect(table[6][titleCol]).toBe("Städa rummet");
    expect(table[6][headerIndex.get("Timer")!]).toBe("Ja");
    expect(table[6][headerIndex.get("Timer (min)")!]).toBe("25");
    expect(table[7][headerIndex.get("Id")!]).toBe("todo-x-från-en-export");
    expect(table[7][headerIndex.get("Radera")!]).toBe("Ja");
    // 2026-08-06: en åttonde exempelrad visar Familj-kolumnen ifylld — bara
    // förekommande på riktiga exporterade rader från "Andra familjer", tom
    // annars (se raderna ovan, alla har en tom Familj-cell).
    expect(table[8][headerIndex.get("Familj")!]).toBe("Familjen Andersson");
    for (let i = 1; i <= 7; i++) {
      expect(table[i][headerIndex.get("Familj")!]).toBe("");
    }
  });

  test("parseTodoCsv: giltig rad tilldelad Mig själv med ny kategori", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = [
      "Titel,Tilldelad,Egen kategori,Stjärnor,Startdatum,Slutdatum,Anteckningar",
      "Handla mat,Mig själv,Hushåll,,2026-07-10,2026-07-11,Mjölk och bröd"
    ].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Handla mat",
      assignedTo: "mem-1",
      newCategoryName: "Hushåll",
      personalCategoryId: null,
      starValue: 0,
      notes: "Mjölk och bröd"
    });
    // new Date(iso).toISOString() är UTC — jämför via lokala getters (samma
    // som isoToDateOnly gör) istället för en naiv sträng-prefix-koll, annars
    // beror testet på testmiljöns tidszon.
    expect(new Date(rows[0].visibleFrom!).getDate()).toBe(10);
    expect(new Date(rows[0].expiresAt!).getDate()).toBe(11);
  });

  test("parseTodoCsv: matchar befintlig kategori och tilldelar ett barn med stjärnor", () => {
    const members = [
      createMember("mem-1", { name: "Zaida" }),
      createMember("mem-child", { name: "Alva", isChild: true })
    ];
    const categories = [
      { id: "cat-1", accountId: "acc-1", memberId: "mem-1", name: "Hushåll", createdAt: "", deletedAt: null, deletedBy: null }
    ];
    const csv = [
      "Titel,Tilldelad,Egen kategori,Stjärnor,Startdatum,Slutdatum,Anteckningar",
      "Plocka undan,Alva,Hushåll,3,,,"
    ].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, categories, "mem-1");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      title: "Plocka undan",
      assignedTo: "mem-child",
      starValue: 3,
      // Kategori gäller sedan ADR-0020 vilken mottagare som helst, inte bara
      // Mig själv-rader.
      personalCategoryId: "cat-1",
      newCategoryName: null
    });
  });

  // 2026-08-06, Zaidas fynd: familjekategorier med samma namn som en redan
  // existerande PERSONLIG kategori (t.ex. "Rutiner") gjorde att en
  // familje-import tyst kapade den personliga kategorin istället för att
  // matcha/skapa en riktig familjekategori — todon fanns i CSV-exporten men
  // var osynlig i familjevyn (getFamilyViewTodos filtrerar bort allt vars
  // personalCategoryId pekar på en icke-familjekategori).
  test("parseTodoCsv: en familje-import matchar bara en familjekategori, aldrig en likanämnd personlig", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const categories = [
      { id: "cat-personal", accountId: "acc-1", memberId: "mem-1", name: "Rutiner", isFamily: false, createdAt: "", deletedAt: null, deletedBy: null },
      { id: "cat-family", accountId: "acc-1", memberId: "mem-1", name: "Rutiner", isFamily: true, createdAt: "", deletedAt: null, deletedBy: null }
    ];
    const csv = ["Titel,Tilldelad,Egen kategori", "Kvällsrutiner,Familjen,Rutiner"].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, categories, "mem-1", null, true);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      assignedTo: null,
      personalCategoryId: "cat-family",
      newCategoryName: null
    });
  });

  test("parseTodoCsv: en personlig import matchar bara en personlig kategori, aldrig en likanämnd familjekategori", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const categories = [
      { id: "cat-personal", accountId: "acc-1", memberId: "mem-1", name: "Rutiner", isFamily: false, createdAt: "", deletedAt: null, deletedBy: null },
      { id: "cat-family", accountId: "acc-1", memberId: "mem-1", name: "Rutiner", isFamily: true, createdAt: "", deletedAt: null, deletedBy: null }
    ];
    const csv = ["Titel,Tilldelad,Egen kategori", "Läsa bok,Mig själv,Rutiner"].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, categories, "mem-1");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      assignedTo: "mem-1",
      personalCategoryId: "cat-personal",
      newCategoryName: null
    });
  });

  // Ingen befintlig kategori i rätt scope — ska föreslå en NY kategori
  // (matchande isFamily-beslutet i TodoImportExport.tsx:s runImport), inte
  // felaktigt återanvända den enda likanämnda men fel-scopade kategorin.
  test("parseTodoCsv: saknas en familjekategori med rätt namn föreslås en NY, trots en likanämnd personlig kategori", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const categories = [
      { id: "cat-personal", accountId: "acc-1", memberId: "mem-1", name: "Rutiner", isFamily: false, createdAt: "", deletedAt: null, deletedBy: null }
    ];
    const csv = ["Titel,Tilldelad,Egen kategori", "Kvällsrutiner,Familjen,Rutiner"].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, categories, "mem-1", null, true);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      personalCategoryId: null,
      newCategoryName: "Rutiner"
    });
  });

  test("parseTodoCsv: rad utan titel hoppas tyst över", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = ["Titel,Tilldelad", ","].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
    expect(rows).toEqual([]);
    expect(errors).toEqual([]);
  });

  // 2026-07-07 (Zaidas resonemang om att dela listor mellan familjer): ett
  // okänt "Tilldelad"-namn hoppas INTE längre över — raden flaggas som olöst
  // (unresolvedAssigneeLabel) så importören kan mappa namnet till en egen
  // medlem i TodoImportExport.tsx, istället för att tyst tappa raden.
  test("parseTodoCsv: okänt Tilldelad-namn flaggar raden som olöst istället för att hoppa över den", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = ["Titel,Tilldelad", "Diska,Okänd Person"].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].unresolvedAssigneeLabel).toBe("Okänd Person");
  });

  test("parseTodoCsv: saknad Titel-kolumn ger ett tydligt fel", () => {
    const { rows, errors } = parseTodoCsv("Namn,Övrigt\r\nnågot,annat", [], [], "mem-1");
    expect(rows).toEqual([]);
    expect(errors[0]).toContain("Titel");
  });

  // 2026-08-05, Zaidas fynd: en fil redigerad i ett externt program hade fått
  // å/ä/ö i rubrikraden förvanskade ("Ãterkommer" istället för "Återkommer",
  // "StjÃ¤rnor" istället för "Stjärnor") — de ENDA två rubrikerna med å/ä/ö i
  // sitt korrekta namn, exakt matchning mot rätt stavning missar dem då
  // alltid. Utan denna varning hade raderna importerats ändå, bara tyst som
  // engångsuppgifter (fel enstaka datum) istället för återkommande.
  test("parseTodoCsv: förvanskad teckenkodning i rubrikraden (Ã-tecken) ger ett tydligt fel istället för att tyst tappa Återkommer/Stjärnor", () => {
    const csv = [
      "Titel,Emoji,Tilldelad,Egen kategori,StjÃ¤rnor,Timer,Timer (min),Startdatum,Slutdatum,Fler tidsrutor,Ãterkommer,Intervall,Veckodagar,Slutar,Delmoment,Anteckningar,Id,Radera",
      "Daglig Tvätt,🧺,Familjen,,,,,2026-08-04 16:30,2026-08-04 17:00,,Dag,1,,,,,,"
    ].join("\r\n");
    const { rows, errors } = parseTodoCsv(csv, [], [], "mem-1");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("teckenkodning");
    expect(errors[0]).toContain("Återkommer");
  });

  test("parseTodoCsv: en vanlig, oskadad fil med korrekta å/ä/ö-rubriker påverkas inte av mojibake-kontrollen", () => {
    const members = [createMember("mem-child-1", { name: "Nova", isChild: true })];
    const csv = [
      "Titel,Tilldelad,Stjärnor,Startdatum,Återkommer,Intervall",
      "Läxor,Nova,3,2026-08-04,Dag,1"
    ].join("\r\n");
    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].starValue).toBe(3);
    expect(rows[0].recurrence).toEqual({ type: "recurring", unit: "day", every: 1, daysOfWeek: null });
  });

  // 2026-08-04, Zaidas önskemål: "ladda ner alla todos, uppdatera, lägga till
  // nya och radera de jag inte vill ha kvar längre, sedan importera" — en
  // Radera-kolumn med "Ja" och ett Id markerar raden för radering istället
  // för skapande/uppdatering, kort-slutar all annan kolumntolkning.
  test("parseTodoCsv: Radera=Ja med ett Id ger en deleteRow-markerad rad, övriga fält oanvända defaults", () => {
    const csv = ["Titel,Startdatum,Id,Radera", "Gammal uppgift,2026-01-01,todo-123,Ja"].join("\r\n");
    const { rows, errors } = parseTodoCsv(csv, [], [], "mem-1");
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ deleteRow: true, sourceId: "todo-123", title: "Gammal uppgift" });
  });

  test("parseTodoCsv: Radera=Ja utan ett Id ger ett tydligt fel, raden hoppas över", () => {
    const csv = ["Titel,Radera", "Gammal uppgift,Ja"].join("\r\n");
    const { rows, errors } = parseTodoCsv(csv, [], [], "mem-1");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Id");
  });

  test("parseTodoCsv: en tom eller annan Radera-cell behandlas som en vanlig rad (deleteRow: false)", () => {
    const csv = ["Titel,Id,Radera", "Handla mat,todo-1,", "Städa,todo-2,Nej"].join("\r\n");
    const { rows, errors } = parseTodoCsv(csv, [], [], "mem-1");
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0].deleteRow).toBe(false);
    expect(rows[1].deleteRow).toBe(false);
  });

  test("todosToCsv → parseTodoCsv tur och retur bevarar lokalt datum oavsett tidszon", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const original = createTodo({
      id: "t1",
      title: "Tandläkarbesök",
      createdBy: "mem-1",
      assignedTo: "mem-1",
      visibleFrom: new Date(2026, 6, 10, 0, 0, 0).toISOString(),
      expiresAt: new Date(2026, 6, 11, 0, 0, 0).toISOString()
    });

    const csv = todosToCsv([original], members, "mem-1", []);
    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");

    expect(errors).toEqual([]);
    expect(new Date(rows[0].visibleFrom!).getDate()).toBe(10);
    expect(new Date(rows[0].expiresAt!).getDate()).toBe(11);
  });

  // 2026-08-03: todosToCsv:s egen assignedTo/createdBy-filtrering togs bort
  // (var av misstag för snäv för familje-scope, se todoCsv.ts) — funktionen
  // exporterar nu exakt det som skickas in (bara deletedAt/recurringSourceId
  // filtreras internt), CALLERN (TodoImportExport.tsx:s kryssrutor,
  // ParentTodoThreadView.tsx:s per-kategori-export) ansvarar för resten.
  test("todosToCsv exporterar INKLUSIVE återkommande mallar och andras uppgifter, men inte occurrences/raderade", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const todos = [
      createTodo({ id: "t1", title: "Min uppgift", createdBy: "mem-1", assignedTo: "mem-1", starValue: 0, notes: "Anteckning" }),
      createTodo({ id: "t2", title: "Annans uppgift", createdBy: "mem-2", assignedTo: "mem-2" }),
      createTodo({ id: "t3", title: "Raderad", createdBy: "mem-1", assignedTo: "mem-1", deletedAt: "2026-01-01T00:00:00.000Z" }),
      createTodo({ id: "t4", title: "Återkommande mall", createdBy: "mem-1", assignedTo: "mem-1", recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null } }),
      createTodo({ id: "t5", title: "En occurrence", createdBy: "mem-1", assignedTo: "mem-1", recurringSourceId: "t4" })
    ];

    const csv = todosToCsv(todos, members, "mem-1", []);
    const table = parseCsvText(csv);
    const titleCol = table[0].indexOf("Titel");
    const titles = table.slice(1).map((row) => row[titleCol]);
    expect(titles).toEqual(["Min uppgift", "Annans uppgift", "Återkommande mall"]);
  });

  // 2026-08-06, Zaidas önskemål: "gör det tydligare i mallen och import och
  // export vilken familj uppgiften tillhör. Om det står tomt där så tillhör
  // den kontoinnehavaren själv" — rena visningskolumnen "Familj", bara
  // ifylld för rader som kommer från "Andra familjer" (TodoImportExport.tsx:s
  // otherFamilies-parameter), aldrig läst vid import.
  test("todosToCsv: Familj-kolumnen tom för mina egna, kontonamnet för en rad från en annan familj", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const own = createTodo({ id: "t1", title: "Min uppgift", createdBy: "mem-1", assignedTo: "mem-1" });
    const foreign = createTodo({
      id: "t2", title: "Handla present", createdBy: "mem-annan", assignedTo: null, personalCategoryId: "cat-foreign"
    });

    const csv = todosToCsv([own], members, "mem-1", [], [
      { accountName: "Familjen Andersson", todos: [foreign], categoryNames: { "cat-foreign": "Present" } }
    ]);
    const table = parseCsvText(csv);
    const headerIndex = new Map(table[0].map((h, i) => [h, i]));
    const titleCol = headerIndex.get("Titel")!;

    expect(table[1][titleCol]).toBe("Min uppgift");
    expect(table[1][headerIndex.get("Familj")!]).toBe("");
    expect(table[2][titleCol]).toBe("Handla present");
    expect(table[2][headerIndex.get("Familj")!]).toBe("Familjen Andersson");
    expect(table[2][headerIndex.get("Egen kategori")!]).toBe("Present");

    // En Familj-cell som inte matchar en KÄND annan familj (2026-08-08,
    // otherFamiliesForImport tom här) flaggas nu som fel och hoppas över —
    // se det egna testblocket "parseTodoCsv: Familj-kolumnen" nedan för det
    // fullständiga, lyckade cross-account-flödet.
    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
    expect(errors).toEqual([
      'Rad 3 ("Handla present"): okänd familj "Familjen Andersson" i Familj-kolumnen — du måste vara medlem där via Mina familjekonton för att importera dit, raden hoppas över.'
    ]);
    expect(rows).toHaveLength(1);
  });

  test("todosToCsv skriver Familjen som Tilldelad-etikett för en otilldelad uppgift", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const todo = createTodo({ id: "t1", title: "Handla mat", createdBy: "mem-1", assignedTo: null });
    const csv = todosToCsv([todo], members, "mem-1", []);
    const table = parseCsvText(csv);
    const assignedCol = table[0].indexOf("Tilldelad");
    expect(table[1][assignedCol]).toBe("Familjen");
  });

  // 2026-08-05, Zaidas önskemål: "en kolumn med datum då todon skapats, samt
  // datum då todon ändrats" — rent informativa, serverstyrda revisionsstämplar
  // (Todo.createdAt/updatedAt), i lokal tid via samma isoToDateTimeDisplay som
  // Startdatum/Slutdatum redan använder.
  test("todosToCsv skriver Skapad/Ändrad i lokal tid, tomma om fälten saknas (ej ommigrerad todo)", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const withTimestamps = createTodo({
      id: "t1", title: "Handla mat", createdBy: "mem-1",
      createdAt: "2026-08-01T09:15:00.000Z", updatedAt: "2026-08-03T18:30:00.000Z"
    });
    const withoutTimestamps = createTodo({ id: "t2", title: "Städa", createdBy: "mem-1" });
    const csv = todosToCsv([withTimestamps, withoutTimestamps], members, "mem-1", []);
    const table = parseCsvText(csv);
    const createdCol = table[0].indexOf("Skapad");
    const updatedCol = table[0].indexOf("Ändrad");

    const created = new Date("2026-08-01T09:15:00.000Z");
    const updated = new Date("2026-08-03T18:30:00.000Z");
    const pad = (n: number) => String(n).padStart(2, "0");
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    expect(table[1][createdCol]).toBe(fmt(created));
    expect(table[1][updatedCol]).toBe(fmt(updated));
    expect(table[2][createdCol]).toBe("");
    expect(table[2][updatedCol]).toBe("");
  });

  // Skapad/Ändrad är rent informativa vid export — en importerad/klistrad-in
  // cell där ska ALDRIG kunna påverka den skapade/uppdaterade todon, samma
  // "okänd extra kolumn ignoreras tyst"-princip som gäller vilken annan
  // ovan definierad kolumn som helst.
  test("parseTodoCsv: Skapad/Ändrad-kolumnerna ignoreras helt vid import, oavsett innehåll", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = "Titel,Skapad,Ändrad\r\nDiska,2020-01-01 00:00,vad-som-helst\r\n";
    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Diska");
  });

  test("parseTodoCsv: en tom Tilldelad-cell använder defaultAssignee (null för familje-import)", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = "Titel,Tilldelad\r\nDiska,\r\n";
    const { rows } = parseTodoCsv(csv, members, [], "mem-1", null);
    expect(rows[0].assignedTo).toBeNull();
  });

  test("parseTodoCsv: en Familjen-cell resolvear alltid till null, oavsett defaultAssignee", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = "Titel,Tilldelad\r\nDiska,Familjen\r\n";
    const { rows } = parseTodoCsv(csv, members, [], "mem-1", "mem-1");
    expect(rows[0].assignedTo).toBeNull();
  });

  test("todosToCsv → parseTodoCsv tur och retur bevarar återkommelse (enhet, intervall, veckodagar)", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const original = createTodo({
      id: "t1",
      title: "Träna",
      createdBy: "mem-1",
      assignedTo: "mem-1",
      visibleFrom: new Date(2026, 6, 6).toISOString(),
      recurrence: { type: "recurring", unit: "week", every: 2, daysOfWeek: ["monday", "wednesday"] }
    });

    const csv = todosToCsv([original], members, "mem-1", []);
    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");

    expect(errors).toEqual([]);
    expect(rows[0].recurrence).toEqual({
      type: "recurring",
      unit: "week",
      every: 2,
      daysOfWeek: ["monday", "wednesday"]
    });
  });

  // Zaida hittade "Intervall: undefined" + tom "Återkommer" i en riktig export
  // 2026-07-05 — grundorsaken var ännu omigrerad produktionsdata i den GAMLA
  // "weekly"-formen (bara daysOfWeek, inget unit/every), se ADR-0015.
  test("todosToCsv hanterar ännu omigrerad 'weekly'-produktionsdata (ADR-0015) utan 'undefined'", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const legacyTodo = createTodo({
      id: "t1",
      title: "Duka undan",
      createdBy: "mem-1",
      assignedTo: "mem-1",
      // any: simulerar en riktig, ännu omigrerad Mongoose-dokument-form som
      // TS-typen inte längre tillåter men databasen ändå kan innehålla.
      recurrence: { type: "weekly", daysOfWeek: ["monday", "tuesday"] } as never
    });

    const csv = todosToCsv([legacyTodo], members, "mem-1", []);
    const table = parseCsvText(csv);
    const row = table[1];
    const recurrenceCol = table[0].indexOf("Återkommer");
    const intervalCol = table[0].indexOf("Intervall");
    const weekdaysCol = table[0].indexOf("Veckodagar");

    expect(row[recurrenceCol]).toBe("Vecka");
    expect(row[intervalCol]).toBe("1");
    expect(row[weekdaysCol]).toBe("mån,tis");
  });

  // Zaida upptäckte 2026-07-08 att "Egen kategori"-kolumnen var TOM i en
  // riktig export trots att todon hade en riktig kategori i databasen —
  // todosToCsv slog aldrig upp kategorinamnet, bara en hårdkodad tom sträng.
  test("todosToCsv → parseTodoCsv tur och retur bevarar Egen kategori", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const categories = [
      { id: "cat-1", accountId: "acc-1", memberId: "mem-1", name: "Packa", createdAt: "", deletedAt: null, deletedBy: null }
    ];
    const original = createTodo({
      id: "t1",
      title: "Camping-grejer",
      createdBy: "mem-1",
      assignedTo: "mem-1",
      personalCategoryId: "cat-1"
    });

    const csv = todosToCsv([original], members, "mem-1", categories);
    const table = parseCsvText(csv);
    const categoryCol = table[0].indexOf("Egen kategori");
    expect(table[1][categoryCol]).toBe("Packa");

    const { rows, errors } = parseTodoCsv(csv, members, categories, "mem-1");
    expect(errors).toEqual([]);
    expect(rows[0].personalCategoryId).toBe("cat-1");
  });

  test("todosToCsv → parseTodoCsv tur och retur bevarar klockslag, inte bara datum", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const original = createTodo({
      id: "t1",
      title: "Tandläkarbesök",
      createdBy: "mem-1",
      assignedTo: "mem-1",
      visibleFrom: new Date(2026, 6, 10, 14, 30, 0).toISOString(),
      expiresAt: new Date(2026, 6, 10, 15, 0, 0).toISOString()
    });

    const csv = todosToCsv([original], members, "mem-1", []);
    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");

    expect(errors).toEqual([]);
    const visibleFrom = new Date(rows[0].visibleFrom!);
    const expiresAt = new Date(rows[0].expiresAt!);
    expect([visibleFrom.getHours(), visibleFrom.getMinutes()]).toEqual([14, 30]);
    expect([expiresAt.getHours(), expiresAt.getMinutes()]).toEqual([15, 0]);
  });

  test("todosToCsv → parseTodoCsv tur och retur bevarar delmoment", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const original = createTodo({
      id: "t1",
      title: "Städa rummet",
      createdBy: "mem-1",
      assignedTo: "mem-1",
      subtasks: [
        { id: "s1", title: "Dammsuga", done: true },
        { id: "s2", title: "Vika tvätt", done: false }
      ]
    });

    const csv = todosToCsv([original], members, "mem-1", []);
    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");

    expect(errors).toEqual([]);
    expect(rows[0].subtasks.map((s) => s.title)).toEqual(["Dammsuga", "Vika tvätt"]);
    // Nya id:n genereras vid import, avklarad-status återställs inte — en
    // import skapar en FRISK uppgift, inte en historik-kopia.
    expect(rows[0].subtasks.every((s) => s.done === false)).toBe(true);
  });

  // Timerfunktion (2026-07-07) — "Timer"-kolumnen (Ja/Nej) rundtrippar precis
  // som Stjärnor: bara meningsfull för barn-tilldelade uppgifter, tvingas
  // till false för Mig själv-rader (samma mönster som starValue).
  test("todosToCsv → parseTodoCsv tur och retur bevarar Timer-kolumnen för en barn-tilldelad uppgift", () => {
    const members = [
      createMember("mem-1", { name: "Zaida" }),
      createMember("mem-child", { name: "Alva", isChild: true })
    ];
    const original = createTodo({
      id: "t1",
      title: "Städa rummet",
      createdBy: "mem-1",
      assignedTo: "mem-child",
      timerEnabled: true,
      plannedDurationMinutes: 15
    });

    const csv = todosToCsv([original], members, "mem-1", []);
    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");

    expect(errors).toEqual([]);
    expect(rows[0].timerEnabled).toBe(true);
    expect(rows[0].plannedDurationMinutes).toBe(15);
  });

  test("parseTodoCsv: Timer och Timer (min) sätts alltid till false/null för Mig själv-rader, oavsett kolumnernas värde", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = [
      "Titel,Tilldelad,Timer,Timer (min)",
      "Handla mat,Mig själv,Ja,15"
    ].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
    expect(errors).toEqual([]);
    expect(rows[0].timerEnabled).toBe(false);
    expect(rows[0].plannedDurationMinutes).toBeNull();
  });

  test("todosToCsv → parseTodoCsv tur och retur bevarar emoji, saknad emoji faller tillbaka på ⭐ vid import", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const original = createTodo({
      id: "t1",
      title: "Handla mat",
      createdBy: "mem-1",
      assignedTo: "mem-1",
      visual: { type: "lucide-icon", value: "🛒" }
    });

    const csv = todosToCsv([original], members, "mem-1", []);
    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
    expect(errors).toEqual([]);
    expect(rows[0].emoji).toBe("🛒");

    const csvWithoutEmoji = [
      "Titel,Tilldelad",
      "Städa,Mig själv"
    ].join("\r\n");
    const { rows: rowsWithoutEmoji } = parseTodoCsv(csvWithoutEmoji, members, [], "mem-1");
    expect(rowsWithoutEmoji[0].emoji).toBe("⭐");
  });

  // 2026-07-26, Zaidas fynd: "varför blir det text istället för symbol i
  // barnens vy ibland?" — en "Emoji"-cell i kalkylarket är fri text, ett
  // vanligt misstag är att skriva ett ord istället för en emoji (eller att
  // spreadsheet-programmet gör om en inklistrad emoji till text). Utan
  // valideringen sparades ordet rakt av som Todo.visual.value och visades
  // bokstavligen i barnens vy istället för en symbol.
  test("parseTodoCsv: en Emoji-cell med vanlig text (inte en riktig emoji) faller tillbaka på ⭐", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = [
      "Titel,Emoji,Tilldelad",
      "Träna,gympa,Mig själv"
    ].join("\r\n");
    const { rows } = parseTodoCsv(csv, members, [], "mem-1");
    expect(rows[0].emoji).toBe("⭐");
  });

  test("parseTodoCsv: Vecka utan giltiga veckodagar ger ett fel och behandlas som engångsuppgift", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = [
      "Titel,Tilldelad,Egen kategori,Stjärnor,Startdatum,Slutdatum,Återkommer,Intervall,Veckodagar,Anteckningar",
      "Träna,Mig själv,,,,,Vecka,1,,"
    ].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
    expect(rows[0].recurrence).toEqual({ type: "none" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Veckodagar");
  });

  // 2026-07-08 (Zaida, upptäckt via en riktig produktionsdiagnos): flera
  // återkommande mallar i produktion hade visibleFrom:null (samma grundorsak
  // som incidenten 2026-07-06, se incidents/2026-07-06-barnens-rutiner-forsvann.md)
  // — en tom Startdatum-cell vid import/uppdatering fick tyst nollställa
  // ankardatumet istället för att flaggas. Raden ska nu hoppas över helt,
  // inte sparas i ett trasigt tillstånd (varken vid skapande eller uppdatering).
  test("parseTodoCsv: en återkommande rad utan Startdatum hoppas över med ett tydligt fel", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = [
      "Titel,Tilldelad,Egen kategori,Stjärnor,Startdatum,Slutdatum,Återkommer,Intervall,Veckodagar,Anteckningar",
      "Töm diskmaskinen,Mig själv,,,,,Dag,1,,"
    ].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Startdatum");
  });

  // 2026-08-03, Zaidas önskemål: tidsbegränsade återkommande uppgifter helt
  // från kalkylark — "Borsta tänderna" morgon OCH kväll som EN mall.
  describe("Fler tidsrutor (Todo.timeWindows)", () => {
    test("todosToCsv → parseTodoCsv tur och retur bevarar flera tidsrutor på samma mall", () => {
      const members = [createMember("mem-1", { name: "Zaida" })];
      const original = createTodo({
        id: "t1",
        title: "Borsta tänderna",
        createdBy: "mem-1",
        assignedTo: "mem-1",
        recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null },
        visibleFrom: new Date(2026, 7, 4, 7, 0).toISOString(),
        expiresAt: new Date(2026, 7, 4, 7, 15).toISOString(),
        timeWindows: [
          { visibleFrom: new Date(2026, 7, 4, 7, 0).toISOString(), expiresAt: new Date(2026, 7, 4, 7, 15).toISOString() },
          { visibleFrom: new Date(2026, 7, 4, 19, 0).toISOString(), expiresAt: new Date(2026, 7, 4, 19, 15).toISOString() }
        ]
      });

      const csv = todosToCsv([original], members, "mem-1", []);
      const table = parseCsvText(csv);
      const headerIndex = new Map(table[0].map((h, i) => [h, i]));
      expect(table[1][headerIndex.get("Fler tidsrutor")!]).toBe("19:00-19:15");

      const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
      expect(errors).toEqual([]);
      expect(rows[0].timeWindows).toHaveLength(2);
      expect(new Date(rows[0].timeWindows![1].visibleFrom!).getHours()).toBe(19);
      expect(new Date(rows[0].timeWindows![1].expiresAt!).getMinutes()).toBe(15);
      // Ankaret blir bara ett datum (ingen tid) + null, samma sätt som
      // TodoCreatorModal.tsx bygger en recurring+timeWindows-uppgift.
      expect(rows[0].expiresAt).toBeNull();
    });

    test("parseTodoCsv: en ogiltig tidsruta flaggas med ett tydligt fel, hoppas över", () => {
      const members = [createMember("mem-1", { name: "Zaida" })];
      const csv = [
        "Titel,Tilldelad,Startdatum,Slutdatum,Fler tidsrutor,Återkommer",
        "Borsta tänderna,Mig själv,2026-08-04 07:00,2026-08-04 07:15,inte-en-tid,Dag"
      ].join("\r\n");

      const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
      expect(errors.some((e) => e.includes("Fler tidsrutor"))).toBe(true);
      expect(rows[0].timeWindows).toBeUndefined();
    });

    // 2026-08-04, Zaidas fynd (verkligt exempel i produktionsanvändning): en
    // "Fler tidsrutor"-cell som råkar upprepa exakt samma klockslag som
    // Startdatum/Slutdatum genererade tidigare två IDENTISKA occurrences per
    // dag, till synes en duplicerad boll i appen.
    test("parseTodoCsv: en 'Fler tidsrutor'-ruta som exakt upprepar Startdatum/Slutdatum hoppas över med ett fel", () => {
      const members = [createMember("mem-1", { name: "Zaida" })];
      const csv = [
        "Titel,Tilldelad,Startdatum,Slutdatum,Fler tidsrutor,Återkommer",
        "Kvällsrutiner,Mig själv,2026-08-04 19:00,2026-08-04 23:55,19:00-23:55,Dag"
      ].join("\r\n");

      const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
      expect(errors.some((e) => e.includes("dubbletter"))).toBe(true);
      expect(rows[0].timeWindows).toBeUndefined();
      expect(rows[0].expiresAt).toBe(new Date("2026-08-04T23:55:00").toISOString());
    });

    test("parseTodoCsv: två identiska rutor i 'Fler tidsrutor' på samma rad — bara den första behålls", () => {
      const members = [createMember("mem-1", { name: "Zaida" })];
      const csv = [
        "Titel,Tilldelad,Startdatum,Slutdatum,Fler tidsrutor,Återkommer",
        "Borsta tänderna,Mig själv,2026-08-04 07:00,2026-08-04 07:15,\"19:00-19:15, 19:00-19:15\",Dag"
      ].join("\r\n");

      const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
      expect(errors.some((e) => e.includes("dubbletter"))).toBe(true);
      expect(rows[0].timeWindows).toHaveLength(2);
    });

    test("parseTodoCsv: Fler tidsrutor på en engångsuppgift ignoreras med ett fel", () => {
      const members = [createMember("mem-1", { name: "Zaida" })];
      const csv = [
        "Titel,Tilldelad,Startdatum,Slutdatum,Fler tidsrutor,Återkommer",
        "Handla mat,Mig själv,2026-08-04 07:00,2026-08-04 07:15,19:00-19:15,Nej"
      ].join("\r\n");

      const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
      expect(errors.some((e) => e.includes("engångsuppgift"))).toBe(true);
      expect(rows[0].timeWindows).toBeUndefined();
    });
  });

  // 2026-08-03, ADR-0017/RecurrenceEnd via kalkylark.
  describe("Slutar (RecurrenceEnd)", () => {
    test("todosToCsv → parseTodoCsv tur och retur bevarar Slutar vid ett datum", () => {
      const members = [createMember("mem-1", { name: "Zaida" })];
      const original = createTodo({
        id: "t1",
        title: "Öva piano",
        createdBy: "mem-1",
        assignedTo: "mem-1",
        recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null, end: { type: "until", date: "2026-09-01" } },
        visibleFrom: new Date(2026, 7, 4, 17, 0).toISOString()
      });

      const csv = todosToCsv([original], members, "mem-1", []);
      const table = parseCsvText(csv);
      const headerIndex = new Map(table[0].map((h, i) => [h, i]));
      expect(table[1][headerIndex.get("Slutar")!]).toBe("2026-09-01");

      const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
      expect(errors).toEqual([]);
      expect(rows[0].recurrence).toMatchObject({ end: { type: "until", date: "2026-09-01" } });
    });

    test("todosToCsv → parseTodoCsv tur och retur bevarar Slutar efter ett antal gånger", () => {
      const members = [createMember("mem-1", { name: "Zaida" })];
      const original = createTodo({
        id: "t1",
        title: "Öva piano",
        createdBy: "mem-1",
        assignedTo: "mem-1",
        recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null, end: { type: "count", count: 30 } },
        visibleFrom: new Date(2026, 7, 4, 17, 0).toISOString()
      });

      const csv = todosToCsv([original], members, "mem-1", []);
      const table = parseCsvText(csv);
      const headerIndex = new Map(table[0].map((h, i) => [h, i]));
      expect(table[1][headerIndex.get("Slutar")!]).toBe("30");

      const { rows } = parseTodoCsv(csv, members, [], "mem-1");
      expect(rows[0].recurrence).toMatchObject({ end: { type: "count", count: 30 } });
    });

    test("parseTodoCsv: ett okänt värde i Slutar flaggas, tolkas som aldrig", () => {
      const members = [createMember("mem-1", { name: "Zaida" })];
      const csv = [
        "Titel,Tilldelad,Startdatum,Återkommer,Slutar",
        "Öva piano,Mig själv,2026-08-04 17:00,Dag,snart"
      ].join("\r\n");

      const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
      expect(errors.some((e) => e.includes("Slutar"))).toBe(true);
      expect((rows[0].recurrence as { end?: unknown }).end).toBeUndefined();
    });

    test("parseTodoCsv: Slutar ignoreras tyst för en engångsuppgift", () => {
      const members = [createMember("mem-1", { name: "Zaida" })];
      const csv = [
        "Titel,Tilldelad,Startdatum,Återkommer,Slutar",
        "Handla mat,Mig själv,2026-08-04,Nej,30"
      ].join("\r\n");

      const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
      expect(errors).toEqual([]);
      expect(rows[0].recurrence).toEqual({ type: "none" });
    });
  });

  // 2026-08-04, Zaidas fynd: en stor import gav "okänt värde"/"ogiltig"-fel
  // på nästan varje rad — ett externt verktyg hade fyllt tomma celler med
  // "-" istället för att lämna dem tomma. "-" tolkas nu som en tom cell
  // överallt (cellValue-hjälparen i todoCsv.ts), ingen varning, ingen
  // skillnad i resultat mot om cellen vore genuint tom.
  test("parseTodoCsv: ett bindestreck '-' i en valfri cell tolkas som tom, ingen varning", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = [
      "Titel,Emoji,Tilldelad,Egen kategori,Stjärnor,Timer,Timer (min),Startdatum,Slutdatum,Fler tidsrutor,Återkommer,Intervall,Veckodagar,Slutar,Anteckningar",
      "Borsta tänderna,-,Mig själv,-,-,-,-,2026-08-04 07:00,2026-08-04 07:15,-,Dag,-,-,-,-"
    ].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].emoji).toBe("⭐"); // fallback, "-" är inte en giltig emoji
    expect(rows[0].personalCategoryId).toBeNull();
    expect(rows[0].newCategoryName).toBeNull();
    expect(rows[0].starValue).toBe(0);
    expect(rows[0].timerEnabled).toBe(false);
    expect(rows[0].plannedDurationMinutes).toBeNull();
    expect(rows[0].timeWindows).toBeUndefined();
    expect(rows[0].recurrence).toEqual({ type: "recurring", unit: "day", every: 1, daysOfWeek: null });
    expect(rows[0].notes).toBeNull();
  });

  // 2026-08-08, Zaidas önskemål: "om det står en familj jag är med i...
  // då innebär det att den inte skall vara min egen todo, utan just den
  // familjens todo. Om den dessutom är tilldelad någon i familjen så syns
  // den uppgiften även i den personliga todo-vyn" — Familj-kolumnen blir en
  // RIKTIG import-mekanik (routar raden till ett annat konto) när cellen
  // matchar en känd "annan familj" (Mina familjekonton), tidigare ren visning.
  describe("parseTodoCsv: Familj-kolumnen routar till en annan familj", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const otherFamilies = [
      {
        accountId: "acc-2",
        accountName: "Wiss Kolmodin",
        members: [
          { id: "mem-lars", name: "Lars" },
          { id: "mem-hanna", name: "Hanna" }
        ]
      }
    ];

    test("en känd familj + tilldelad medlem DÄR sätter targetFamily och rätt assignedTo", () => {
      const csv = [
        "Titel,Tilldelad,Familj",
        "Klippa gräset,Lars,Wiss Kolmodin"
      ].join("\r\n");
      const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1", "mem-1", false, otherFamilies);
      expect(errors).toEqual([]);
      expect(rows).toHaveLength(1);
      expect(rows[0].targetFamily).toEqual({ accountId: "acc-2", accountName: "Wiss Kolmodin" });
      expect(rows[0].assignedTo).toBe("mem-lars");
    });

    test("en känd familj utan Tilldelad-cell defaultar till Familjen DÄR, inte mig själv", () => {
      const csv = ["Titel,Familj", "Handla mat,Wiss Kolmodin"].join("\r\n");
      const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1", "mem-1", false, otherFamilies);
      expect(errors).toEqual([]);
      expect(rows[0].targetFamily).not.toBeNull();
      expect(rows[0].assignedTo).toBeNull();
    });

    test("Tilldelad matchas mot MÅLFAMILJENS medlemmar, inte mina egna — mitt eget namn ger inget träff", () => {
      const csv = ["Titel,Tilldelad,Familj", "Klippa gräset,Zaida,Wiss Kolmodin"].join("\r\n");
      const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1", "mem-1", false, otherFamilies);
      expect(rows).toHaveLength(0);
      expect(errors).toEqual([
        'Rad 2 ("Klippa gräset"): "Zaida" är ingen medlem i Wiss Kolmodin, raden hoppas över.'
      ]);
    });

    test("Egen kategori ignoreras helt för en cross-account-rad", () => {
      const categories = [{ id: "cat-1", accountId: "acc-1", memberId: "mem-1", name: "Trädgård", isFamily: false, hidden: false, isUncategorizedCollector: false, deletedAt: null, deletedBy: null, createdAt: "2024-01-01T00:00:00.000Z" }];
      const csv = ["Titel,Egen kategori,Familj", "Klippa gräset,Trädgård,Wiss Kolmodin"].join("\r\n");
      const { rows, errors } = parseTodoCsv(csv, members, categories, "mem-1", "mem-1", false, otherFamilies);
      expect(errors).toEqual([]);
      expect(rows[0].personalCategoryId).toBeNull();
      expect(rows[0].newCategoryName).toBeNull();
    });
  });
});

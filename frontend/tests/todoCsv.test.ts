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

  test("buildTemplateCsv innehåller alla rubriker plus exempel för både engångs- och återkommande uppgift", () => {
    const csv = buildTemplateCsv();
    const table = parseCsvText(csv);
    expect(table[0]).toEqual([...TODO_CSV_HEADERS]);
    expect(table.length).toBe(3);
    expect(table[1][0]).toBe("Handla mat");
    expect(table[2][0]).toBe("Borsta tänderna");
    expect(table[2][9]).toBe("Dag");
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

    const csv = todosToCsv([original], members, "mem-1");
    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");

    expect(errors).toEqual([]);
    expect(new Date(rows[0].visibleFrom!).getDate()).toBe(10);
    expect(new Date(rows[0].expiresAt!).getDate()).toBe(11);
  });

  test("todosToCsv exporterar egna todos INKLUSIVE återkommande mallar, men inte occurrences/andras/raderade", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const todos = [
      createTodo({ id: "t1", title: "Min uppgift", createdBy: "mem-1", assignedTo: "mem-1", starValue: 0, notes: "Anteckning" }),
      createTodo({ id: "t2", title: "Annans uppgift", createdBy: "mem-2", assignedTo: "mem-2" }),
      createTodo({ id: "t3", title: "Raderad", createdBy: "mem-1", assignedTo: "mem-1", deletedAt: "2026-01-01T00:00:00.000Z" }),
      createTodo({ id: "t4", title: "Återkommande mall", createdBy: "mem-1", assignedTo: "mem-1", recurrence: { type: "recurring", unit: "day", every: 1, daysOfWeek: null } }),
      createTodo({ id: "t5", title: "En occurrence", createdBy: "mem-1", assignedTo: "mem-1", recurringSourceId: "t4" })
    ];

    const csv = todosToCsv(todos, members, "mem-1");
    const table = parseCsvText(csv);
    const titles = table.slice(1).map((row) => row[0]);
    expect(titles).toEqual(["Min uppgift", "Återkommande mall"]);
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

    const csv = todosToCsv([original], members, "mem-1");
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

    const csv = todosToCsv([legacyTodo], members, "mem-1");
    const table = parseCsvText(csv);
    const row = table[1];
    const recurrenceCol = table[0].indexOf("Återkommer");
    const intervalCol = table[0].indexOf("Intervall");
    const weekdaysCol = table[0].indexOf("Veckodagar");

    expect(row[recurrenceCol]).toBe("Vecka");
    expect(row[intervalCol]).toBe("1");
    expect(row[weekdaysCol]).toBe("mån,tis");
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

    const csv = todosToCsv([original], members, "mem-1");
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

    const csv = todosToCsv([original], members, "mem-1");
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

    const csv = todosToCsv([original], members, "mem-1");
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

    const csv = todosToCsv([original], members, "mem-1");
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
});

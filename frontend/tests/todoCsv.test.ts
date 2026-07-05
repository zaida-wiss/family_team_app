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

  test("buildTemplateCsv innehåller alla rubriker plus ett exempel", () => {
    const csv = buildTemplateCsv();
    const table = parseCsvText(csv);
    expect(table[0]).toEqual([...TODO_CSV_HEADERS]);
    expect(table.length).toBe(2);
    expect(table[1][0]).toBe("Handla mat");
  });

  test("parseTodoCsv: giltig rad tilldelad Mig själv med ny kategori", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = [
      "Titel,Tilldelad,Kategori,Stjärnor,Startdatum,Slutdatum,Anteckningar",
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
      "Titel,Tilldelad,Kategori,Stjärnor,Startdatum,Slutdatum,Anteckningar",
      "Plocka undan,Alva,Hushåll,3,,,"
    ].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, categories, "mem-1");
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      title: "Plocka undan",
      assignedTo: "mem-child",
      starValue: 3,
      // Kategori gäller bara Mig själv-rader — ignoreras för barn-tilldelade.
      personalCategoryId: null,
      newCategoryName: null
    });
  });

  test("parseTodoCsv: rad utan titel hoppas tyst över, okänt namn ger ett fel", () => {
    const members = [createMember("mem-1", { name: "Zaida" })];
    const csv = [
      "Titel,Tilldelad",
      ",",
      "Diska,Okänd Person"
    ].join("\r\n");

    const { rows, errors } = parseTodoCsv(csv, members, [], "mem-1");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Okänd Person");
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

  test("todosToCsv exporterar bara egna, icke-återkommande, icke-raderade todos", () => {
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
    expect(titles).toEqual(["Min uppgift"]);
  });
});

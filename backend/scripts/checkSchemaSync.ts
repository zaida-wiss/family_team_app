/**
 * CI-kontroll: hittar fält som finns i ett Zod-schema (shared/schemas.ts)
 * men saknas i motsvarande Mongoose-schema (backend/src/db/models/*.ts).
 *
 * Varför: samma bugklass har upprepats minst sex gånger denna session
 * (Member.todoThreadGap, taskTemplateOrder, recurringTemplateOrder,
 * homeSelectedFamilyId, showChildTodosInOwnView, todoBubbleSize m.fl., se
 * kommentarerna i Member.ts) — ett fält läggs till i Zod-schemat (klienten
 * får då skicka det, PATCH-anropet svarar 200) men glöms i Mongoose-schemat,
 * som i strict-läge (default, oförändrat i denna app) tyst STRIPPAR ett
 * odeklarerat fält vid .save(). Inget synligt fel — bara data som aldrig
 * faktiskt sparas, upptäckt först när en användare märker att en inställning
 * "studsar tillbaka".
 *
 * Kör: npx tsx backend/scripts/checkSchemaSync.ts  (från backend/)
 * Körs även i CI (se ci.yml) — avslutar med kod 1 om något saknas.
 *
 * Kontrollerar bara den FARLIGA riktningen: Zod har fältet, Mongoose har
 * det inte. Motsatsen (Mongoose har ett fält Zod inte känner till, t.ex.
 * Todo.inProgressBy) flaggas INTE — de fulla Zod-schemana i denna fil
 * definierar vad en klient får skicka/läsa via API:t, inte nödvändigtvis
 * 100 % av vad som lagras, så den riktningen skulle bara ge brus.
 *
 * Känd, medveten begränsning: täcker bara entiteter som faktiskt har ett
 * fullt Zod-objektschema att jämföra mot (Member/Role/Todo/CalendarEvent/
 * ShoppingItem/TodoTemplateTask). Recipe/Account/TodoCategory/
 * HouseholdSecret/TimedTask m.fl. valideras via ad-hoc-funktioner i sina
 * respektive service-filer, inte ett fullt Zod-schema — samma bugklass kan
 * i teorin fortfarande smyga sig in där. Utöka PAIRS nedan om det blir
 * aktuellt (kräver då ett riktigt Zod-schema för den entiteten också).
 */

import type { z } from "zod";
import type { Schema as MongooseSchema } from "mongoose";
import {
  MemberSchema,
  RoleSchema,
  TodoSchema,
  CalendarEventSchema,
  ShoppingItemSchema,
  TodoTemplateTaskSchema
} from "../../shared/schemas.js";
import { MemberModel } from "../src/db/models/Member.js";
import { RoleModel } from "../src/db/models/Role.js";
import { TodoModel } from "../src/db/models/Todo.js";
import { CalendarModel } from "../src/db/models/Calendar.js";
import { ShoppingListModel } from "../src/db/models/ShoppingList.js";
import { TodoTemplateModel } from "../src/db/models/TodoTemplate.js";
import { TodoCategoryTemplateModel } from "../src/db/models/TodoCategoryTemplate.js";

type Finding = { location: string; field: string };
type AnyZodType = z.ZodTypeAny & { unwrap?: () => AnyZodType; removeDefault?: () => AnyZodType; element?: AnyZodType };

// backend/ och shared/ har varsin egen node_modules/zod (inget npm-workspace,
// se package.json-strukturen) — samma zod-VERSION (^3.23.8) men två SKILDA
// modulinstanser. `instanceof z.ZodObject` från den här filen skulle därför
// tyst returnera false för scheman byggda med shared/'s zod-kopia (klassisk
// dual-package-instance-fälla). Läs istället av zod v3:s egen interna
// `_def.typeName`-diskriminator (en stabil sträng, oberoende av vilken
// modulinstans som skapade objektet) — metoderna (.unwrap()/.removeDefault()/
// .shape/.element) fungerar ändå fint, de är bara vanliga prototyp-anrop.
function typeNameOf(zodType: AnyZodType): string {
  return (zodType as unknown as { _def: { typeName: string } })._def.typeName;
}

/** Skalar av Optional/Nullable/Default-omslag för att komma åt den faktiska typen. */
function unwrap(zodType: AnyZodType): AnyZodType {
  let current = zodType;
  while (true) {
    const name = typeNameOf(current);
    if (name === "ZodOptional" || name === "ZodNullable") {
      current = current.unwrap!();
    } else if (name === "ZodDefault") {
      current = current.removeDefault!();
    } else {
      return current;
    }
  }
}

/**
 * Går igenom ett Zod-objekts fält och kontrollerar att varje fält finns i
 * `schema` (dotted path, relativt `schema`s egen rot — Mongoose flackar
 * ut vanliga nästlade PLAINA objekt (t.ex. Todo.visual) till punktade
 * paths automatiskt, synliga via `schema.nested[key] === true`, snarare
 * än att ge dem en egen `schema.path(key)`). Vid ett fält som är en array
 * av objekt byts `schema` ut mot den arrayens EGNA sub-schema (Mongoose
 * ger varje dokument-array sitt eget Schema-objekt) och prefixet
 * nollställs.
 */
function walk(zodObj: AnyZodType, schema: MongooseSchema, displayPath: string, prefix: string, findings: Finding[]) {
  const nested = (schema as unknown as { nested: Record<string, boolean> }).nested;
  const shape = (zodObj as unknown as { shape: Record<string, AnyZodType> }).shape;

  for (const [key, rawType] of Object.entries(shape)) {
    const type = unwrap(rawType);
    const dottedKey = prefix ? `${prefix}.${key}` : key;
    const displayKey = `${displayPath}.${key}`;

    if (typeNameOf(type) === "ZodObject" && nested[dottedKey]) {
      // Flackat nästlat objekt (t.ex. Todo.visual, CalendarEvent.recurrence) —
      // ingen egen path att kontrollera på den här nivån, bara dess barn.
      walk(type, schema, displayKey, dottedKey, findings);
      continue;
    }

    const schemaPath = schema.path(dottedKey);
    if (!schemaPath) {
      findings.push({ location: displayPath, field: displayKey });
      continue;
    }

    if (typeNameOf(type) === "ZodArray") {
      const element = unwrap(type.element!);
      if (typeNameOf(element) === "ZodObject") {
        const nestedArraySchema = (schemaPath as unknown as { schema?: MongooseSchema }).schema;
        if (nestedArraySchema) {
          walk(element, nestedArraySchema, `${displayKey}[]`, "", findings);
        }
        // Ingen nested .schema (skulle bara ske för en array av Mixed) —
        // existensen är redan kontrollerad ovan, inget mer att jämföra.
      }
    }
    // Ett ZodObject-fält som INTE är flackat nästlat (t.ex. Role.permissions,
    // som är Schema.Types.Mixed på Mongoose-sidan) samt ZodDiscriminatedUnion/
    // ZodRecord/ZodEffects m.fl. motsvarar här alltid ett avsiktligt Mixed-fält
    // — existensen är redan kontrollerad ovan, ingen djupare jämförelse görs
    // eftersom Mixed accepterar vilken form som helst.
  }
}

const PAIRS: { name: string; zod: AnyZodType; schema: MongooseSchema }[] = [
  { name: "Member", zod: MemberSchema, schema: MemberModel.schema },
  { name: "Role", zod: RoleSchema, schema: RoleModel.schema },
  { name: "Todo", zod: TodoSchema, schema: TodoModel.schema },
  {
    name: "Calendar.events[]",
    zod: CalendarEventSchema,
    schema: (CalendarModel.schema.path("events") as unknown as { schema: MongooseSchema }).schema
  },
  {
    name: "ShoppingList.items[]",
    zod: ShoppingItemSchema,
    schema: (ShoppingListModel.schema.path("items") as unknown as { schema: MongooseSchema }).schema
  },
  { name: "TodoTemplate (fristående mall)", zod: TodoTemplateTaskSchema, schema: TodoTemplateModel.schema },
  {
    name: "TodoCategoryTemplate.tasks[]",
    zod: TodoTemplateTaskSchema,
    schema: (TodoCategoryTemplateModel.schema.path("tasks") as unknown as { schema: MongooseSchema }).schema
  }
];

const findings: Finding[] = [];
for (const pair of PAIRS) {
  walk(pair.zod, pair.schema, pair.name, "", findings);
}

if (findings.length > 0) {
  console.error(
    "Fält som finns i Zod-schemat men saknas i motsvarande Mongoose-schema — skrivs tyst bort vid .save():\n"
  );
  for (const finding of findings) {
    console.error(`  ${finding.field}`);
  }
  console.error(
    `\n${findings.length} fynd. Lägg till fältet i motsvarande Mongoose-schema i backend/src/db/models/ (se checkSchemaSync.ts:s filhuvud för varför).`
  );
  process.exit(1);
} else {
  console.log(`Zod/Mongoose-schemakontroll OK — ${PAIRS.length} entiteter kontrollerade, inga saknade fält hittade.`);
}

import "dotenv/config";
import "express-async-errors";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import type { ErrorRequestHandler, Request, Response } from "express";
import { logger } from "./utils/logger.js";
import { authRouter } from "./routes/auth.js";
import { accountsRouter } from "./routes/accounts.js";
import { calendarsRouter } from "./routes/calendars.js";
import { invitationsRouter } from "./routes/invitations.js";
import { membersRouter } from "./routes/members.js";
import { rewardsRouter } from "./routes/rewards.js";
import { rewardShopRouter } from "./routes/rewardShop.js";
import { rolesRouter } from "./routes/roles.js";
import { shoppingRouter } from "./routes/shopping.js";
import { todosRouter } from "./routes/todos.js";
import { analyticsRouter } from "./routes/analytics.js";
import { adminRouter } from "./routes/admin.js";
import { timedTasksRouter } from "./routes/timedTasks.js";
import { auditLogRouter } from "./routes/auditLog.js";
import { todoCategoriesRouter } from "./routes/todoCategories.js";
import { todoTemplatesRouter } from "./routes/todoTemplates.js";
import { recipesRouter } from "./routes/recipes.js";
import { householdSecretsRouter } from "./routes/householdSecrets.js";
import { householdPinRouter } from "./routes/householdPin.js";
import { mealPlanRouter } from "./routes/mealPlan.js";
import { birthdaysRouter } from "./routes/birthdays.js";
import { compressionFilter } from "./utils/compressionFilter.js";

const FRONTEND_URL = (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");


// 200/15min (2026-07-16, ADR-0023, produktionsincident) visade sig vara för
// lågt för en riktig familj — begränsningen är PER IP, och en hel familj på
// samma hem-wifi delar en enda publik IP. Flera medlemmar aktiva samtidigt,
// kombinerat med legitima klusterade skrivningar (t.ex. "Kopiera rutiner"
// eller ett CSV-import av flera rader, plus syncScheduledTodos's
// engångsgenerering av dagens förfallna rutiner för varje mall) kunde nå
// taket på minuter och blockerade DÅ hela hushållet, inte bara en angripare.
// Höjd till 1000 — fortsatt orimligt för ett skriptat missbruk mot en
// enskild IP (inloggning har sin egen mycket striktare authLimiter nedan,
// opåverkad av denna höjning), men gott om marginal för legitim, klustrad
// familjeanvändning.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: "För många förfrågningar, försök igen senare" });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false },
  handler: (req: Request, res: Response) => {
    logger.warn({ ip: req.ip, path: req.path }, "Auth rate limit exceeded");
    res.status(429).json({ error: "För många inloggningsförsök, försök igen om 15 minuter" });
  }
});

export const app = express();

app.set("trust proxy", 1);
// 2026-07-04: /api-svar saknade ett eget Cache-Control-huvud, vilket lät
// Vercels/Cloudflares standardcachepolicy (public, med Express egen
// innehålls-ETag) ta över — ett DELAT mellanlager (Vercels rewrite-proxy till
// Render, se frontend/vercel.json, ligger fortfarande i vägen för varje
// /api-anrop i produktion) kunde då lagra och återanvända ett autentiserat,
// per-konto-svar åt vem som helst som träffade samma cachenod. Då fixat med
// `etag:false` + `Cache-Control:no-store` — säkert, men kastade bort ALL
// cachning, inklusive den ofarliga sorten.
//
// 2026-08-30: bandbreddsutredning (Render Hobby-planens 5GB/månad-tak nått)
// visade att flera datahookar (todos m.fl.) hämtar om HELA listan vid varje
// `visibilitychange`/SSE-broadcast, oavsett om något faktiskt ändrats — en
// enda todos-hämtning mätt till ~59kB komprimerad i produktion. `no-store`
// stod i vägen för den enda ofarliga optimeringen: `private`+`no-cache`
// (ETag på) löser BÅDA problemen samtidigt. `private` förbjuder varje delat
// mellanlager (Vercel/Cloudflare) att lagra svaret alls — striktare än
// tidigare, inte svagare, ursprungsincidenten kan inte återuppstå. `no-cache`
// tvingar webbläsarens EGEN, per-enhet-cache att alltid fråga servern om
// friskhet (aldrig återanvända tyst) — men om ETag:en matchar (`If-None-
// Match`) svarar Express automatiskt med ett tomt `304` istället för att
// skicka hela JSON-kroppen igen. Ingen egen kod behövs för själva 304-
// hanteringen — inbyggt i Express `res.send()`/`res.json()` via `fresh()`.
app.set("etag", "weak");
app.use((_req, res, next) => {
  res.set("Cache-Control", "private, no-cache");
  next();
});
app.use(helmet());
// gzip/br-komprimering av alla svar (2026-07-26) — JSON komprimerar mycket
// väl (typiskt 80-90%), en enkel `GET /api/todos` mättes till 2,7MB
// okomprimerat för ett konto med lång historik. Ingen ändring av
// svarsformatet, bara transport — `compression` är Express egna officiella
// rekommenderade middleware för detta (se Express docs, källhierarki tier 3).
//
// Bugg fixad (2026-07-27, Zaidas fynd: "barnens stjärnor har slutat att
// fungera... intjänade pengar ökar inte" direkt, bara efter en omladdning,
// "man ska hur som helst kunna se direkt, på olika enheter"): `compressible`
// (biblioteket `compression` använder för att avgöra vad som ska
// komprimeras) räknar `text/event-stream` som komprimerbart — men våra tre
// SSE-strömmar (members/todos/reward-shop realtidssynk, se realtime/*.ts)
// är LÅNGLIVADE anslutningar som aldrig avslutas. En gzip/deflate-ström
// flushar bara nedströms när dess interna buffert fyllts ELLER anslutningen
// stängs — en enskild SSE-händelse ("event: members-changed\n...", några
// tiotal bytes) är alltid långt under den gränsen, så händelserna fastnade
// obestämt i komprimeringsbufferten istället för att nå klienten direkt.
// Precis det symptom Zaida beskrev: stjärnorna VAR korrekt tilldelade
// server-side hela tiden (rätt efter en omladdning, en vanlig avslutad
// JSON-request flushar alltid vid res.end()) men realtidssynken hade i
// praktiken slutat fungera sedan denna middleware lades till. compressionFilter.ts
// stänger av komprimering specifikt för text/event-stream-svar — alla
// vanliga JSON-svar komprimeras fortsatt som avsett.
app.use(compression({ filter: compressionFilter }));
app.use(cors({ origin: FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
app.use("/api", globalLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/child-login", authLimiter);
// Samma brute-force-skydd som inloggning (10 försök/15 min) — en 6-siffrig
// kod har bara en miljon kombinationer, se householdPinService.ts.
app.use("/api/household-pin/verify", authLimiter);

app.get("/health", (_req, res) => { res.json({ ok: true }); });

app.use("/api/auth", authRouter);
app.use("/api", invitationsRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/members", membersRouter);
app.use("/api/roles", rolesRouter);
app.use("/api/todos", todosRouter);
app.use("/api/calendars", calendarsRouter);
app.use("/api/shopping", shoppingRouter);
app.use("/api/rewards", rewardsRouter);
app.use("/api/reward-shop", rewardShopRouter);
app.use("/api/timed-tasks", timedTasksRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/admin", adminRouter);
app.use("/api/audit-log", auditLogRouter);
app.use("/api/todo-categories", todoCategoriesRouter);
app.use("/api/todo-templates", todoTemplatesRouter);
app.use("/api/recipes", recipesRouter);
app.use("/api/household-secrets", householdSecretsRouter);
app.use("/api/household-pin", householdPinRouter);
app.use("/api/meal-plan", mealPlanRouter);
app.use("/api/birthdays", birthdaysRouter);

// Strukturell ZodError-koll, INTE `instanceof ZodError` (2026-08-30,
// uppföljning — se ADR-0037). Ett första försök importerade ZodError direkt
// från "zod" och gjorde `err instanceof ZodError` — föll fortfarande igenom
// till 500 i CI, eftersom `shared/`s egen `zod`-installation (separat
// node_modules, se package-anteckningen i CLAUDE.md om shared/s egna zod-
// beroende) ger en ANNAN ZodError-klass än den backend/node_modules/zod
// app.ts själv importerar — trots samma versionsnummer är de två skilda
// modulinstanser, och en `.parse()`-anrop mot ett schema definierat i
// shared/schemas.ts (t.ex. CreateRewardBodySchema) kastar shared:s klass,
// aldrig backend:s. `instanceof` mot fel modulinstans är alltid `false`.
// En strukturell koll (namn + issues-array) fungerar oavsett VILKEN av de
// flera zod-kopiorna i repot (shared/, backend, och några backend-filer som
// importerar "zod" direkt för lokala scheman, t.ex. accountsService.ts) som
// faktiskt kastade felet.
function isZodError(err: unknown): err is { issues: unknown[] } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: unknown }).name === "ZodError" &&
    Array.isArray((err as { issues?: unknown }).issues)
  );
}

const errorHandler: ErrorRequestHandler = (err, _request, response, _next) => {
  logger.error(err);
  if (isZodError(err)) {
    response.status(400).json({ error: "Ogiltig indata", issues: err.issues });
    return;
  }
  const status = (err as { status?: number }).status ?? 500;
  const message = err instanceof Error ? err.message : "Okänt fel";
  response.status(status).json({ error: message });
};

app.use(errorHandler);

import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

// Mock authService so tests never touch MongoDB
vi.mock("../src/services/authService.js", () => ({
  register: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  updatePreferences: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}));

import * as authService from "../src/services/authService.js";

const mockUser = { id: "user-1", email: "test@example.com" };
const mockTokens = { refreshToken: "rt", accessToken: "at", user: mockUser, memberships: [] };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/auth/register", () => {
  it("returnerar 201 + accessToken vid lyckad registrering", async () => {
    vi.mocked(authService.register).mockResolvedValueOnce(mockTokens);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "test@example.com", password: "Lösenord1!", name: "Test" });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("accessToken");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returnerar 500 om tjänsten kastar fel", async () => {
    vi.mocked(authService.register).mockRejectedValueOnce(new Error("E-post används redan"));
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "dup@example.com", password: "Lösenord1!", name: "Test" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("POST /api/auth/login", () => {
  it("returnerar 200 + accessToken vid lyckad inloggning", async () => {
    vi.mocked(authService.login).mockResolvedValueOnce(mockTokens);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "Lösenord1!" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("accessToken", "at");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returnerar 401 vid fel lösenord", async () => {
    const { AppError } = await import("../src/utils/errors.js");
    vi.mocked(authService.login).mockRejectedValueOnce(new AppError(401, "Fel e-post eller lösenord"));
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@example.com", password: "fel" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("returnerar 200 och rensar refresh-cookie", async () => {
    vi.mocked(authService.logout).mockReturnValueOnce(undefined);
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const cookie = res.headers["set-cookie"] as string[] | string | undefined;
    const cookieStr = Array.isArray(cookie) ? cookie.join(";") : (cookie ?? "");
    expect(cookieStr).toMatch(/refresh_token=;/);
  });
});

describe("Åtkomstkontroll — skyddade routes kräver auth", () => {
  const protectedRoutes = [
    { method: "get",    path: "/api/todos" },
    { method: "get",    path: "/api/calendars" },
    { method: "get",    path: "/api/members" },
    { method: "post",   path: "/api/todos" },
  ] as const;

  for (const { method, path } of protectedRoutes) {
    it(`${method.toUpperCase()} ${path} utan token → 401`, async () => {
      const res = await (request(app) as any)[method](path);
      expect(res.status).toBe(401);
    });
  }
});

describe("GET /health", () => {
  it("returnerar 200", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("ok", true);
  });
});

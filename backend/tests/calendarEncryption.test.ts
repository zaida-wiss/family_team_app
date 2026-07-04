import "dotenv/config";
import { describe, it, expect } from "vitest";
import { decryptField, decryptNullable, encryptField, encryptNullable } from "../src/utils/calendarEncryption.js";

describe("Fält-kryptering av kalenderns title/notes (ADR-0014)", () => {
  it("krypterar och dekrypterar tillbaka till samma klartext", () => {
    const plaintext = "Läkarbesök hos dr Andersson";
    const encrypted = encryptField("acc-1", plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptField("acc-1", encrypted)).toBe(plaintext);
  });

  it("samma klartext ger olika chiffertext varje gång (slumpmässig IV)", () => {
    const a = encryptField("acc-1", "Samma text");
    const b = encryptField("acc-1", "Samma text");
    expect(a).not.toBe(b);
  });

  it("olika konton ger olika chiffertext för samma klartext (per-konto-nyckel)", () => {
    const a = encryptField("acc-1", "Samma text");
    const b = encryptField("acc-2", "Samma text");
    expect(a).not.toBe(b);
  });

  it("dekryptering med fel konto-id misslyckas (autentiserad kryptering upptäcker manipulation)", () => {
    const encrypted = encryptField("acc-1", "Hemlig text");
    expect(() => decryptField("acc-2", encrypted)).toThrow();
  });

  it("oförändrad klartext (omigrerad äldre data utan v1:-prefix) returneras som den är", () => {
    expect(decryptField("acc-1", "Gammal klartext utan prefix")).toBe("Gammal klartext utan prefix");
  });

  it("hanterar null oförändrat i encryptNullable/decryptNullable", () => {
    expect(encryptNullable("acc-1", null)).toBeNull();
    expect(decryptNullable("acc-1", null)).toBeNull();
  });
});

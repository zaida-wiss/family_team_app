import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

// Generisk fält-nivå-kryptering (ADR-0014, utökad till todos/rewards 2026-07-04
// — se ADR-0014 tillägg). Ursprungligen byggd för kalenderns title/notes, men
// vet inget kalenderspecifikt — funkar för valfritt textfält, given ett accountId.
// Per-konto-nyckel härledd deterministiskt via HKDF från en huvudnyckel; inget
// att lagra eller provisionera separat vid nytt konto. AES-256-GCM (autentiserad),
// slumpmässig 12-byte IV per krypteringsoperation, aldrig återanvänd.
//
// Miljövariabeln heter fortfarande CALENDAR_ENCRYPTION_MASTER_KEY (historiska skäl
// — redan satt i Render, ingen anledning att döpa om och kräva ännu en manuell
// konfigurationsändring) trots att den nu används generiskt för fler entiteter.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION_PREFIX = "v1";

function requireMasterKey(): Buffer {
  const value = process.env.CALENDAR_ENCRYPTION_MASTER_KEY;
  if (!value) {
    throw new Error(
      "CALENDAR_ENCRYPTION_MASTER_KEY saknas — sätt den i miljövariablerna innan servern startar (se .env.example)"
    );
  }
  return Buffer.from(value, "base64");
}

const MASTER_KEY = requireMasterKey();

function deriveAccountKey(accountId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", MASTER_KEY, Buffer.alloc(0), accountId, 32));
}

// Versionsprefixad lagringssträng (v1:<iv>:<authTag>:<ciphertext>, alla base64) i
// samma title/notes-textfält som redan finns i schemat — inget nytt fält. Prefixet
// gör att ett framtida schemabyte kan detekteras och migreras stegvis.
export function encryptField(accountId: string, plaintext: string): string {
  const key = deriveAccountKey(accountId);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [VERSION_PREFIX, iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptField(accountId: string, stored: string): string {
  if (!stored.startsWith(`${VERSION_PREFIX}:`)) {
    // Klartext från innan migrationen körts — returnera oförändrat.
    return stored;
  }
  const [, ivB64, tagB64, ciphertextB64] = stored.split(":");
  const key = deriveAccountKey(accountId);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

export function encryptNullable(accountId: string, value: string | null | undefined): string | null | undefined {
  return value == null ? value : encryptField(accountId, value);
}

export function decryptNullable(accountId: string, value: string | null | undefined): string | null | undefined {
  return value == null ? value : decryptField(accountId, value);
}

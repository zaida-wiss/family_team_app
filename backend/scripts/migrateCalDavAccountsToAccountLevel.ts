/**
 * Engångsmigration: flytta Apple CalDAV-inloggningen från per-kalender till
 * kontonivå (2026-07-30, ADR-0027-tillägg).
 *
 * Kör: tsx backend/scripts/migrateCalDavAccountsToAccountLevel.ts
 *
 * Varför: fram till denna ändring bar varje `Calendar.calDavConnections[]`-post
 * sina EGNA krypterade `accountEmailEnc`/`appSpecificPasswordEnc` — man loggade
 * in på nytt för varje BMAD-kalender man ville ansluta, även om det var samma
 * Apple-konto. Zaidas beslut 2026-07-30: logga in EN gång per Apple-konto
 * (ny, fristående `AppleCalDavAccount`-collection), låt kalendrar REFERERA
 * kontot (`appleAccountId`) istället.
 *
 * Detta skript: för varje befintlig connection i den GAMLA formen (har
 * `accountEmailEnc`/`appSpecificPasswordEnc` men saknar `appleAccountId`) —
 * skapar (eller återanvänder, om samma e-post inom samma familjekonto redan
 * migrerats) ett `AppleCalDavAccount`-dokument och skriver om connectionen
 * till att referera det istället. De redan krypterade sträng-värdena FLYTTAS
 * rakt av (ingen dekryptering/omkryptering behövs — fieldEncryption härleder
 * nyckeln deterministiskt från accountId, som förblir densamma).
 *
 * Använder MongoDB-drivern direkt (mongoose.connection.collection), inte
 * Mongoose-modellerna — en subdokument-schema-cast (Calendar.ts:s
 * calDavConnectionSchema har redan bytts till att bara känna igen
 * `appleAccountId`) skulle annars tyst kunna strippa de gamla fälten innan
 * skriptet ens hinner läsa dem.
 *
 * Säkert att köra flera gånger: en connection som redan har `appleAccountId`
 * hoppas över.
 */

import "dotenv/config";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { connectDB } from "../src/db/connection.js";
import { decryptField } from "../src/utils/fieldEncryption.js";
import { AppleCalDavAccountModel } from "../src/db/models/AppleCalDavAccount.js";

type LegacyConnection = {
  id: string;
  calendarId: string;
  provider: string;
  accountEmailEnc?: string;
  appSpecificPasswordEnc?: string;
  appleAccountId?: string;
  externalCalendarHref: string;
  syncIntervalMinutes: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  createdBy: string;
  connectedAt: string;
};

async function run() {
  await connectDB();
  const calendars = mongoose.connection.collection("calendars");
  // Native driver-handtag från den riktiga modellen — undviker att gissa
  // Mongooses auto-pluraliserade collection-namn för hand.
  const appleAccounts = AppleCalDavAccountModel.collection;

  const docs = await calendars
    .find({ "calDavConnections.0": { $exists: true } })
    .project({ _id: 1, id: 1, accountId: 1, calDavConnections: 1 })
    .toArray();

  let calendarsChecked = 0;
  let connectionsMigrated = 0;
  let accountsCreated = 0;

  // Dedupe inom SAMMA familjekonto: samma e-post typad in för flera
  // BMAD-kalendrar ska bli EN AppleCalDavAccount, inte flera.
  const accountIdByEmail = new Map<string, string>(); // key: `${accountId}:${plainEmail}`

  for (const doc of docs) {
    calendarsChecked++;
    const accountId = doc.accountId as string | null;
    const conns = (doc.calDavConnections ?? []) as LegacyConnection[];
    if (!accountId || conns.length === 0) continue;

    let changed = false;
    const rewritten = await Promise.all(
      conns.map(async (conn) => {
        if (conn.appleAccountId || !conn.accountEmailEnc || !conn.appSpecificPasswordEnc) {
          return conn; // redan migrerad, eller ett okänt/redan nytt skick
        }
        changed = true;
        connectionsMigrated++;

        const plainEmail = decryptField(accountId, conn.accountEmailEnc);
        const dedupeKey = `${accountId}:${plainEmail}`;
        let appleAccountId = accountIdByEmail.get(dedupeKey);

        if (!appleAccountId) {
          const existing = await appleAccounts.findOne({ accountId, accountEmailEnc: conn.accountEmailEnc });
          if (existing) {
            appleAccountId = existing.id as string;
          } else {
            appleAccountId = `apple-acct-${randomUUID()}`;
            await appleAccounts.insertOne({
              id: appleAccountId,
              accountId,
              accountEmailEnc: conn.accountEmailEnc,
              appSpecificPasswordEnc: conn.appSpecificPasswordEnc,
              createdBy: conn.createdBy,
              connectedAt: conn.connectedAt
            });
            accountsCreated++;
          }
          accountIdByEmail.set(dedupeKey, appleAccountId);
        }

        const { accountEmailEnc: _e, appSpecificPasswordEnc: _p, ...rest } = conn;
        void _e; void _p;
        return { ...rest, appleAccountId };
      })
    );

    if (changed) {
      await calendars.updateOne({ _id: doc._id }, { $set: { calDavConnections: rewritten } });
    }
  }

  console.log(`Kalendrar med minst en CalDAV-anslutning: ${calendarsChecked}`);
  console.log(`Anslutningar migrerade till kontonivå: ${connectionsMigrated}`);
  console.log(`Nya AppleCalDavAccount-dokument skapade: ${accountsCreated}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

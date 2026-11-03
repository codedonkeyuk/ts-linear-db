import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import pkg from "knex";
import { KnexDriver } from "./knexDriver.ts";
import type { LinearDbConfig } from "../types.ts";

const config: LinearDbConfig = {
  tableName: "migration_meta",
  idColumn: "id",
  versionColumn: "version",
  scriptsDir: "",
};

const knex = (pkg as any).default || pkg;

test("KnexDriver Integration Tests (better-sqlite3)", async (t) => {
  let db: pkg.Knex;
  let driver: KnexDriver;

  beforeEach(() => {
    db = knex({
      client: "better-sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    driver = new KnexDriver(db, config);
  });

  afterEach(async () => {
    await db.destroy();
  });

  await t.test("connect() resolves successfully", async () => {
    await assert.doesNotReject(() => driver.connect());
  });

  await t.test(
    "ensureMetadataTable() creates and seeds the table correctly",
    async () => {
      let hasTable = await db.schema.hasTable(config.tableName);
      assert.equal(hasTable, false);

      await driver.ensureMetadataTable();

      hasTable = await db.schema.hasTable(config.tableName);
      assert.equal(hasTable, true);

      const row = await db(config.tableName)
        .where({ [config.idColumn]: 1 })
        .first();
      assert.ok(row, "Tracking row should exist");
      assert.equal(row[config.versionColumn], 0);
    },
  );

  await t.test(
    "ensureMetadataTable() skips creation if it already exists",
    async () => {
      await driver.ensureMetadataTable();
      await assert.doesNotReject(() => driver.ensureMetadataTable());
    },
  );

  await t.test("getCurrentVersion() returns correct version", async () => {
    await driver.ensureMetadataTable();

    let version = await driver.getCurrentVersion();
    assert.equal(version, 0);

    await db(config.tableName)
      .where({ [config.idColumn]: 1 })
      .update({ [config.versionColumn]: 42 });

    version = await driver.getCurrentVersion();
    assert.equal(version, 42);
  });

  await t.test(
    "getCurrentVersion() returns 0 if metadata row missing entirely",
    async () => {
      await driver.ensureMetadataTable();
      await db(config.tableName).delete();

      const version = await driver.getCurrentVersion();
      assert.equal(version, 0);
    },
  );

  await t.test(
    "executeStep() runs complex multi-statement SQL successfully",
    async () => {
      await driver.ensureMetadataTable();

      const complexSql = `
      -- Set up a secondary schema tracking table
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);
      
      -- Insert statements validating line-comment sanitisation
      INSERT INTO users (id, name) VALUES (1, 'Alice'); -- inline comment
      INSERT INTO users (id, name) VALUES (2, 'Bob');
    `;

      await driver.executeStep(complexSql, 1);

      const hasUsersTable = await db.schema.hasTable("users");
      assert.equal(hasUsersTable, true);

      const count = await db("users").count({ c: "*" }).first();
      assert.equal(count?.c, 2);
    },
  );
});

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { AgnosticLinearEngine } from "./engine.ts";
import type { IDatabaseDriver, LinearDbConfig } from "./types.ts";

const createMockDriver = () => {
  return {
    connect: async () => {},
    ensureMetadataTable: async () => {},
    getCurrentVersion: async () => 0,
    executeStep: async (_sql: string, _version: number) => {},
    disconnect: async () => {},
  } as unknown as IDatabaseDriver & {
    getCurrentVersion: () => Promise<number>;
    executeStep: (sql: string, v: number) => Promise<void>;
  };
};

test("AgnosticLinearEngine", async (t) => {
  let tempDir: string;
  let config: LinearDbConfig;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "linear-db-test-"));
    config = {
      tableName: "meta",
      idColumn: "id",
      versionColumn: "version",
      scriptsDir: tempDir,
    };
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test(
    "getAndValidateScripts() throws error if scripts folder is missing",
    async () => {
      config.scriptsDir = path.join(tempDir, "does-not-exist");
      const mockDriver = createMockDriver();
      const engine = new AgnosticLinearEngine(mockDriver, config);

      assert.throws(() => {
        engine.getAndValidateScripts();
      }, /Scripts directory does not exist/);
    },
  );

  await t.test(
    "getAndValidateScripts() correctly extracts and sorts valid sql variants",
    async () => {
      fs.writeFileSync(path.join(tempDir, "v0002__add_users.sql"), "SELECT 2;");
      fs.writeFileSync(path.join(tempDir, "v0001__init.sql"), "SELECT 1;");
      fs.writeFileSync(path.join(tempDir, "random_notes.txt"), "Skip me");
      fs.writeFileSync(path.join(tempDir, "bad_name.sql"), "Skip me too");

      const mockDriver = createMockDriver();
      const engine = new AgnosticLinearEngine(mockDriver, config);
      const scripts = engine.getAndValidateScripts();

      assert.equal(scripts.length, 2);
      assert.equal(scripts[0].version, 1);
      assert.equal(scripts[0].description, "init");
      assert.equal(scripts[1].version, 2);
      assert.equal(scripts[1].description, "add_users");
    },
  );

  await t.test(
    "getAndValidateScripts() throws cleanly on duplicate versions",
    async () => {
      fs.writeFileSync(path.join(tempDir, "v0001__init.sql"), "SELECT 1;");
      fs.writeFileSync(path.join(tempDir, "v0001__duplicate.sql"), "SELECT 1;");

      const mockDriver = createMockDriver();
      const engine = new AgnosticLinearEngine(mockDriver, config);

      assert.throws(() => {
        engine.getAndValidateScripts();
      }, /Critical Collision: Duplicate version number found/);
    },
  );

  await t.test(
    "updateToPoint() stops early if current state matches target version",
    async () => {
      const mockDriver = createMockDriver();
      let disconnectCalled = false;
      mockDriver.getCurrentVersion = async () => 5;
      mockDriver.disconnect = async () => {
        disconnectCalled = true;
      };

      const engine = new AgnosticLinearEngine(mockDriver, config);
      await engine.updateToPoint(5);

      assert.equal(disconnectCalled, true);
    },
  );

  await t.test(
    "updateToPoint() blocks execution if targeting an older downgrade version",
    async () => {
      const mockDriver = createMockDriver();
      mockDriver.getCurrentVersion = async () => 5;

      const engine = new AgnosticLinearEngine(mockDriver, config);

      await assert.rejects(
        () => engine.updateToPoint(3),
        /Downgrades are prohibited/,
      );
    },
  );

  await t.test(
    "updateToPoint() throws Broken Chain error if sequential version step is missing",
    async () => {
      fs.writeFileSync(path.join(tempDir, "v0001__step_1.sql"), "SELECT 1;");
      fs.writeFileSync(path.join(tempDir, "v0003__step_3.sql"), "SELECT 3;");

      const mockDriver = createMockDriver();
      mockDriver.getCurrentVersion = async () => 0;

      const engine = new AgnosticLinearEngine(mockDriver, config);

      await assert.rejects(
        () => engine.updateToPoint(3),
        /Broken Chain: Missing sequential steps between v0 and v3/,
      );
    },
  );

  await t.test(
    "updateToPoint() reads file contents and executes steps sequentially inside chain window",
    async () => {
      fs.writeFileSync(path.join(tempDir, "v0001__step1.sql"), "SQL_1");
      fs.writeFileSync(path.join(tempDir, "v0002__step2.sql"), "SQL_2");
      fs.writeFileSync(path.join(tempDir, "v0003__step3.sql"), "SQL_3");

      const mockDriver = createMockDriver();
      mockDriver.getCurrentVersion = async () => 1;

      const executedSteps: { sql: string; version: number }[] = [];
      mockDriver.executeStep = async (sql, version) => {
        executedSteps.push({ sql, version });
      };

      const engine = new AgnosticLinearEngine(mockDriver, config);
      await engine.updateToPoint(3);

      assert.equal(executedSteps.length, 2);
      assert.deepEqual(executedSteps[0], { sql: "SQL_2", version: 2 });
      assert.deepEqual(executedSteps[1], { sql: "SQL_3", version: 3 });
    },
  );
});

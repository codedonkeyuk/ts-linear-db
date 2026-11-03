import { test, describe, mock } from "node:test";
import assert from "node:assert/strict";

const mockConnect = mock.fn(async () => {});
const mockDisconnect = mock.fn(async () => {});
const mockEnsureMetadataTable = mock.fn(async () => {});
const mockGetCurrentVersion = mock.fn(async () => 42);
const mockExecuteStep = mock.fn(async () => {});

class MockKnexDriver {
  connect = mockConnect;
  disconnect = mockDisconnect;
  ensureMetadataTable = mockEnsureMetadataTable;
  getCurrentVersion = mockGetCurrentVersion;
  executeStep = mockExecuteStep;
}

mock.module(import.meta.resolve("./drivers/knexDriver.ts"), {
  namedExports: { KnexDriver: MockKnexDriver },
});

const mockScripts = [{ version: 1, description: "Initial schema setup" }];
const mockGetAndValidateScripts = mock.fn(() => mockScripts);
const mockUpdateToPoint = mock.fn(async (_targetVersion: number) => {});

class MockAgnosticLinearEngine {
  driver: any;
  config: any;
  constructor(driver: any, config: any) {
    this.driver = driver;
    this.config = config;
  }
  getAndValidateScripts = mockGetAndValidateScripts;
  updateToPoint = mockUpdateToPoint;
}

mock.module(import.meta.resolve("./engine.ts"), {
  namedExports: { AgnosticLinearEngine: MockAgnosticLinearEngine },
});

const pkgSpy = mock.fn(() => ({}));
mock.module("knex", {
  exports: { default: pkgSpy },
});

const mockExistsSync = mock.fn(() => true);
const mockReadFileSync = mock.fn(() =>
  JSON.stringify({
    db: { client: "pg", connection: {} },
    engine: { scriptsDir: "./migrations" },
  }),
);

mock.module("fs", {
  namedExports: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
});

mock.method(console, "log", () => {});
mock.method(console, "error", () => {});

describe("CLI Engine Index Suite", () => {
  let originalArgv: string[];
  // oxlint-disable-next-line no-unused-vars
  let originalExit: typeof process.exit;
  let exitCalls: number[];

  originalArgv = [...process.argv];
  originalExit = process.exit.bind(process);

  process.exit = (code?: number | string | null): never => {
    exitCalls.push(Number(code || 0));
    throw new Error(`process.exit called with code ${code}`);
  };

  test("1. Branch Execution: 'status' parameter sequence validation", async () => {
    mockGetAndValidateScripts.mock.resetCalls();

    process.argv = [originalArgv[0], "index.js", "status"];

    const { run } = await import(
      `${import.meta.resolve("./index.ts")}?t=${Date.now()}`
    );

    await run();

    assert.equal(mockGetAndValidateScripts.mock.calls.length, 1);
    assert.equal(pkgSpy.mock.calls.length, 0);
  });

  test("2. Branch Execution: Numeric target execution migration pathway", async () => {
    mockUpdateToPoint.mock.resetCalls();
    pkgSpy.mock.resetCalls();

    process.argv = [originalArgv[0], "index.js", "15"];

    const { run } = await import(
      `${import.meta.resolve("./index.ts")}?t=${Date.now()}`
    );

    await run();

    assert.equal(pkgSpy.mock.calls.length, 1); // Confirms DB setup triggers
    assert.equal(mockUpdateToPoint.mock.calls.length, 1);
    assert.equal(mockUpdateToPoint.mock.calls[0].arguments[0], 15); // Target version parsed correctly
  });

  test("3. Error Route: Missing required command line parameter handling", async () => {
    exitCalls = [];
    process.argv = [originalArgv[0], "index.js"]; // Missing arg parameter completely

    try {
      await import(`${import.meta.resolve("./index.ts")}?t=${Date.now()}`);
    } catch {}

    assert.equal(exitCalls.includes(1), true);
  });

  test("4. Error Route: Invalid non-numeric / non-status variable parameters", async () => {
    exitCalls = [];
    process.argv = [originalArgv[0], "index.js", "not-an-integer"];

    const { run } = await import(
      `${import.meta.resolve("./index.ts")}?t=${Date.now()}`
    );

    try {
      await run();
    } catch {}

    assert.equal(exitCalls.includes(1), true);
  });
});

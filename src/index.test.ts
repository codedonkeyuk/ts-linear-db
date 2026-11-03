import { describe, test } from "node:test";
import assert from "node:assert";
import testee from "./index.ts";

describe("A simple description", () => {
  test("A simple test", () => {
    assert.strictEqual(testee, "Hello World!");
  });
});

/**
 * Tests of how the payments calculator tries a failed request again
 * (`retry`, in `get-validator-payments/fetch-validator-payments.js`).
 * @module test/validator-payments-retries.test
 *
 * The test hands `retry` a wait and printers of its own, through its
 * seam, so it reads each wait and line without a timer or the console.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { retry } from "../get-validator-payments/fetch-validator-payments.js";

describe("retry", () => {
  it("waits, and says it tries again, only when another attempt follows, so after the last of its 5 attempts it stops at once", async () => {
    const waits = [];
    const said = [];
    await assert.rejects(
      retry(
        async () => {
          throw new Error("no answer");
        },
        4,
        "fetching genesis",
        7,
        {
          wait: async (ms) => {
            waits.push(ms);
          },
          log: () => {},
          warn: (line) => said.push(line),
        },
      ),
      /after 5 attempts for fetching genesis\..*Last error: no answer/,
    );
    assert.deepEqual(waits, [7, 14, 21, 28]);
    assert.equal(said.length, 5);
    assert.equal(said.filter((line) => line.includes("Retrying...")).length, 4);
  });

  it("gives what an attempt gives once one succeeds, saying so", async () => {
    let attempts = 0;
    const said = [];
    const logged = [];
    const io = {
      wait: async () => {},
      log: (value) => logged.push(value),
      warn: (line) => said.push(line),
    };
    const answer = await retry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("busy");
        return "genesis";
      },
      4,
      "fetching genesis",
      7,
      io,
    );
    assert.equal(answer, "genesis");
    assert.equal(attempts, 3);
    assert.equal(said.length, 2);
    assert.equal(
      logged.at(-1),
      "Retry succeeded on attempt 3 for fetching genesis",
    );
  });
});

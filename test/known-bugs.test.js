/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { getValidatorPayments } from "../get-validator-payments/fetch-validator-payments.js";
import {
  END,
  OURS,
  paymentsChain,
  paymentsConfig,
  START,
} from "./helpers/payments-chain.js";
import { startStandInPulseChain } from "./helpers/stand-in-pulsechain.js";
import { knownBug } from "./helpers/known-bug.js";

describe("the payments calculator's genesis request", () => {
  knownBug(
    "asks again for the genesis time when the beacon node answers it with a server error",
    async () => {
      const standIn = await startStandInPulseChain(
        paymentsChain({
          failures: { "/beacon-api/eth/v1/beacon/genesis": 1 },
        }),
      );
      try {
        const result = await getValidatorPayments(
          [String(OURS.index)],
          START,
          END,
          paymentsConfig(standIn),
        ).catch((error) => error);
        assert.ok(!(result instanceof Error), String(result));
        assert.equal(
          standIn.asked.filter(
            (one) => one === "/beacon-api/eth/v1/beacon/genesis",
          ).length,
          2,
        );
      } finally {
        await standIn.close();
      }
    },
  );
});

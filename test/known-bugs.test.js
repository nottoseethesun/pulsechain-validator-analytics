/**
 * The known bugs, each declared with `knownBug`, which passes while its bug
 * is present. The fix of a bug makes its test fail; the same change
 * declares the test with `it` instead, among the tests of the code it is
 * about.
 * @module test/known-bugs.test
 *
 * The payments calculator runs against the stand-in beacon node
 * (`helpers/stand-in-pulsechain.js`), with the payments tests' chain
 * (`helpers/payments-chain.js`), set to answer each request's status and
 * headers and never the whole of its body.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { getValidatorPayments } from "../get-validator-payments/fetch-validator-payments.js";
import { knownBug } from "./helpers/known-bug.js";
import {
  END,
  OURS,
  paymentsChain,
  paymentsConfig,
  START,
} from "./helpers/payments-chain.js";
import { startStandInPulseChain } from "./helpers/stand-in-pulsechain.js";

describe("known bugs of the payments calculator", () => {
  knownBug(
    "gives up on an answer whose body does not come within request_timeout_ms, rather than waiting with no end",
    async () => {
      const standIn = await startStandInPulseChain({
        ...paymentsChain(),
        stalledBodies: true,
      });
      try {
        const run = getValidatorPayments([String(OURS.index)], START, END, {
          ...paymentsConfig(standIn),
          request_timeout_ms: 300,
        }).then(
          () => "it gave totals",
          (error) => error,
        );
        const stalled = new Promise((resolve) => {
          setTimeout(
            () => resolve("still waiting after 10 seconds"),
            10000,
          ).unref();
        });
        const outcome = await Promise.race([run, stalled]);
        assert.ok(outcome instanceof Error, String(outcome));
        assert.match(outcome.message, /gave no answer within 0\.3 seconds/);
      } finally {
        await standIn.close();
      }
    },
  );
});

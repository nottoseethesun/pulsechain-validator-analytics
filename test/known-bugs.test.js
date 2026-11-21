/**
 * The known bugs, each declared with `knownBug`, which passes while its bug
 * is present. The fix of a bug makes its test fail; the same change
 * declares the test with `it` instead, among the tests of the code it is
 * about.
 * @module test/known-bugs.test
 *
 * The tools run against the stand-in beacon node and rpc endpoint
 * (`helpers/stand-in-pulsechain.js`), with the payments tests' chain
 * (`helpers/payments-chain.js`): a day of hour-long slots, 24 to 47, and
 * epochs of 32 slots, so epoch 1 starts at slot 32.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { fetchValidatorExecutionAddress } from "../fetch-execution-address/execution-address.js";
import {
  getValidatorPayments,
  readConfig,
} from "../get-validator-payments/fetch-validator-payments.js";
import { knownBug } from "./helpers/known-bug.js";
import {
  END,
  FEE_RECIPIENT,
  gwei,
  OTHER,
  OURS,
  paymentsChain,
  paymentsConfig,
  START,
  WITHDRAWAL_ADDRESS,
} from "./helpers/payments-chain.js";
import { startStandInPulseChain } from "./helpers/stand-in-pulsechain.js";

/** The config.json shipped with the payments calculator. */
const SHIPPED = readConfig(
  new URL("../get-validator-payments/config.json", import.meta.url),
);

/**
 * Runs the payments calculator against a stand-in chain, then stops the
 * stand-in.
 *
 * @param {Object} chain - The stand-in chain
 * @param {Object} [settings={}] - Settings in place of the tests' own
 * @returns {Promise<Object>} What it returned
 */
async function paymentsFrom(chain, settings = {}) {
  const standIn = await startStandInPulseChain(chain);
  try {
    return await getValidatorPayments([String(OURS.index)], START, END, {
      ...paymentsConfig(standIn),
      ...settings,
    });
  } finally {
    await standIn.close();
  }
}

/**
 * A withdrawal to the tests' validator.
 *
 * @param {string} amount - Its amount, in gwei
 * @returns {Object} The withdrawal, as the beacon api gives it
 */
function withdrawal(amount) {
  return {
    validator_index: String(OURS.index),
    amount,
    address: WITHDRAWAL_ADDRESS,
  };
}

describe("known bugs of the payments calculator", () => {
  knownBug(
    "holds config.json's stake to PulseChain's MAX_EFFECTIVE_BALANCE, 32,000,000 PLS, and its epochs to 32 slots",
    () => {
      assert.equal(SHIPPED.max_effective_balance, 32000000);
      assert.equal(SHIPPED.slots_per_epoch, 32);
    },
  );

  knownBug(
    "counts in full a partial withdrawal of the size PulseChain pays today, with the settings shipped",
    async () => {
      // 2,377.373560479 PLS, a withdrawal at slot 11150968 on PulseChain
      const result = await paymentsFrom(
        paymentsChain({
          blocks: {
            25: {
              proposer: OTHER.index,
              withdrawals: [withdrawal("2377373560479")],
            },
          },
        }),
        {
          max_effective_balance: SHIPPED.max_effective_balance,
          slots_per_epoch: SHIPPED.slots_per_epoch,
        },
      );
      assert.deepEqual(result.consensus, {
        [WITHDRAWAL_ADDRESS]: 2377.373560479,
      });
    },
  );

  knownBug(
    "counts as payment only what a full exit, the withdrawal at or after the validator's withdrawable epoch, pays above the stake: none when penalties left less",
    async () => {
      // Withdrawable from epoch 1, slot 32: the withdrawal at 40 is its full
      // exit, 31 PLS after penalties, so less than the stake of 32; the one
      // at 30, before, is a partial withdrawal of 33 PLS
      const result = await paymentsFrom(
        paymentsChain({
          validators: [{ ...OURS, withdrawableEpoch: "1" }, OTHER],
          blocks: {
            30: {
              proposer: OTHER.index,
              withdrawals: [withdrawal("33000000000")],
            },
            40: {
              proposer: OTHER.index,
              withdrawals: [withdrawal("31000000000")],
            },
          },
        }),
      );
      assert.deepEqual(result.consensus, { [WITHDRAWAL_ADDRESS]: 33 });
    },
  );

  knownBug(
    "counts a slot's withdrawals once when the block a validator named proposed in it is asked for again",
    async () => {
      const result = await paymentsFrom(
        paymentsChain({
          blocks: {
            30: {
              proposer: OURS.index,
              withdrawals: [withdrawal("2000000000")],
              blockNumber: 1000,
              feeRecipient: FEE_RECIPIENT,
            },
          },
          executionBlocks: {
            1000: { baseFeePerGas: gwei(10), transactions: [] },
          },
          failures: { "/rpc": 1 },
        }),
      );
      assert.deepEqual(result.consensus, { [WITHDRAWAL_ADDRESS]: 2 });
    },
  );
});

describe("known bugs of the execution address lookup", () => {
  knownBug(
    "gives up on a beacon node that does not answer, giving the error in place of the address",
    async () => {
      const standIn = await startStandInPulseChain({
        validators: [OURS],
        stalled: true,
      });
      try {
        const looked = fetchValidatorExecutionAddress(
          [String(OURS.index)],
          standIn.beaconUrl,
          { timeoutMs: 500 },
        );
        const stalled = new Promise((resolve) => {
          setTimeout(
            () => resolve("still waiting after 5 seconds"),
            5000,
          ).unref();
        });
        const results = await Promise.race([looked, stalled]);
        assert.notEqual(results, "still waiting after 5 seconds");
        assert.match(results[String(OURS.index)], /^Error: /);
      } finally {
        await standIn.close();
      }
    },
  );
});

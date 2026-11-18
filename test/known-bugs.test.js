/**
 * Known bugs, each declared with `knownBug` (`helpers/known-bug.js`): the
 * test states what the code should do, and passes while the code does not.
 * A bug's fix makes its test fail; the same change declares the test with
 * `it`, among the tests of the code it is about.
 * @module test/known-bugs.test
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { getValidatorPayments } from "../get-validator-payments/fetch-validator-payments.js";
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

/**
 * Runs the calculator for the tests' validator against a stand-in chain,
 * then stops the stand-in.
 *
 * @param {Object} chain - The stand-in chain
 * @returns {Promise<Object>} What it returned
 */
async function paymentsFrom(chain) {
  const standIn = await startStandInPulseChain(chain);
  try {
    return await getValidatorPayments(
      [String(OURS.index)],
      START,
      END,
      paymentsConfig(standIn),
    );
  } finally {
    await standIn.close();
  }
}

describe("getValidatorPayments", () => {
  knownBug(
    "counts a legacy transaction's tip: its gas price less the base fee",
    async () => {
      // A legacy transaction names a gas price alone: 12 gwei over a base
      // fee of 10 tips 2 gwei a unit of gas, on 21,000 gas.
      const result = await paymentsFrom(
        paymentsChain({
          blocks: {
            30: {
              proposer: OURS.index,
              blockNumber: 1000,
              feeRecipient: FEE_RECIPIENT,
            },
          },
          executionBlocks: {
            1000: {
              baseFeePerGas: gwei(10),
              transactions: [{ hash: "0xlegacy", gasPrice: gwei(12) }],
            },
          },
          receipts: { "0xlegacy": "0x5208" },
        }),
      );
      assert.deepEqual(result.execution, {
        [FEE_RECIPIENT]: (2e9 * 21000) / 1e18,
      });
    },
  );

  knownBug(
    "fails, rather than giving totals that leave it out, when a slot's block cannot be read after every attempt",
    async () => {
      await assert.rejects(
        paymentsFrom(
          paymentsChain({
            blocks: {
              25: {
                proposer: OTHER.index,
                withdrawals: [
                  {
                    validator_index: String(OURS.index),
                    amount: "2000000000",
                    address: WITHDRAWAL_ADDRESS,
                  },
                ],
              },
            },
            failures: { "/beacon-api/eth/v1/beacon/blocks/25": Infinity },
          }),
        ),
      );
    },
  );

  knownBug(
    "leaves out a payment at midnight of the end day, which its header says is not counted",
    async () => {
      // Slot 48 is the end day's midnight, exactly.
      const result = await paymentsFrom(
        paymentsChain({
          blocks: {
            48: {
              proposer: OTHER.index,
              withdrawals: [
                {
                  validator_index: String(OURS.index),
                  amount: "3000000000",
                  address: WITHDRAWAL_ADDRESS,
                },
              ],
            },
          },
        }),
      );
      assert.deepEqual(result.consensus, {});
    },
  );
});

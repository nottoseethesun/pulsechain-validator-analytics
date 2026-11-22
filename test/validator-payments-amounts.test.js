/**
 * Tests of how the payments calculator, `getValidatorPayments`, adds up
 * amounts: as BigInt, in gwei and in wei, each total written as exact
 * decimal PLS.
 * @module test/validator-payments-amounts.test
 *
 * The calculator asks a stand-in beacon node and rpc endpoint
 * (`helpers/stand-in-pulsechain.js`), so the tests ask nothing outside the
 * computer.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getValidatorPayments } from "../get-validator-payments/fetch-validator-payments.js";
import {
  END,
  OTHER,
  OURS,
  paymentsChain,
  paymentsConfig,
  START,
  WITHDRAWAL_ADDRESS,
  WITHDRAWAL_ADDRESS_EIP55,
} from "./helpers/payments-chain.js";
import { startStandInPulseChain } from "./helpers/stand-in-pulsechain.js";

/**
 * The consensus totals of withdrawals to validator 7, withdrawable from
 * epoch 1, slot 32.
 *
 * @param {Object<number, string[]>} amounts - Each slot's withdrawals, in gwei
 * @param {Object} [settings] - Settings over the stand-in's
 * @returns {Promise<Object<string, string>>} The totals, by address
 */
async function consensusTotals(amounts, settings = {}) {
  const blocks = {};
  for (const [slot, list] of Object.entries(amounts)) {
    blocks[slot] = {
      proposer: OTHER.index,
      withdrawals: list.map((amount) => ({
        validator_index: String(OURS.index),
        amount,
        address: WITHDRAWAL_ADDRESS,
      })),
    };
  }
  const standIn = await startStandInPulseChain(
    paymentsChain({
      validators: [{ ...OURS, withdrawableEpoch: "1" }, OTHER],
      blocks,
    }),
  );
  try {
    const result = await getValidatorPayments(
      [String(OURS.index)],
      START,
      END,
      {
        ...paymentsConfig(standIn),
        ...settings,
      },
    );
    return result.consensus;
  } finally {
    await standIn.close();
  }
}

describe("getValidatorPayments, its amounts", () => {
  it("counts a full exit's payment above the stake exactly, in decimal text", async () => {
    // 32,000,000.123456789 PLS in gwei, above 2^53, at slot 40, after the
    // validator's withdrawable slot
    const totals = await consensusTotals(
      { 40: ["32000000123456789"] },
      { max_effective_balance: 32000000 },
    );
    assert.deepEqual(totals, { [WITHDRAWAL_ADDRESS_EIP55]: "0.123456789" });
  });

  it("adds partial withdrawals exactly: 0.1 and 0.2 PLS make 0.3", async () => {
    const totals = await consensusTotals({
      25: ["100000000"],
      26: ["200000000"],
    });
    assert.deepEqual(totals, { [WITHDRAWAL_ADDRESS_EIP55]: "0.3" });
  });
});

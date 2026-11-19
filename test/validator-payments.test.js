/**
 * Tests of the payments calculator, `getValidatorPayments`
 * (`get-validator-payments/fetch-validator-payments.js`), run against a
 * stand-in beacon node and rpc endpoint served on this computer
 * (`helpers/stand-in-pulsechain.js`), so they ask nothing outside it.
 * @module test/validator-payments.test
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getValidatorPayments,
  readConfig,
} from "../get-validator-payments/fetch-validator-payments.js";
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
 * Two blocks that pay the tests' validator. Slot 25: a withdrawal of 2 PLS,
 * to its address written in capitals, and one to the other validator.
 * Slot 30: a full exit of 40 PLS, of which 32 is principal, and a block it
 * proposed, whose two transactions pay tips of 2 gwei on 21,000 gas, and
 * of 45 gwei, the most its 55 gwei cap leaves over the 10 gwei base fee, on
 * 100,000 gas.
 */
const PAYING = {
  blocks: {
    25: {
      proposer: OTHER.index,
      withdrawals: [
        {
          validator_index: String(OURS.index),
          amount: "2000000000",
          address: WITHDRAWAL_ADDRESS.toUpperCase().replace("0X", "0x"),
        },
        {
          validator_index: String(OTHER.index),
          amount: "5000000000",
          address: `0x${"bb".repeat(20)}`,
        },
      ],
    },
    30: {
      proposer: OURS.index,
      withdrawals: [
        {
          validator_index: String(OURS.index),
          amount: "40000000000",
          address: WITHDRAWAL_ADDRESS,
        },
      ],
      blockNumber: 1000,
      feeRecipient: FEE_RECIPIENT,
    },
  },
  executionBlocks: {
    1000: {
      baseFeePerGas: gwei(10),
      transactions: [
        {
          hash: "0xt1",
          maxPriorityFeePerGas: gwei(2),
          maxFeePerGas: gwei(100),
        },
        {
          hash: "0xt2",
          maxPriorityFeePerGas: gwei(50),
          maxFeePerGas: gwei(55),
        },
      ],
    },
  },
  receipts: { "0xt1": "0x5208", "0xt2": "0x186a0" },
};

/** What those blocks pay: in PLS, by address. */
const PAID = {
  consensus: { [WITHDRAWAL_ADDRESS]: 10 },
  execution: { [FEE_RECIPIENT]: (2e9 * 21000 + 45e9 * 100000) / 1e18 },
};

/**
 * Runs the calculator against a stand-in chain, then stops the stand-in.
 *
 * @param {Object} chain - The stand-in chain
 * @param {Object} [run] - The validators and days, if not the tests' validator on START
 * @returns {Promise<{result: Object, asked: string[]}>} What it returned, and the paths it asked
 */
async function paymentsFrom(
  chain,
  { ids = [String(OURS.index)], start = START, end = END } = {},
) {
  const standIn = await startStandInPulseChain(chain);
  try {
    const result = await getValidatorPayments(
      ids,
      start,
      end,
      paymentsConfig(standIn),
    );
    return { result, asked: standIn.asked };
  } finally {
    await standIn.close();
  }
}

describe("getValidatorPayments", () => {
  it("totals the withdrawals to the validators named, by address in lowercase, less a full exit's principal, and the tips of the blocks they proposed, by fee recipient", async () => {
    const { result } = await paymentsFrom(paymentsChain(PAYING));
    assert.deepEqual(result, PAID);
  });

  it("takes a validator by its public key", async () => {
    const { result } = await paymentsFrom(paymentsChain(PAYING), {
      ids: [OURS.pubkey],
    });
    assert.deepEqual(result, PAID);
  });

  it("counts a legacy transaction's tip: its gas price less the base fee", async () => {
    // A legacy transaction names a gas price alone: 12 gwei over a base
    // fee of 10 tips 2 gwei a unit of gas, on 21,000 gas.
    const { result } = await paymentsFrom(
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
  });

  it("asks the genesis time and the validator first, then the slot of each hour from the first day's midnight to the last before the end day's", async () => {
    const { asked } = await paymentsFrom(paymentsChain());
    assert.deepEqual(asked.slice(0, 2), [
      "/beacon-api/eth/v1/beacon/genesis",
      `/beacon-api/eth/v1/beacon/states/finalized/validators/${OURS.index}`,
    ]);
    const slots = asked
      .slice(2)
      .map((p) => Number(p.split("/").pop()))
      .sort((a, b) => a - b);
    assert.deepEqual(
      slots,
      Array.from({ length: 24 }, (_, i) => 24 + i),
    );
  });

  it("leaves out a payment at the end day's midnight, since the end day is not counted", async () => {
    // Slot 48 is the end day's midnight, exactly.
    const { result } = await paymentsFrom(
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
  });

  it("skips a slot with no block", async () => {
    const chain = paymentsChain(PAYING);
    delete chain.blocks[26];
    const { result } = await paymentsFrom(chain);
    assert.deepEqual(result, PAID);
  });

  it("asks again for a block it could not read at first", async () => {
    const { result, asked } = await paymentsFrom(
      paymentsChain({
        ...PAYING,
        failures: { "/beacon-api/eth/v1/beacon/blocks/30": 1 },
      }),
    );
    assert.deepEqual(result, PAID);
    assert.equal(
      asked.filter((p) => p === "/beacon-api/eth/v1/beacon/blocks/30").length,
      2,
    );
  });

  it("fails, rather than giving totals that leave it out, when a slot's block cannot be read after every attempt", async () => {
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
      /after 5 attempts for processing slot 25\./,
    );
  });

  it("counts no tips from a proposed block the endpoint does not know", async () => {
    const { result } = await paymentsFrom(
      paymentsChain({ ...PAYING, executionBlocks: {} }),
    );
    assert.deepEqual(result, { consensus: PAID.consensus, execution: {} });
  });

  it("refuses a run with no validator it can find", async () => {
    await assert.rejects(
      paymentsFrom(paymentsChain(), { ids: ["12345"] }),
      /No valid validators found\./,
    );
  });

  it("refuses a date it cannot read", async () => {
    await assert.rejects(
      paymentsFrom(paymentsChain(), { start: "2026-01-xx" }),
      /Invalid date format provided\./,
    );
  });

  it("refuses a start after the end", async () => {
    await assert.rejects(
      paymentsFrom(paymentsChain(), { start: END, end: START }),
      /Start slot is greater than end slot\./,
    );
  });
});

describe("readConfig", () => {
  let folder;

  before(() => {
    folder = fs.mkdtempSync(
      path.join(os.tmpdir(), "pulsechain-validator-analytics-test-config-"),
    );
  });

  after(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it("reads the settings from a config.json", () => {
    const file = path.join(folder, "config.json");
    fs.writeFileSync(file, JSON.stringify({ concurrency: 3 }));
    assert.deepEqual(readConfig(file), { concurrency: 3 });
  });

  it("reads the config.json shipped with the tool", () => {
    const config = readConfig(
      new URL("../get-validator-payments/config.json", import.meta.url),
    );
    assert.equal(config.slot_interval_seconds, 12);
    assert.equal(config.gwei_to_pls, 1000000000);
  });
});

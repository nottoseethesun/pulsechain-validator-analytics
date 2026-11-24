/**
 * Tests of the payments calculator, `getValidatorPayments`
 * (`get-validator-payments/fetch-validator-payments.js`), run against a
 * stand-in beacon node and rpc endpoint served on this computer
 * (`helpers/stand-in-pulsechain.js`), so they ask nothing outside it.
 * @module test/validator-payments.test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getValidatorPayments,
  readConfig,
} from "../get-validator-payments/fetch-validator-payments.js";
import {
  END,
  FEE_RECIPIENT,
  FEE_RECIPIENT_EIP55,
  gwei,
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
 * Three blocks that pay the tests' validator, which is withdrawable from
 * epoch 1, slot 32. Slot 25: a withdrawal of 2 PLS, to its address written
 * in capitals, and one to the other validator. Slot 30: a block it
 * proposed, whose two transactions pay tips of 2 gwei on 21,000 gas, and
 * of 45 gwei, the most its 55 gwei cap leaves over the 10 gwei base fee, on
 * 100,000 gas. Slot 40: its full exit, 40 PLS, of which the stake is 32.
 */
const PAYING = {
  validators: [{ ...OURS, withdrawableEpoch: "1" }, OTHER],
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
      blockNumber: 1000,
      feeRecipient: FEE_RECIPIENT,
    },
    40: {
      proposer: OTHER.index,
      withdrawals: [
        {
          validator_index: String(OURS.index),
          amount: "40000000000",
          address: WITHDRAWAL_ADDRESS,
        },
      ],
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

/**
 * What those blocks pay: in PLS, as exact decimal text, by address. The
 * tips are 2 gwei times 21,000 gas and 45 gwei times 100,000 gas:
 * 4,542,000 gwei.
 */
const PAID = {
  consensus: { [WITHDRAWAL_ADDRESS_EIP55]: "10" },
  execution: { [FEE_RECIPIENT_EIP55]: "0.004542" },
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
  it("totals the withdrawals to the validators named, by address in EIP-55's mixed case, less the stake a full exit returns, and the tips of the blocks they proposed, by fee recipient", async () => {
    const { result } = await paymentsFrom(paymentsChain(PAYING));
    assert.deepEqual(result, PAID);
  });

  it("takes a validator by its public key", async () => {
    const { result } = await paymentsFrom(paymentsChain(PAYING), {
      ids: [OURS.pubkey],
    });
    assert.deepEqual(result, PAID);
  });

  it("counts in full a partial withdrawal of the size PulseChain pays today, with the settings shipped", async () => {
    // 2,377.373560479 PLS, a withdrawal at slot 11150968 on PulseChain
    const shipped = readConfig(
      new URL("../get-validator-payments/config.json", import.meta.url),
    );
    const standIn = await startStandInPulseChain(
      paymentsChain({
        blocks: {
          25: {
            proposer: OTHER.index,
            withdrawals: [
              {
                validator_index: String(OURS.index),
                amount: "2377373560479",
                address: WITHDRAWAL_ADDRESS,
              },
            ],
          },
        },
      }),
    );
    try {
      const result = await getValidatorPayments(
        [String(OURS.index)],
        START,
        END,
        {
          ...paymentsConfig(standIn),
          max_effective_balance: shipped.max_effective_balance,
          slots_per_epoch: shipped.slots_per_epoch,
        },
      );
      assert.deepEqual(result.consensus, {
        [WITHDRAWAL_ADDRESS_EIP55]: "2377.373560479",
      });
    } finally {
      await standIn.close();
    }
  });

  it("counts as payment only what a full exit, the withdrawal at or after the validator's withdrawable epoch, pays above the stake: none when penalties left less", async () => {
    // Withdrawable from epoch 1, slot 32: the withdrawal at 40 is its full
    // exit, 31 PLS after penalties, so less than the stake of 32; the one
    // at 30, before, is a partial withdrawal of 33 PLS
    const paid = (amount) => ({
      validator_index: String(OURS.index),
      amount,
      address: WITHDRAWAL_ADDRESS,
    });
    const { result } = await paymentsFrom(
      paymentsChain({
        validators: [{ ...OURS, withdrawableEpoch: "1" }, OTHER],
        blocks: {
          30: { proposer: OTHER.index, withdrawals: [paid("33000000000")] },
          40: { proposer: OTHER.index, withdrawals: [paid("31000000000")] },
        },
      }),
    );
    assert.deepEqual(result.consensus, { [WITHDRAWAL_ADDRESS_EIP55]: "33" });
  });

  it("counts a slot's withdrawals once when the block a validator named proposed in it is asked for again", async () => {
    const { result } = await paymentsFrom(
      paymentsChain({
        blocks: {
          30: {
            proposer: OURS.index,
            withdrawals: [
              {
                validator_index: String(OURS.index),
                amount: "2000000000",
                address: WITHDRAWAL_ADDRESS,
              },
            ],
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
    assert.deepEqual(result.consensus, { [WITHDRAWAL_ADDRESS_EIP55]: "2" });
  });

  it("gives up on an answer whose body does not come within request_timeout_ms, rather than waiting with no end", async () => {
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
      assert.match(
        outcome.message,
        /after 5 attempts for fetching genesis\..*\/eth\/v1\/beacon\/genesis gave no answer within 0\.3 seconds/,
      );
    } finally {
      await standIn.close();
    }
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
      [FEE_RECIPIENT_EIP55]: "0.000042",
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

  it("asks again for the genesis time when the beacon node answers it with a server error", async () => {
    const { result, asked } = await paymentsFrom(
      paymentsChain({
        ...PAYING,
        failures: { "/beacon-api/eth/v1/beacon/genesis": 1 },
      }),
    );
    assert.deepEqual(result, PAID);
    assert.equal(
      asked.filter((p) => p === "/beacon-api/eth/v1/beacon/genesis").length,
      2,
    );
  });

  it("waits retry_delay_ms, as config.json sets it, times the attempt, before each new attempt", async () => {
    const standIn = await startStandInPulseChain(
      paymentsChain({
        ...PAYING,
        failures: { "/beacon-api/eth/v1/beacon/genesis": Infinity },
      }),
    );
    const began = performance.now();
    try {
      await assert.rejects(
        getValidatorPayments([String(OURS.index)], START, END, {
          ...paymentsConfig(standIn),
          retry_delay_ms: 200,
        }),
        /after 5 attempts for fetching genesis\./,
      );
    } finally {
      await standIn.close();
    }
    const took = performance.now() - began;
    // 200, 400, 600 and 800 ms, where the default of 1000 ms waits 10 s
    assert.ok(took >= 1990, `the attempts took ${took} ms, under 2 s`);
    assert.ok(took < 8000, `the attempts took ${took} ms, near the default's`);
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

  it("fails, after asking again, when the endpoint cannot give a block a validator proposed", async () => {
    await assert.rejects(
      paymentsFrom(paymentsChain({ ...PAYING, executionBlocks: {} })),
      /after 5 attempts for processing slot 30\..*RPC error for block 1000: No result/,
    );
  });

  it("fails, after asking again, when the endpoint cannot give a transaction's receipt", async () => {
    await assert.rejects(
      paymentsFrom(
        paymentsChain({ ...PAYING, receipts: { "0xt1": "0x5208" } }),
      ),
      /processing slot 30\..*No receipt for txHash: 0xt2/,
    );
  });

  it("asks for a transaction's receipt it cannot read five times, as a failed request is tried again four more times, not 25", async () => {
    const standIn = await startStandInPulseChain(
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
            transactions: [{ hash: "0xt1", gasPrice: gwei(12) }],
          },
        },
      }),
    );
    try {
      await assert.rejects(
        getValidatorPayments(
          [String(OURS.index)],
          START,
          END,
          paymentsConfig(standIn),
        ),
        /after 5 attempts for processing slot 30\..*No receipt for txHash: 0xt1/,
      );
      assert.equal(
        standIn.rpcRequests.filter(
          (request) => request.method === "eth_getTransactionReceipt",
        ).length,
        5,
      );
    } finally {
      await standIn.close();
    }
  });

  it("asks again for a validator it could not look up at first", async () => {
    const lookup = `/beacon-api/eth/v1/beacon/states/finalized/validators/${OURS.index}`;
    const { result, asked } = await paymentsFrom(
      paymentsChain({ ...PAYING, failures: { [lookup]: 1 } }),
    );
    assert.deepEqual(result, PAID);
    assert.equal(asked.filter((p) => p === lookup).length, 2);
  });

  it("refuses a run with a validator it cannot find, rather than leaving its payments out", async () => {
    await assert.rejects(
      paymentsFrom(paymentsChain(PAYING), {
        ids: [String(OURS.index), "12345"],
      }),
      /Failed to fetch validator 12345: HTTP 404/,
    );
  });

  it("refuses a run with no validator", async () => {
    await assert.rejects(
      paymentsFrom(paymentsChain(), { ids: [] }),
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

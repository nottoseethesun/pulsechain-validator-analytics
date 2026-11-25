/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), which passes while the bug is there.
 * @module test/known-bugs.test
 *
 * The payments calculator runs against the stand-in beacon node and rpc
 * endpoint (`helpers/stand-in-pulsechain.js`), which answers a json-rpc
 * request 500 as many times as the test says before it answers it.
 */

import { describe } from "node:test";
import assert from "node:assert/strict";
import { getValidatorPayments } from "../get-validator-payments/fetch-validator-payments.js";
import { knownBug } from "./helpers/known-bug.js";
import {
  END,
  FEE_RECIPIENT,
  OURS,
  START,
  gwei,
  paymentsChain,
  paymentsConfig,
} from "./helpers/payments-chain.js";
import { startStandInPulseChain } from "./helpers/stand-in-pulsechain.js";

describe("the payments calculator, when an endpoint turns some requests away", () => {
  knownBug(
    "reads a proposed block whose six receipts each fail once, asking each again by itself",
    async () => {
      const hashes = ["0xt1", "0xt2", "0xt3", "0xt4", "0xt5", "0xt6"];
      const standIn = await startStandInPulseChain({
        ...paymentsChain({
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
              transactions: hashes.map((hash) => ({
                hash,
                gasPrice: gwei(12),
              })),
            },
          },
          receipts: Object.fromEntries(hashes.map((hash) => [hash, "0x5208"])),
        }),
        rpcFailures: Object.fromEntries(
          hashes.map((hash) => [`eth_getTransactionReceipt ${hash}`, 1]),
        ),
      });
      try {
        await assert.doesNotReject(
          getValidatorPayments(
            [String(OURS.index)],
            START,
            END,
            paymentsConfig(standIn),
          ),
        );
      } finally {
        await standIn.close();
      }
    },
  );
});

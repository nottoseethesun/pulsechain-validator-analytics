/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), which passes while the bug is there.
 * @module test/known-bugs.test
 *
 * The payments calculator runs against the stand-in beacon node and rpc
 * endpoint (`helpers/stand-in-pulsechain.js`), which keeps each json-rpc
 * request it answers.
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

describe("the payments calculator, when a transaction's receipt cannot be read", () => {
  knownBug(
    "asks for it five times, as a failed request is tried again four more times, not 25",
    async () => {
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
    },
  );
});

/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here.
 */

import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe } from "node:test";
import assert from "node:assert/strict";
import { knownBug } from "./helpers/known-bug.js";
import { getValidatorPayments } from "../get-validator-payments/fetch-validator-payments.js";
import { executionAddressOf } from "../fetch-execution-address/execution-address.js";
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

/** The payments calculator's command line. */
const PAYMENTS = fileURLToPath(
  new URL("../get-validator-payments/index.js", import.meta.url),
);

/**
 * Runs the payments calculator's command line in a temp folder whose
 * config.json points it at a stand-in chain.
 *
 * @param {string[]} args - Its arguments
 * @param {function(import('node:child_process').ChildProcess): void} [watch] - Called with the run, as it starts
 * @returns {Promise<{code: number, stderr: string, asked: string[]}>} How it ended, and what the stand-in was asked
 */
async function runPayments(args, watch) {
  const standIn = await startStandInPulseChain(paymentsChain());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pva-known-bug-"));
  try {
    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify(paymentsConfig(standIn)),
    );
    const ended = await new Promise((resolve, reject) => {
      const child =
        watch === undefined
          ? execFile(
              process.execPath,
              [PAYMENTS, ...args],
              { cwd: dir },
              (error, _stdout, stderr) =>
                resolve({ code: error ? error.code : 0, stderr }),
            )
          : spawn(process.execPath, [PAYMENTS, ...args], {
              cwd: dir,
              stdio: ["ignore", "pipe", "pipe"],
            });
      if (watch !== undefined) {
        let stderr = "";
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("exit", (code) => resolve({ code, stderr }));
        watch(child);
      }
      child.on("error", reject);
    });
    return { ...ended, asked: [...standIn.asked] };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    await standIn.close();
  }
}

describe("the payments calculator", () => {
  knownBug(
    "refuses a --start on or after --end, naming it, before it asks anything",
    async () => {
      for (const [start, end] of [
        ["2026-01-02", "2026-01-01"],
        ["2026-01-01", "2026-01-01"],
      ]) {
        const run = await runPayments([
          "--ids",
          String(OURS.index),
          "--start",
          start,
          "--end",
          end,
        ]);
        assert.equal(run.code, 1);
        assert.deepEqual(run.asked, []);
        assert.match(run.stderr, /--start/);
      }
    },
  );

  knownBug(
    "ends with exit code 1 when the program reading its output stops reading before the totals reach it",
    async () => {
      const run = await runPayments(
        ["--ids", String(OURS.index), "--start", START, "--end", END],
        (child) => child.stdout.once("data", () => child.stdout.destroy()),
      );
      assert.equal(run.code, 1);
    },
  );

  knownBug(
    "counts a full exit's payment above the stake exactly, in decimal text",
    async () => {
      const standIn = await startStandInPulseChain(
        paymentsChain({
          validators: [{ ...OURS, withdrawableEpoch: "1" }, OTHER],
          blocks: {
            40: {
              proposer: OTHER.index,
              withdrawals: [
                {
                  validator_index: String(OURS.index),
                  amount: "32000000123456789",
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
          { ...paymentsConfig(standIn), max_effective_balance: 32000000 },
        );
        assert.deepEqual(result.consensus, {
          [WITHDRAWAL_ADDRESS_EIP55]: "0.123456789",
        });
      } finally {
        await standIn.close();
      }
    },
  );
});

describe("executionAddressOf", () => {
  knownBug(
    "reads the address that withdrawal credentials of the 0x02 kind name",
    () => {
      assert.equal(
        executionAddressOf(`0x02${"0".repeat(22)}${"aa".repeat(20)}`),
        WITHDRAWAL_ADDRESS_EIP55,
      );
    },
  );
});

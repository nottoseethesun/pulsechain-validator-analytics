/**
 * The known bugs, each declared with `knownBug` (`helpers/known-bug.js`),
 * so its test passes while the bug is present.
 * @module test/known-bugs.test
 *
 * The payments calculator runs as its owner runs it, in a child process,
 * in a temp folder of the test's own, removed afterwards, whose config.json
 * names a stand-in beacon node and rpc endpoint served on this computer
 * (`helpers/stand-in-pulsechain.js`).
 */

import { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { knownBug } from "./helpers/known-bug.js";
import {
  END,
  OTHER,
  OURS,
  paymentsChain,
  paymentsConfig,
  START,
  WITHDRAWAL_ADDRESS,
} from "./helpers/payments-chain.js";
import { startStandInPulseChain } from "./helpers/stand-in-pulsechain.js";

const execFileAsync = promisify(execFile);

/** The payments calculator's command line. */
const PAYMENTS = fileURLToPath(
  new URL("../get-validator-payments/index.js", import.meta.url),
);

describe("get-validator-payments/index.js, with a config.json it should refuse", () => {
  let standIn;
  let folder;

  before(async () => {
    // One withdrawal of 2 PLS to the tests' validator, so a total shows
    standIn = await startStandInPulseChain(
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
      }),
    );
    folder = fs.mkdtempSync(
      path.join(os.tmpdir(), "pulsechain-validator-analytics-test-bugs-"),
    );
  });

  after(async () => {
    await standIn.close();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  /**
   * Runs the calculator with config.json's settings, one changed.
   *
   * @param {Object} changed - The settings changed
   * @returns {Promise<{code: number, stdout: string, stderr: string}>} How it ended
   */
  async function runWith(changed) {
    fs.writeFileSync(
      path.join(folder, "config.json"),
      JSON.stringify({ ...paymentsConfig(standIn), ...changed }),
    );
    try {
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        [PAYMENTS, `--ids=${OURS.index}`, `--start=${START}`, `--end=${END}`],
        { cwd: folder, timeout: 30000 },
      );
      return { code: 0, stdout, stderr };
    } catch (error) {
      return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
  }

  knownBug(
    'stops with exit code 1, naming the setting, on a gwei_to_pls of "abc"',
    async () => {
      const ended = await runWith({ gwei_to_pls: "abc" });
      assert.equal(ended.code, 1);
      assert.match(
        ended.stderr,
        /config\.json → gwei_to_pls must be a whole number above 0; it is "abc"/,
      );
    },
  );

  knownBug(
    'stops with exit code 1, naming the setting, on a concurrency of "two"',
    async () => {
      const ended = await runWith({ concurrency: "two" });
      assert.equal(ended.code, 1);
      assert.match(
        ended.stderr,
        /config\.json → concurrency must be a whole number above 0; it is "two"/,
      );
    },
  );
});

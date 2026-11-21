/**
 * Tests of the two tools' command lines, run as their owner runs them, in
 * a child process, against a stand-in beacon node and rpc endpoint served
 * on this computer (`helpers/stand-in-pulsechain.js`).
 * @module test/command-lines.test
 *
 * The payments calculator reads config.json from the folder it runs in, so
 * each of its runs is in a temp folder of the test's own, removed
 * afterwards, with a config.json that names the stand-in.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  END,
  OURS,
  paymentsChain,
  paymentsConfig,
  START,
} from "./helpers/payments-chain.js";
import { startStandInPulseChain } from "./helpers/stand-in-pulsechain.js";

const execFileAsync = promisify(execFile);

/** The two command lines. */
const EXECUTION_ADDRESS = fileURLToPath(
  new URL(
    "../fetch-execution-address/fetch-execution-address.js",
    import.meta.url,
  ),
);
const PAYMENTS = fileURLToPath(
  new URL("../get-validator-payments/index.js", import.meta.url),
);

/**
 * Runs a command line.
 *
 * @param {string} script - The command line
 * @param {string[]} args - Its arguments
 * @param {string} [cwd] - The folder it runs in
 * @returns {Promise<{code: number, stdout: string, stderr: string}>} How it ended
 */
async function run(script, args, cwd) {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [script, ...args],
      { cwd, timeout: 30000 },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

describe("fetch-execution-address.js", () => {
  let standIn;

  before(async () => {
    standIn = await startStandInPulseChain({ validators: [OURS] });
  });

  after(async () => {
    await standIn.close();
  });

  it("answers --help on stdout, with exit code 0", async () => {
    const ended = await run(EXECUTION_ADDRESS, ["--help"]);
    assert.equal(ended.code, 0);
    assert.match(ended.stdout, /^Usage: fetch-execution-address \[options\]/);
    assert.match(ended.stdout, /Exit codes:/);
  });

  it("prints each validator's address, from the beacon api --beacon-url names", async () => {
    const ended = await run(EXECUTION_ADDRESS, [
      `--ids=${OURS.index}`,
      `--beacon-url=${standIn.beaconUrl}`,
    ]);
    assert.equal(ended.code, 0, ended.stderr);
    assert.equal(
      ended.stdout,
      `Validator Execution Addresses:\n- ID ${OURS.index}: 0x${"aa".repeat(20)}\n`,
    );
  });

  it("refuses to run without --ids", async () => {
    const ended = await run(EXECUTION_ADDRESS, []);
    assert.equal(ended.code, 1);
    assert.match(ended.stderr, /required option '--ids <ids>' not specified/);
  });

  it("refuses a --beacon-url that is not an http or https url, naming it, before it asks anything", async () => {
    for (const url of ["notaurl", "ftp://example.com"]) {
      const ended = await run(EXECUTION_ADDRESS, [
        `--ids=${OURS.index}`,
        `--beacon-url=${url}`,
      ]);
      assert.equal(ended.code, 1);
      assert.match(
        ended.stderr,
        /option '--beacon-url <url>' argument '.*' is invalid/,
      );
    }
  });

  it("refuses a validator that is neither a public key nor an index", async () => {
    const ended = await run(EXECUTION_ADDRESS, ["--ids=12,0xabc"]);
    assert.equal(ended.code, 1);
    assert.match(
      ended.stderr,
      /Each validator is a public key, 0x and 96 hex digits, or an index/,
    );
  });
});

describe("get-validator-payments/index.js", () => {
  let standIn;
  let folder;

  before(async () => {
    standIn = await startStandInPulseChain(paymentsChain());
    folder = fs.mkdtempSync(
      path.join(os.tmpdir(), "pulsechain-validator-analytics-test-cli-"),
    );
    fs.writeFileSync(
      path.join(folder, "config.json"),
      JSON.stringify(paymentsConfig(standIn)),
    );
  });

  after(async () => {
    await standIn.close();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it("answers --help on stdout, with exit code 0", async () => {
    const ended = await run(PAYMENTS, ["--help"]);
    assert.equal(ended.code, 0);
    assert.match(ended.stdout, /^Usage: get-validator-payments \[options\]/);
    assert.match(
      ended.stdout,
      /The start date is counted; the end date is not\./,
    );
  });

  it("prints the totals as JSON, last, reading config.json from the folder it runs in", async () => {
    const ended = await run(
      PAYMENTS,
      [`--ids=${OURS.index}`, `--start=${START}`, `--end=${END}`],
      folder,
    );
    assert.equal(ended.code, 0, ended.stderr);
    assert.ok(
      ended.stdout.endsWith(
        `${JSON.stringify({ consensus: {}, execution: {} }, null, 2)}\n`,
      ),
    );
  });

  it("ends with exit code 1, saying why, when the run fails", async () => {
    const ended = await run(
      PAYMENTS,
      ["--ids=12345", `--start=${START}`, `--end=${END}`],
      folder,
    );
    assert.equal(ended.code, 1);
    assert.match(
      ended.stderr,
      /Error running validator payments calculation: Failed to fetch validator 12345: HTTP 404/,
    );
  });

  it("refuses --start 2026-02-30, naming --start, before it asks anything", async () => {
    const ended = await run(
      PAYMENTS,
      [`--ids=${OURS.index}`, "--start=2026-02-30", "--end=2026-03-05"],
      folder,
    );
    assert.equal(ended.code, 1);
    assert.match(
      ended.stderr,
      /option '--start <date>' argument '2026-02-30' is invalid/,
    );
  });

  it("refuses a date that is not a day in YYYY-MM-DD form", async () => {
    const ended = await run(PAYMENTS, [
      `--ids=${OURS.index}`,
      "--start=2026-1-1",
      `--end=${END}`,
    ]);
    assert.equal(ended.code, 1);
    assert.match(ended.stderr, /Not a day in YYYY-MM-DD form\./);
  });
});

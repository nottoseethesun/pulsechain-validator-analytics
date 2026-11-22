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
import { execFile, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
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

const execFileAsync = promisify(execFile);

/** The two command lines: their start files in bin/. */
const EXECUTION_ADDRESS = fileURLToPath(
  new URL("../bin/fetch-execution-address.js", import.meta.url),
);
const PAYMENTS = fileURLToPath(
  new URL("../bin/get-validator-payments.js", import.meta.url),
);

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

/**
 * Runs a tool's start file with `--help` as a checkout runs it after
 * `npm ci` in the tool's folder alone: from a copy of the start file in the
 * `bin/` of a temp folder, beside a link to the tool's folder, with no
 * packages of the top folder's to resolve from.
 *
 * @param {string} startFile - The start file's name in `bin/`
 * @param {string} toolFolder - The tool's folder, from the repo's top
 * @returns {import('node:child_process').SpawnSyncReturns<string>} The run
 */
function helpWithToolPackagesOnly(startFile, toolFolder) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), "pva-start-file-"));
  const link = path.join(top, toolFolder);
  try {
    fs.writeFileSync(path.join(top, "package.json"), '{"type":"module"}\n');
    fs.mkdirSync(path.join(top, "bin"));
    fs.copyFileSync(
      path.join(REPO_TOP, "bin", startFile),
      path.join(top, "bin", startFile),
    );
    fs.symlinkSync(path.join(REPO_TOP, toolFolder), link, "dir");
    return spawnSync(
      process.execPath,
      [path.join(top, "bin", startFile), "--help"],
      { cwd: top, encoding: "utf8", timeout: 30000 },
    );
  } finally {
    if (fs.existsSync(link)) fs.unlinkSync(link);
    fs.rmSync(top, { recursive: true, force: true });
  }
}

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

describe("bin/fetch-execution-address.js", () => {
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

  it("prints each validator's address, in EIP-55's mixed case, from the beacon api --beacon-url names", async () => {
    const ended = await run(EXECUTION_ADDRESS, [
      `--ids=${OURS.index}`,
      `--beacon-url=${standIn.beaconUrl}`,
    ]);
    assert.equal(ended.code, 0, ended.stderr);
    assert.equal(
      ended.stdout,
      `Validator Execution Addresses:\n- ID ${OURS.index}: ${WITHDRAWAL_ADDRESS_EIP55}\n`,
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

describe("bin/get-validator-payments.js", () => {
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
      /The start date is counted; the end date is not, so --start must come\nbefore --end\./,
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

describe("bin/get-validator-payments.js, with a config.json it refuses", () => {
  let standIn;
  let folder;

  before(async () => {
    // One withdrawal of 2 PLS to the tests' validator, so a total would show
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
      path.join(os.tmpdir(), "pulsechain-validator-analytics-test-settings-"),
    );
  });

  after(async () => {
    await standIn.close();
    fs.rmSync(folder, { recursive: true, force: true });
  });

  /**
   * Runs the calculator with config.json's settings, some changed.
   *
   * @param {Object} changed - The settings changed
   * @returns {Promise<{code: number, stdout: string, stderr: string}>} How it ended
   */
  async function runWith(changed) {
    fs.writeFileSync(
      path.join(folder, "config.json"),
      JSON.stringify({ ...paymentsConfig(standIn), ...changed }),
    );
    return run(
      PAYMENTS,
      [`--ids=${OURS.index}`, `--start=${START}`, `--end=${END}`],
      folder,
    );
  }

  it('stops with exit code 1, naming the setting, on a gwei_to_pls of "abc"', async () => {
    const ended = await runWith({ gwei_to_pls: "abc" });
    assert.equal(ended.code, 1);
    assert.match(
      ended.stderr,
      /config\.json → gwei_to_pls must be a power of ten from 1 to 10\^15: how many gwei make a PLS, 1000000000 on PulseChain; it is "abc"/,
    );
  });

  it("stops with exit code 1, naming the setting, on a gwei_to_pls that is no power of ten", async () => {
    const ended = await runWith({ gwei_to_pls: 123 });
    assert.equal(ended.code, 1);
    assert.match(
      ended.stderr,
      /config\.json → gwei_to_pls must be a power of ten/,
    );
  });

  it('stops with exit code 1, naming the setting, on a concurrency of "two"', async () => {
    const ended = await runWith({ concurrency: "two" });
    assert.equal(ended.code, 1);
    assert.match(
      ended.stderr,
      /config\.json → concurrency must be a whole number above 0; it is "two"/,
    );
  });

  it("names every problem at once, before it asks the chain anything", async () => {
    const ended = await runWith({
      beacon_url: "beacon",
      slot_interval_seconds: 0,
      retry_delay: 5,
    });
    assert.equal(ended.code, 1);
    assert.ok(
      ended.stderr.includes(
        [
          "config.json → retry_delay is not a setting this tool reads",
          'config.json → beacon_url must be an http or https url; it is "beacon"',
          "config.json → slot_interval_seconds must be a whole number above 0; it is 0\n",
        ].join("\n"),
      ),
      ended.stderr,
    );
    assert.doesNotMatch(ended.stderr, /HTTP|fetch/);
  });
});

describe("bin/get-validator-payments.js, its dates and a reader that stops", () => {
  let standIn;
  let folder;

  before(async () => {
    standIn = await startStandInPulseChain(paymentsChain());
    folder = fs.mkdtempSync(path.join(os.tmpdir(), "pva-payments-dates-"));
    fs.writeFileSync(
      path.join(folder, "config.json"),
      JSON.stringify(paymentsConfig(standIn)),
    );
  });

  after(async () => {
    if (standIn !== undefined) await standIn.close();
    if (folder !== undefined)
      fs.rmSync(folder, { recursive: true, force: true });
  });

  it("refuses a --start on or after --end, naming it, before it asks anything", async () => {
    for (const [start, end] of [
      ["2026-01-02", "2026-01-01"],
      ["2026-01-01", "2026-01-01"],
    ]) {
      standIn.asked.length = 0;
      const ended = await run(
        PAYMENTS,
        ["--ids", String(OURS.index), "--start", start, "--end", end],
        folder,
      );
      assert.equal(ended.code, 1);
      assert.deepEqual(standIn.asked, []);
      assert.ok(
        ended.stderr.includes(
          `option '--start <date>' argument '${start}' is invalid`,
        ),
        ended.stderr,
      );
    }
  });

  it("ends with exit code 1 when the program reading its output stops reading before the totals reach it", async () => {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [PAYMENTS, "--ids", String(OURS.index), "--start", START, "--end", END],
        { cwd: folder, stdio: ["ignore", "pipe", "ignore"] },
      );
      // The reader takes the first line and stops, as head -1 does
      child.stdout.once("data", () => child.stdout.destroy());
      child.on("error", reject);
      child.on("exit", (exitCode) => resolve(exitCode));
    });
    assert.equal(code, 1);
  });
});

describe("the start files in bin/", () => {
  for (const [startFile, toolFolder] of [
    ["fetch-execution-address.js", "fetch-execution-address"],
    ["get-validator-payments.js", "get-validator-payments"],
  ]) {
    it(`bin/${startFile} runs its tool with only the packages npm ci installs in ${toolFolder}/`, () => {
      const run = helpWithToolPackagesOnly(startFile, toolFolder);
      assert.equal(run.status, 0, run.stderr);
      assert.match(run.stdout, /^Usage: /);
    });
  }
});

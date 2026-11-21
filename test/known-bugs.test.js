/**
 * Tests of the known bugs, each declared with `knownBug`: a test passes
 * while its bug is present, and fails once the bug is fixed, the cue to
 * declare it with `it` among the tests of the code it is about (see
 * `../CLAUDE.md`).
 * @module test/known-bugs.test
 *
 * The payments calculator runs as its owner runs it, in a child process,
 * in a temp folder of the test's own whose config.json names a beacon node
 * and an rpc endpoint on this computer that refuse every connection, so a
 * run that gets past its command line fails on its first request.
 */

import { after, before, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { paymentsConfig } from "./helpers/payments-chain.js";
import { knownBug } from "./helpers/known-bug.js";

const execFileAsync = promisify(execFile);

/** The payments calculator's command line. */
const PAYMENTS = fileURLToPath(
  new URL("../get-validator-payments/index.js", import.meta.url),
);

/** A beacon node and rpc endpoint on this computer that refuse every connection. */
const REFUSING = {
  beaconUrl: "http://127.0.0.1:1",
  rpcUrl: "http://127.0.0.1:1",
};

describe("get-validator-payments/index.js, given a day the calendar does not have", () => {
  let folder;

  before(() => {
    folder = fs.mkdtempSync(
      path.join(os.tmpdir(), "pulsechain-validator-analytics-known-bugs-"),
    );
    fs.writeFileSync(
      path.join(folder, "config.json"),
      JSON.stringify(paymentsConfig(REFUSING)),
    );
  });

  after(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  knownBug(
    "refuses --start 2026-02-30, naming --start, before it asks anything",
    async () => {
      let ended;
      try {
        await execFileAsync(
          process.execPath,
          [PAYMENTS, "--ids=1", "--start=2026-02-30", "--end=2026-03-05"],
          { cwd: folder, timeout: 30000 },
        );
        ended = { code: 0, stderr: "" };
      } catch (error) {
        ended = { code: error.code, stderr: error.stderr };
      }
      assert.equal(ended.code, 1);
      assert.match(
        ended.stderr,
        /option '--start <date>' argument '2026-02-30' is invalid/,
      );
    },
  );
});

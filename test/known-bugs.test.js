/**
 * Tests of the bugs known in the repo's code, each declared with
 * `knownBug` (`helpers/known-bug.js`), so it passes while the bug is there.
 * @module test/known-bugs.test
 *
 * A fix makes its test fail; the same change declares the test with `it`,
 * among the tests of the code it is about, and removes it from here. The
 * settings files are written in a temp folder of the test's own, removed
 * afterwards, and the beacon node that fails every request is a web server
 * on this computer.
 */

import { after, describe, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { knownBug } from "./helpers/known-bug.js";
import {
  getValidatorPayments,
  readConfig,
} from "../get-validator-payments/fetch-validator-payments.js";
import { END, OURS, paymentsConfig, START } from "./helpers/payments-chain.js";

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "pva-known-bugs-"));
after(() => fs.rmSync(folder, { recursive: true, force: true }));

/**
 * Starts a web server on this computer that drops every request.
 *
 * @returns {Promise<{url: string, close: function(): Promise<void>}>} Its url, and how to stop it
 */
async function droppingServer() {
  const server = http.createServer((request) => request.socket.destroy());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

describe("readConfig", () => {
  knownBug(
    "refuses a time limit or a wait Node's timers cannot keep: more than 2147483647 milliseconds, the longest wait included",
    () => {
      const settings = paymentsConfig({
        beaconUrl: "http://127.0.0.1:1",
        rpcUrl: "http://127.0.0.1:1",
      });
      for (const [key, words] of [
        [
          "request_timeout_ms",
          /request_timeout_ms must be a whole number of milliseconds from 1 to 2147483647/,
        ],
        [
          "retry_delay_ms",
          /retry_delay_ms must be a whole number of milliseconds from 0 to 536870911/,
        ],
      ]) {
        const file = path.join(folder, `${key}.json`);
        fs.writeFileSync(
          file,
          JSON.stringify({ ...settings, [key]: 3000000000 }),
        );
        assert.throws(() => readConfig(file), { message: words });
      }
    },
  );
});

describe("getValidatorPayments' retries", () => {
  knownBug(
    "waits, and says it tries again, only when another attempt follows, so after the last of its 5 attempts it stops at once",
    async () => {
      const beacon = await droppingServer();
      const waits = [];
      const said = [];
      const setTimer = globalThis.setTimeout;
      mock.method(globalThis, "setTimeout", (callback, delay, ...rest) => {
        waits.push(delay);
        return setTimer(callback, delay, ...rest);
      });
      mock.method(console, "error", (...words) => said.push(words.join(" ")));
      mock.method(console, "log", () => {});
      try {
        await assert.rejects(
          getValidatorPayments([String(OURS.index)], START, END, {
            ...paymentsConfig({ beaconUrl: beacon.url, rpcUrl: beacon.url }),
            retry_delay_ms: 7,
          }),
          /after 5 attempts for fetching genesis/,
        );
      } finally {
        mock.restoreAll();
        await beacon.close();
      }
      assert.deepEqual(
        waits.filter((delay) => delay > 0 && delay <= 35 && delay % 7 === 0),
        [7, 14, 21, 28],
      );
      assert.equal(
        said.filter((line) => line.includes("Retrying...")).length,
        4,
      );
    },
  );
});

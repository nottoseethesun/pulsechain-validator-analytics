/**
 * Tests of how the payments calculator tries a failed request again
 * (`get-validator-payments/fetch-validator-payments.js`).
 * @module test/validator-payments-retries.test
 *
 * The beacon node that fails every request is a web server on this
 * computer that drops each request it gets.
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { getValidatorPayments } from "../get-validator-payments/fetch-validator-payments.js";
import { END, OURS, paymentsConfig, START } from "./helpers/payments-chain.js";

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

describe("getValidatorPayments' retries", () => {
  it("waits, and says it tries again, only when another attempt follows, so after the last of its 5 attempts it stops at once", async () => {
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
    assert.equal(said.filter((line) => line.includes("Retrying...")).length, 4);
  });
});

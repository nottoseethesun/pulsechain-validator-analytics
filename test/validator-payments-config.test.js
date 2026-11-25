/**
 * Tests of the payments calculator's settings, `readConfig`
 * (`get-validator-payments/fetch-validator-payments.js`), which checks a
 * `config.json` against its JSON Schema before the calculator takes a
 * setting. The settings files are written in a temp folder of the test's
 * own, removed afterwards.
 * @module test/validator-payments-config.test
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readConfig } from "../get-validator-payments/fetch-validator-payments.js";
import { paymentsConfig } from "./helpers/payments-chain.js";

describe("readConfig", () => {
  let folder;

  before(() => {
    folder = fs.mkdtempSync(
      path.join(os.tmpdir(), "pulsechain-validator-analytics-test-config-"),
    );
  });

  after(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it("reads the settings from a config.json that holds to its schema", () => {
    const file = path.join(folder, "config.json");
    const settings = {
      ...paymentsConfig({
        beaconUrl: "http://127.0.0.1:1/beacon",
        rpcUrl: "http://127.0.0.1:1",
      }),
      request_timeout_ms: 500,
    };
    fs.writeFileSync(file, JSON.stringify(settings));
    assert.deepEqual(readConfig(file), settings);
  });

  it("refuses a config.json with a setting missing, a key no setting has, or a value of the wrong kind, listing every problem", () => {
    const file = path.join(folder, "wrong.json");
    const settings = {
      ...paymentsConfig({
        beaconUrl: "http://127.0.0.1:1/beacon",
        rpcUrl: "http://127.0.0.1:1",
      }),
      rpcUrl: "http://127.0.0.1:1",
      retry_delay_ms: -1,
      request_timeout_ms: 2.5,
    };
    delete settings.concurrency;
    fs.writeFileSync(file, JSON.stringify(settings));
    assert.throws(() => readConfig(file), {
      message: [
        "config.json → concurrency is missing",
        "config.json → rpcUrl is not a setting this tool reads",
        "config.json → retry_delay_ms must be a whole number of milliseconds from 0 to 536870911, so its longest wait, 4 times it, is one Node's timers keep; it is -1",
        "config.json → request_timeout_ms must be a whole number of milliseconds from 1 to 2147483647, the longest Node's timers keep; it is 2.5",
      ].join("\n"),
    });
  });

  it("refuses a time limit or a wait Node's timers cannot keep: more than 2147483647 milliseconds, the longest wait included", () => {
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
  });

  it("refuses a missing config.json, naming it", () => {
    assert.throws(
      () => readConfig(path.join(folder, "none.json")),
      /^Error: Cannot read \S*none\.json: ENOENT/,
    );
  });

  it("reads the config.json shipped with the tool, with PulseChain's 10-second slots, its 32 slots an epoch and its stake of 32,000,000 PLS", () => {
    /*-
     *  PulseChain's beacon chain sets SECONDS_PER_SLOT to 10, and each
     *  block from genesis on carries the time that 10-second slots predict;
     *  it sets SLOTS_PER_EPOCH to 32, and MAX_EFFECTIVE_BALANCE to
     *  32,000,000,000,000,000 gwei, 32,000,000 PLS.
     */
    const config = readConfig(
      new URL("../get-validator-payments/config.json", import.meta.url),
    );
    assert.equal(config.slot_interval_seconds, 10);
    assert.equal(config.gwei_to_pls, 1000000000);
    assert.equal(config.slots_per_epoch, 32);
    assert.equal(config.max_effective_balance, 32000000);
  });
});

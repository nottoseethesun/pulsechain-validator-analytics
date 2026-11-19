/**
 * Tests of the execution address lookup
 * (`fetch-execution-address/execution-address.js`), run against a stand-in
 * beacon node served on this computer (`helpers/stand-in-pulsechain.js`),
 * so they ask nothing outside it.
 * @module test/execution-address.test
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_BEACON_URL,
  executionAddressOf,
  fetchValidatorExecutionAddress,
  NOT_SET,
} from "../fetch-execution-address/execution-address.js";
import { startStandInPulseChain } from "./helpers/stand-in-pulsechain.js";

/** A validator whose withdrawal credentials name an address, and one whose name none. */
const WITH_ADDRESS = {
  index: 12,
  pubkey: `0x${"c1".repeat(48)}`,
  withdrawalCredentials: `0x01${"0".repeat(22)}${"cc".repeat(20)}`,
};
const WITHOUT_ADDRESS = {
  index: 13,
  pubkey: `0x${"d1".repeat(48)}`,
  withdrawalCredentials: `0x00${"dd".repeat(31)}`,
};

describe("executionAddressOf", () => {
  it("reads the address 0x01 withdrawal credentials name: their last 20 bytes", () => {
    assert.equal(
      executionAddressOf(WITH_ADDRESS.withdrawalCredentials),
      `0x${"cc".repeat(20)}`,
    );
  });

  it("reads no address from 0x00 withdrawal credentials", () => {
    assert.equal(
      executionAddressOf(WITHOUT_ADDRESS.withdrawalCredentials),
      null,
    );
  });
});

describe("fetchValidatorExecutionAddress", () => {
  let standIn;

  before(async () => {
    standIn = await startStandInPulseChain({
      validators: [WITH_ADDRESS, WITHOUT_ADDRESS],
    });
  });

  after(async () => {
    await standIn.close();
  });

  it("looks up each validator, by index or public key, at the finalized state", async () => {
    const results = await fetchValidatorExecutionAddress(
      [String(WITH_ADDRESS.index), WITHOUT_ADDRESS.pubkey],
      standIn.beaconUrl,
    );
    assert.deepEqual(results, {
      [WITH_ADDRESS.index]: `0x${"cc".repeat(20)}`,
      [WITHOUT_ADDRESS.pubkey]: NOT_SET,
    });
    assert.ok(
      standIn.asked.includes(
        `/beacon-api/eth/v1/beacon/states/finalized/validators/${WITHOUT_ADDRESS.pubkey}`,
      ),
    );
  });

  it("gives the error in place of an address for a validator it cannot look up, and still looks up the rest", async () => {
    const results = await fetchValidatorExecutionAddress(
      ["999", String(WITH_ADDRESS.index)],
      standIn.beaconUrl,
    );
    assert.deepEqual(results, {
      999: "Error: HTTP error! Status: 404 for validator ID: 999",
      [WITH_ADDRESS.index]: `0x${"cc".repeat(20)}`,
    });
  });

  it("asks g4mm4's beacon api unless another is named", () => {
    assert.equal(
      DEFAULT_BEACON_URL,
      "https://rpc-pulsechain.g4mm4.io/beacon-api",
    );
  });
});

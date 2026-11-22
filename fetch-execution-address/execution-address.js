/**
 * The address each PulseChain validator's withdrawal credentials name, read
 * from a beacon node's api: its execution address.
 * @module fetch-execution-address/execution-address
 *
 * A validator's withdrawal credentials name an execution layer address when
 * they are of the 0x01 kind: the address is their last 20 bytes. Each
 * validator is looked up directly, by public key or index, at the finalized
 * state, so nothing is scanned. A validator that cannot be looked up gets
 * the error in place of its address, and the others are still looked up;
 * a lookup the beacon node gives no answer to within REQUEST_TIMEOUT_MS,
 * its body included, counts as one that cannot be (crypto-price-fetchers'
 * `fetchWithinTimeLimit`).
 */

import { fetchWithinTimeLimit } from "crypto-price-fetchers/lib/time-limited-fetch";

/** The beacon node's api asked unless another is named: g4mm4's. */
export const DEFAULT_BEACON_URL = "https://rpc-pulsechain.g4mm4.io/beacon-api";

/** How long a lookup may go without an answer, in milliseconds, unless the caller sets another: 30 seconds, as the payments calculator's requests. */
export const REQUEST_TIMEOUT_MS = 30000;

/** What a validator whose withdrawal credentials name no address gets. */
export const NOT_SET =
  "Not set (withdrawal credentials not configured for execution address)";

/**
 * Reads the address withdrawal credentials name.
 *
 * @param {string} withdrawalCredentials - The credentials, as hex
 * @returns {?string} The address, when they are of the 0x01 kind, else null
 */
export function executionAddressOf(withdrawalCredentials) {
  return withdrawalCredentials.startsWith("0x01")
    ? "0x" + withdrawalCredentials.slice(-40)
    : null;
}

/**
 * Looks up each validator's execution address.
 *
 * @param {string[]} ids - The validators, by public key or index
 * @param {string} [beaconUrl=DEFAULT_BEACON_URL] - The beacon node's api
 * @param {{timeoutMs: number}} [options] - How long a lookup may go without an answer, in milliseconds
 * @returns {Promise<Object<string, string>>} Each validator's address, `NOT_SET`, or the error that stopped its lookup
 */
export async function fetchValidatorExecutionAddress(
  ids,
  beaconUrl = DEFAULT_BEACON_URL,
  { timeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  const results = {};
  for (const id of ids) {
    try {
      // The time limit covers the answer's body too
      const res = await fetchWithinTimeLimit(
        `${beaconUrl}/eth/v1/beacon/states/finalized/validators/${id}`,
        {},
        { timeoutMs, name: "the beacon node" },
      );
      if (!res.ok) {
        throw new Error(
          `HTTP error! Status: ${res.status} for validator ID: ${id}`,
        );
      }
      const data = await res.json();
      const withdrawalCred = data.data.validator.withdrawal_credentials;
      results[id] = executionAddressOf(withdrawalCred) ?? NOT_SET;
    } catch (error) {
      const message = error.message;
      console.error(
        `Error fetching execution address for validator ${id}:`,
        message,
      );
      results[id] = "Error: " + message;
    }
  }
  return results;
}

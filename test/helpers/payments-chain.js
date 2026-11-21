/**
 * The stand-in chain the tests of the payments calculator share: a day of
 * hour-long slots, one validator of the tests' and another, and blocks
 * that pay nothing unless a test says otherwise.
 * @module test/helpers/payments-chain
 *
 * Genesis is midnight UTC a day before `START`, so with hour-long slots
 * `START`'s midnight is slot 24 and `END`'s is slot 48. Every slot from 24
 * to 48 has a block the other validator proposed, with no withdrawals, so
 * a run asks for no block that does not exist unless a test leaves one
 * out.
 */

/** The days the tests ask about: the first counted, and the one the count stops before. */
export const START = "2026-01-01";
export const END = "2026-01-02";

/** The genesis time: midnight UTC on the day before `START`, in unix seconds. */
const GENESIS = Date.UTC(2025, 11, 31) / 1000;

/** The first and last slots of the days asked about. */
export const FIRST_SLOT = 24;
export const LAST_SLOT = 48;

/** The withdrawal address of the tests' validator. */
export const WITHDRAWAL_ADDRESS = `0x${"aa".repeat(20)}`;

/** The fee recipient of the blocks the tests' validator proposes. */
export const FEE_RECIPIENT = `0x${"fe".repeat(20)}`;

/** The tests' validator, and another. */
export const OURS = {
  index: 7,
  pubkey: `0x${"a7".repeat(48)}`,
  withdrawalCredentials: `0x01${"0".repeat(22)}${"aa".repeat(20)}`,
};
export const OTHER = {
  index: 9,
  pubkey: `0x${"b9".repeat(48)}`,
  withdrawalCredentials: `0x01${"0".repeat(22)}${"bb".repeat(20)}`,
};

/**
 * Writes an amount of gwei as json-rpc writes wei: a hex quantity.
 *
 * @param {number} amount - The gwei
 * @returns {string} The wei, in hex
 */
export function gwei(amount) {
  return `0x${(BigInt(amount) * 10n ** 9n).toString(16)}`;
}

/**
 * Builds the stand-in chain, with the blocks and answers a test adds.
 *
 * @param {Object} [parts] - What the test adds: `blocks`, `executionBlocks`, `receipts` and `failures`, as `startStandInPulseChain` takes them, and `validators`, in place of the tests' validator and the other
 * @returns {Object} The chain
 */
export function paymentsChain({
  blocks = {},
  executionBlocks = {},
  receipts = {},
  failures = {},
  validators = [OURS, OTHER],
} = {}) {
  const quiet = {};
  for (let slot = FIRST_SLOT; slot <= LAST_SLOT; slot++) {
    quiet[slot] = { proposer: OTHER.index };
  }
  return {
    genesisTime: GENESIS,
    validators,
    blocks: { ...quiet, ...blocks },
    executionBlocks,
    receipts,
    failures,
  };
}

/**
 * The settings a run against the stand-in takes: hour-long slots, 32 to an
 * epoch, as on PulseChain, so epoch 1 starts at slot 32; a stake of 32 PLS,
 * which keeps the tests' amounts short; and retries a millisecond apart.
 *
 * @param {{beaconUrl: string, rpcUrl: string}} standIn - The stand-in
 * @returns {Object} The settings, as config.json names them
 */
export function paymentsConfig(standIn) {
  return {
    beacon_url: standIn.beaconUrl,
    rpc_url: standIn.rpcUrl,
    slot_interval_seconds: 3600,
    gwei_to_pls: 1000000000,
    max_effective_balance: 32,
    slots_per_epoch: 32,
    concurrency: 8,
    retry_delay_ms: 1,
  };
}

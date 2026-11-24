/**
 * @fileoverview Script to calculate validator payments, in $pls "Pulse" token,
 * on PulseChain for consensus and execution layers.
 *
 * This script scans the PulseChain beacon chain slots in a given date range to compute totals for
 * consensus layer payments (via withdrawals, less the stake a full exit returns) and execution layer
 * payments (via priority fees from proposed blocks). It uses the g4mm4.io APIs for data fetching.
 *
 * A validator's stake, 32,000,000 PLS on PulseChain, is a deposit, not a payment. Every withdrawal
 * before the validator's withdrawable epoch is a partial withdrawal, of what its balance holds above
 * the stake, and counts in full. Its full exit is the withdrawal at or after that epoch, which the
 * beacon node gives with the validator: it returns the whole balance, so only what it pays above the
 * stake counts, and none of it when penalties left less than the stake.
 *
 * A full per-wallet address breakdown is provided so that coins are tracked on a per-wallet basis,
 * including by fee payment type (Consensus Layer and Execution Layer). Each address is written in
 * EIP-55's mixed case, as LP Ranger writes addresses, whatever case the beacon node gives it in, so
 * one address has one key (crypto-price-fetchers' `eip55`).
 *
 * Public API: The main function is getValidatorPayments(ids, startDate, endDate, config), where ids can be
 * validator public keys or indices, and config is the settings that readConfig() reads.
 *
 * Configuration:
 * - readConfig() loads major configuration values (e.g., API endpoints, concurrency) from a `config.json`
 *   file in the working directory; getValidatorPayments reads it when no config is passed. Before the
 *   calculator takes a setting, readConfig checks the file against SETTINGS_SCHEMA, its JSON Schema, a
 *   description in JSON of the keys the file may hold and the kind of value each takes, with
 *   crypto-price-fetchers' readSettingsFile, as LP Ranger checks its settings: a missing file, one that
 *   is not JSON, a setting missing, a key the schema does not name, or a value of the wrong kind stops
 *   the run, with every problem listed.
 *
 * - Example config.json:
 *   {
 *     "beacon_url": "https://rpc-pulsechain.g4mm4.io/beacon-api",
 *     "rpc_url": "https://rpc-pulsechain.g4mm4.io",
 *     "slot_interval_seconds": 10,
 *     "gwei_to_pls": 1000000000,
 *     "max_effective_balance": 32000000,
 *     "slots_per_epoch": 32,
 *     "concurrency": 90
 *   }
 * - Adjust values in config.json as needed for customization.
 * - "slot_interval_seconds" is the length of the chain's slots, which turns a date into a slot:
 *   10 on PulseChain, as its beacon node's /eth/v1/config/spec says (SECONDS_PER_SLOT).
 * - "gwei_to_pls" is how many gwei, the unit the beacon node gives amounts in, make a PLS: a power of
 *   ten, 1,000,000,000 on PulseChain, so a total in gwei is written as exact decimal PLS.
 * - "max_effective_balance" is the stake, in PLS: 32,000,000 on PulseChain, as the spec's
 *   MAX_EFFECTIVE_BALANCE, 32,000,000,000,000,000 gwei, says. "slots_per_epoch" turns the
 *   validator's withdrawable epoch into a slot: 32 on PulseChain (SLOTS_PER_EPOCH).
 * - An optional "retry_delay_ms" sets the wait before a failed request is tried again, times its
 *   attempt: 1000 when absent, and at most 536870911, so the longest wait, after the 4th attempt, is
 *   one Node's timers keep. No wait follows the last attempt.
 * - An optional "request_timeout_ms" sets how long a request may take, its whole answer read, before
 *   it counts as failed: 30000 when absent, and at most 2147483647, the longest Node's timers keep.
 *
 * Usage:
 *
 * - Import or require the script in your Node.js file.  See for example, the file `./index.js`.
 *
 * - Call the function with parameters:
 *
 *     getValidatorPayments(['<public-key>', '12345'], '2025-01-01', '2025-11-04', readConfig())
 *       .then(result => console.log(result))
 *       .catch(err => console.error(err));
 *
 * - Important Info about the End Date: The script treats the end date as exclusive: Payments
 *   (e.g., withdrawals or priority fees) timestamped
 *   exactly on or after midnight UTC of the end date are not included. It calculates slots up to but not
 *   including the start of the end date, so only events from the start date (inclusive) to just before the
 *   end date are counted. If you want to include the full end date, adjust by setting the end date to one
 *   day after your intended period (e.g., use --end=2024-03-11 to capture up to 2024-03-10).
 *
 * - The function logs summaries to console and returns an object with consensus and execution totals by
 *   address, each PLS as exact decimal text, such as "0.123456789": amounts are added up as BigInt, in
 *   gwei for withdrawals and in wei for fees, since a full exit's amount in gwei is above 2^53, the
 *   largest whole number a JavaScript number holds exactly.
 *
 * - A slot the beacon node answers with 404 has no block, as happens from time to time, and one it
 *   answers with 400, a request it calls invalid, as for a slot it cannot give; each is skipped, not
 *   asked again. Any other failed answer is asked again, and fails the run when every attempt fails:
 *   the genesis time and each validator by itself, and a slot's reads, its block, the block it
 *   proposed and that block's receipts, all together, since a slot is read whole again when any of
 *   its reads fails (`scanSlots`).
 *
 * Note: This performs a heavy scan over potentially millions of slots. Use with caution to avoid API
 *       rate limits.
 *
 * Troubleshooting:
 *
 * If you get HTTP 429 response status code, then you have hit a rate limit and so you need to either
 * reduce the value of the `concurrency` property in `config.json`, or you need to switch to a different
 * RPC provider (configured in `config.json` as well).  See the `README.md` one directory level above
 * for a list of possible RPC providers.
 */

import { dayStartSeconds } from "crypto-price-fetchers/lib/calendar-day";
import { readSettingsFile } from "crypto-price-fetchers/lib/settings-file";
import { eip55 } from "crypto-price-fetchers/lib/repo-checks";
import { KINDS } from "crypto-price-fetchers/lib/settings-schema";
import { decimalFromRaw } from "crypto-price-fetchers/summ-csv";
import {
  fetchWithinTimeLimit,
  LONGEST_TIME_LIMIT_MS,
} from "crypto-price-fetchers/lib/time-limited-fetch";

/** How long a request may take, its whole answer read, in ms, unless config.json sets request_timeout_ms. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** How many times a failed request is tried again. */
const RETRIES = 4;

/** The wait before a failed request is tried again, times its attempt, in ms, unless config.json sets retry_delay_ms. */
const DEFAULT_RETRY_DELAY_MS = 1000;

/** The longest retry_delay_ms: its wait after the last attempt but one, RETRIES times it, is one Node's timers keep. */
const LONGEST_RETRY_DELAY_MS = Math.floor(LONGEST_TIME_LIMIT_MS / RETRIES);

/** The kind of retry_delay_ms. */
const RETRY_DELAY_KIND = Object.freeze({
  type: "integer",
  minimum: 0,
  maximum: LONGEST_RETRY_DELAY_MS,
  description: `a whole number of milliseconds from 0 to ${LONGEST_RETRY_DELAY_MS}, so its longest wait, ${RETRIES} times it, is one Node's timers keep`,
});

/** The powers of ten from 1 to 10^15, the largest a JSON number holds exactly: gwei_to_pls's values. */
const POWERS_OF_TEN = Object.freeze(
  Array.from({ length: 16 }, (_, power) => 10 ** power),
);

/** The kind of gwei_to_pls: a power of ten, so a total in gwei is exact decimal PLS. */
const GWEI_TO_PLS_KIND = Object.freeze({
  type: "integer",
  enum: POWERS_OF_TEN,
  description:
    "a power of ten from 1 to 10^15: how many gwei make a PLS, 1000000000 on PulseChain",
});

/**
 * The JSON Schema of config.json: each setting the calculator reads, of
 * its kind, built from crypto-price-fetchers' kinds of value; every one
 * required but retry_delay_ms and request_timeout_ms, and no other key.
 */
export const SETTINGS_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "beacon_url",
    "rpc_url",
    "slot_interval_seconds",
    "gwei_to_pls",
    "max_effective_balance",
    "slots_per_epoch",
    "concurrency",
  ],
  properties: {
    beacon_url: KINDS.url,
    rpc_url: KINDS.url,
    slot_interval_seconds: KINDS.wholeAbove0,
    gwei_to_pls: GWEI_TO_PLS_KIND,
    max_effective_balance: KINDS.wholeAbove0,
    slots_per_epoch: KINDS.wholeAbove0,
    concurrency: KINDS.wholeAbove0,
    retry_delay_ms: RETRY_DELAY_KIND,
    request_timeout_ms: KINDS.timeLimitMs,
  },
});

/**
 * Reads the settings from config.json, once crypto-price-fetchers'
 * `readSettingsFile` has checked the file against `SETTINGS_SCHEMA`.
 *
 * @param {string|URL} [file='config.json'] - The file, by default in the working directory
 * @returns {Object} The settings, as the file names them
 * @throws {Error} When the file is missing, cannot be read, is not JSON, or has a problem the schema finds, every problem listed
 */
export function readConfig(file = "config.json") {
  return readSettingsFile(file, {
    required: true,
    schema: SETTINGS_SCHEMA,
    name: "config.json",
  });
}

/**
 * Sends a request and reads its whole answer, within the time limit:
 * config.json's request_timeout_ms, or DEFAULT_REQUEST_TIMEOUT_MS. A
 * request whose answer, its body included, is not all there by then fails,
 * as one that gets no answer does, with an error that names its url
 * (crypto-price-fetchers' `fetchWithinTimeLimit`).
 *
 * @param {Object} scan - The scan: its settings
 * @param {string} url - The URL to fetch.
 * @param {Object} [options={}] - Fetch options.
 * @returns {Promise<Response>} The answer, its body read in full
 * @throws {Error} When the request fails, or its answer is not all there in time
 */
function fetchWithTimeout(scan, url, options = {}) {
  return fetchWithinTimeLimit(url, options, {
    timeoutMs: scan.config.request_timeout_ms ?? DEFAULT_REQUEST_TIMEOUT_MS,
  });
}

/** How the retries wait and print, unless a test hands in its own. */
const RETRY_IO = Object.freeze({
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: (value) => console.log(value),
  warn: (line) => console.error(line),
});

/**
 * A utility function to retry an async operation up to a specified number of times.
 * Logs success after retries if applicable.
 * @param {Function} fn - The async function to retry.
 * @param {number} retries - Number of retries.
 * @param {string} [context=''] - Optional context for logging (e.g., 'processing slot 123').
 * @param {number} [delayMs=DEFAULT_RETRY_DELAY_MS] - The wait before the next attempt, times the attempt.
 * @param {{wait: function(number): Promise<void>, log: function(*): void, warn: function(string): void}} [io=RETRY_IO] - How it waits, logs a whole error or a success after a failure, and warns of a failed attempt: a timer and the console, unless a test reads them
 * @returns {Promise<any>} The result of the function.
 */
export async function retry(
  fn,
  retries = RETRIES,
  context = "",
  delayMs = DEFAULT_RETRY_DELAY_MS,
  io = RETRY_IO,
) {
  let lastError;
  let attempt = 1;
  for (; attempt <= retries + 1; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        io.log(
          `Retry succeeded on attempt ${attempt}${context ? ` for ${context}` : ""}`,
        );
      }
      return result;
    } catch (error) {
      lastError = error;
      io.log(error); // The whole error, with what its message leaves out
      const another = attempt <= retries;
      io.warn(
        `Retry attempt ${attempt} failed${context ? ` for ${context}` : ""}.${another ? " Retrying..." : ""}`,
      );
      // The wait grows by delayMs with each attempt, and none follows the
      // last
      if (another) await io.wait(delayMs * attempt);
    }
  }
  throw new Error(
    `Fatal error: Crucial data could not be obtained after ${retries + 1} attempts${context ? ` for ${context}` : ""}. Please check your network connection and API conditions. Last error: ${lastError.message}`,
  );
}

/**
 * Sends a json-rpc request to the execution layer's endpoint.
 *
 * @param {Object} scan - The scan: its settings
 * @param {string} method - The method
 * @param {Array} params - Its parameters
 * @returns {Promise<Response>} The answer, its body read in full (`fetchWithTimeout`)
 */
function rpcRequest(scan, method, params) {
  return fetchWithTimeout(scan, scan.config.rpc_url, {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Fetches the gas used for a transaction via RPC. A read that fails
 * throws, and its slot is read again (`scanSlots`), so the receipt is
 * asked for again there, and nowhere else.
 * @param {Object} scan - The scan: its settings
 * @param {string} txHash - The transaction hash.
 * @returns {Promise<bigint>} The gas used as BigInt.
 */
async function getGasUsed(scan, txHash) {
  try {
    const res = await rpcRequest(scan, "eth_getTransactionReceipt", [txHash]);
    if (!res.ok) {
      throw new Error(
        `HTTP error! Status: ${res.status} for txHash: ${txHash}`,
      );
    }
    const data = await res.json();
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message} for txHash: ${txHash}`);
    }
    /*-
     *  A mined transaction has a receipt, so an endpoint that gives none
     *  is behind or failing, and its slot is read again.
     */
    if (!data.result) {
      throw new Error(`No receipt for txHash: ${txHash}`);
    }
    return BigInt(data.result.gasUsed);
  } catch (error) {
    console.error(`Error fetching gas used for ${txHash}:`, error.message);
    throw error;
  }
}

/**
 * Fetches the beacon chain's genesis time.
 *
 * @param {Object} scan - The scan: its settings, and how it retries
 * @returns {Promise<number>} The genesis time, in unix seconds
 */
async function fetchGenesis(scan) {
  const genesisRes = await scan.retrying(async () => {
    const response = await fetchWithTimeout(
      scan,
      `${scan.config.beacon_url}/eth/v1/beacon/genesis`,
    );
    // A rate limit or a server error may pass, so it is asked again
    if (response.status === 429 || response.status >= 500) {
      throw new Error(`HTTP error! Status: ${response.status} for genesis`);
    }
    return response;
  }, "fetching genesis");
  if (!genesisRes.ok) {
    throw new Error(`Failed to fetch genesis: HTTP ${genesisRes.status}`);
  }
  const genesisData = await genesisRes.json();
  return parseInt(genesisData.data.genesis_time, 10);
}

/**
 * Fetches each validator's index, public key, withdrawal address, and the
 * first slot of its withdrawable epoch, from which its full exit can come:
 * a slot past any for a validator that has not exited, whose withdrawable
 * epoch is the beacon chain's far future, 2^64 - 1.
 *
 * @param {Object} scan - The scan: its settings, and how it retries
 * @param {string[]} ids - The validators, by public key or index
 * @returns {Promise<{validators: Object, indicesSet: Set<number>}>} The validators found, by index, and their indices
 */
async function fetchValidators(scan, ids) {
  const validators = {};
  const indicesSet = new Set();
  for (const id of ids) {
    const res = await scan.retrying(async () => {
      const response = await fetchWithTimeout(
        scan,
        `${scan.config.beacon_url}/eth/v1/beacon/states/finalized/validators/${id}`,
      );
      // A rate limit or a server error may pass, so it is asked again
      if (response.status === 429 || response.status >= 500) {
        throw new Error(
          `HTTP error! Status: ${response.status} for validator: ${id}`,
        );
      }
      return response;
    }, `fetching validator ${id}`);
    // A validator left out would leave its payments out of the totals, so
    // one the node does not know, or cannot give, stops the run
    if (!res.ok) {
      throw new Error(`Failed to fetch validator ${id}: HTTP ${res.status}`);
    }
    const data = await res.json();
    const valData = data.data;
    const index = parseInt(valData.index, 10);
    validators[index] = {
      withdrawableSlot:
        Number(valData.validator.withdrawable_epoch) *
        scan.config.slots_per_epoch,
    };
    indicesSet.add(index);
  }
  return { validators, indicesSet };
}

/**
 * The payments a block's withdrawals make to the validators named, each by
 * validator and withdrawal address, in PLS. A withdrawal before the
 * validator's withdrawable epoch counts in full; its full exit, at or after
 * that epoch, counts only what it pays above the stake, none when less.
 *
 * @param {Object} scan - The scan: its settings and validators
 * @param {number} slot - The block's slot
 * @param {Array<Object>} withdrawals - The block's withdrawals
 * @returns {Array<{index: number, address: string, amount: bigint}>} The payments, in gwei
 */
function slotWithdrawals(scan, slot, withdrawals) {
  const stake =
    BigInt(scan.config.max_effective_balance) * BigInt(scan.config.gwei_to_pls);
  const payments = [];
  for (const wd of withdrawals) {
    const index = parseInt(wd.validator_index, 10);
    if (!scan.indicesSet.has(index)) continue;
    const withdrawn = BigInt(wd.amount);
    const isFullExit = slot >= scan.validators[index].withdrawableSlot;
    const amount = !isFullExit
      ? withdrawn
      : withdrawn > stake
        ? withdrawn - stake
        : 0n;
    payments.push({ index, address: eip55(wd.address), amount });
  }
  return payments;
}

/**
 * Adds up the priority fees a block's transactions paid its proposer. A
 * receipt that cannot be read after every attempt fails the slot, rather
 * than leaving its transaction's tip out.
 *
 * @param {Object} scan - The scan: its settings, and how it retries
 * @param {Object} b - The execution block, with its transactions
 * @returns {Promise<bigint>} The fees, in wei
 */
async function blockPriorityFees(scan, b) {
  const baseFee = BigInt(b.baseFeePerGas ?? "0x0");
  let prioritySum = 0n;
  for (const tx of b.transactions) {
    // A legacy transaction names a gas price alone, which is both its fee
    // cap and its priority fee, so its tip is its gas price less the base
    // fee.
    const maxPriority = BigInt(tx.maxPriorityFeePerGas ?? tx.gasPrice ?? "0x0");
    const maxFee = BigInt(tx.maxFeePerGas ?? tx.gasPrice ?? "0x0");
    const tip = maxPriority < maxFee - baseFee ? maxPriority : maxFee - baseFee;
    const gasUsed = await getGasUsed(scan, tx.hash);
    prioritySum += tip * gasUsed;
  }
  return prioritySum;
}

/**
 * The priority fees of a block a validator named proposed, and its fee
 * recipient.
 *
 * @param {Object} scan - The scan: its settings, and how it retries
 * @param {number} slot - The block's slot
 * @param {?Object} payload - The block's execution payload
 * @returns {Promise<?{feeRecipient: string, amount: bigint}>} The fees, in wei, or null when the block has no payload
 */
async function proposalTips(scan, slot, payload) {
  // Safely access execution_payload with optional chaining; skip if undefined
  if (!payload) {
    console.log(
      `Skipping execution layer processing for slot ${slot}: execution_payload undefined`,
    );
    return null;
  }
  const blockNumber = parseInt(payload.block_number, 10);
  const feeRecipient = eip55(payload.fee_recipient);

  /*-
   *  Fetch the execution block details; a read that fails throws, and the
   *  slot is read again (`scanSlots`).
   */
  const rpcRes = await rpcRequest(scan, "eth_getBlockByNumber", [
    `0x${blockNumber.toString(16)}`,
    true,
  ]);
  if (!rpcRes.ok) {
    throw new Error(
      `HTTP error! Status: ${rpcRes.status} for block: ${blockNumber}`,
    );
  }
  const block = await rpcRes.json();
  // The block a validator proposed is on the chain, so an endpoint that
  // cannot give it is behind or failing: the slot is tried again
  if (block.error || !block.result) {
    throw new Error(
      `RPC error for block ${blockNumber}: ${block.error ? block.error.message : "No result"}`,
    );
  }

  return { feeRecipient, amount: await blockPriorityFees(scan, block.result) };
}

/**
 * Adds one slot's payments to the totals: its block's withdrawals, and
 * its priority fees when a validator named proposed it, once every read
 * of the slot has succeeded.
 *
 * @param {Object} scan - The scan: its settings, validators, and how it retries
 * @param {number} slot - The slot
 * @param {{consensus: Object<string, bigint>, execution: Object<string, bigint>}} totals - The totals by address: in gwei, and in wei
 */
async function processSlot(scan, slot, totals) {
  try {
    const blockRes = await fetchWithTimeout(
      scan,
      `${scan.config.beacon_url}/eth/v1/beacon/blocks/${slot}`,
    );
    if (!blockRes.ok) {
      // For 404, log explanation without throwing (no retry needed, as no block exists)
      if (blockRes.status === 404) {
        console.log(
          `HTTP error! Status: ${blockRes.status} for slot: ${slot} - No block exists for this slot; it is normal that this happens from time to time.`,
        );
        return; // Skip without retry or error
      }
      // For 400 error (e.g., for invalid/negative slot), do not retry as the slot doesn't exist
      if (blockRes.status === 400) {
        console.log(`Skipping non-existent slot ${slot} (HTTP 400)`);
        return; // Skip without retry or error
      }
      throw new Error(
        `HTTP error! Status: ${blockRes.status} for slot: ${slot}`,
      );
    }
    const blockData = await blockRes.json();
    const message = blockData.data.message;
    const body = message.body;
    const proposer = parseInt(message.proposer_index, 10);

    // A block with no withdrawals, the common case, pays nothing on the consensus layer
    const withdrawn = slotWithdrawals(
      scan,
      slot,
      body.execution_payload?.withdrawals ?? [],
    );
    const tips = scan.indicesSet.has(proposer)
      ? await proposalTips(scan, slot, body.execution_payload)
      : null;

    // Nothing is added before every read of the slot has succeeded, so a
    // slot tried again counts once
    for (const { address, amount } of withdrawn) {
      totals.consensus[address] = (totals.consensus[address] ?? 0n) + amount;
    }
    if (tips !== null) {
      totals.execution[tips.feeRecipient] =
        (totals.execution[tips.feeRecipient] ?? 0n) + tips.amount;
    }
  } catch (error) {
    console.error(`Error processing slot ${slot}:`, error.message);
    throw error;
  }
}

/**
 * Waits for every slot of a batch, then fails, with the first slot's error,
 * if any slot's block could not be read after every attempt, since totals
 * that left it out would be short.
 *
 * @param {Array<Promise<void>>} batch - The slots being read
 */
async function settleBatch(batch) {
  const results = await Promise.allSettled(batch);
  const failure = results.find((result) => result.status === "rejected");
  if (failure) {
    throw failure.reason;
  }
}

/**
 * Scans the slots, as many at once as the settings allow, logging its
 * progress. A slot is read again, whole, when any of its reads fails, up
 * to the attempts `retry` makes, and none of its reads is tried again on
 * its own, so each read is asked for at most that many times. A slot that
 * cannot be read after every attempt fails the scan, once the slots read
 * with it are done.
 *
 * @param {Object} scan - The scan: its settings, validators, and how it retries
 * @param {number} startSlot - The first slot
 * @param {number} endSlot - The last slot
 * @param {{consensus: Object<string, bigint>, execution: Object<string, bigint>}} totals - The totals by address: in gwei, and in wei
 */
async function scanSlots(scan, startSlot, endSlot, totals) {
  // Set up progress tracking for the slot scan
  const totalSlots = endSlot - startSlot + 1;
  let processedSlots = 0;
  console.log(`Starting scan of ${totalSlots} slots...`);
  const progressInterval = setInterval(() => {
    console.log(
      `Progress: Processed ${processedSlots} / ${totalSlots} slots (${((processedSlots / totalSlots) * 100).toFixed(2)}%)`,
    );
  }, 4000); // Every 4 seconds (average of 3-5)

  try {
    // Scan slots with concurrency; settleBatch fails the scan on a slot it could not read
    let activePromises = [];
    for (let slot = startSlot; slot <= endSlot; slot++) {
      // Skip negative slots (though clamped earlier, added for safety)
      if (slot < 0) {
        console.log(`Skipping invalid negative slot: ${slot}`);
        continue;
      }

      activePromises.push(
        scan.retrying(
          () => processSlot(scan, slot, totals),
          `processing slot ${slot}`,
        ),
      );

      if (activePromises.length >= scan.config.concurrency) {
        await settleBatch(activePromises);
        processedSlots += activePromises.length;
        activePromises = [];
      }
    }

    // Wait for any remaining promises in the batch
    if (activePromises.length > 0) {
      await settleBatch(activePromises);
      processedSlots += activePromises.length;
    }
  } finally {
    // Stopped on failure too, or the progress line would keep the process running
    clearInterval(progressInterval);
  }
  console.log(
    `Scan complete: Processed ${processedSlots} / ${totalSlots} slots (100.00%)`,
  );
}

/** A PLS's decimal places in wei, the unit an execution block gives fees in. */
const WEI_DECIMALS = 18;

/**
 * Writes totals held in a unit smaller than a PLS as exact decimal PLS.
 *
 * @param {Object<string, bigint>} totals - The totals by address, in the unit
 * @param {number} decimals - How many decimal places of a PLS the unit is
 * @returns {Object<string, string>} The totals by address, in PLS, as decimal text
 */
function plsTexts(totals, decimals) {
  return Object.fromEntries(
    Object.entries(totals).map(([address, amount]) => [
      address,
      decimalFromRaw(amount, decimals),
    ]),
  );
}

/**
 * Calculates validator payments for consensus and execution layers on PulseChain.
 *
 * Scans beacon chain slots in the date range to sum consensus withdrawals (less the stake a full exit returns)
 * and execution priority fees from proposed blocks. Groups totals by withdrawal address (consensus) and
 * fee recipient address (execution).
 *
 * Supports validator IDs as either public keys (e.g., '0xabc...') or indices (e.g., '12345').
 *
 * @param {string[]} ids - Array of validator IDs: public keys (e.g., '0xabc...') or indices (e.g., '12345').
 * @param {string} startDate - Start date in 'YYYY-MM-DD' UTC format.
 * @param {string} endDate - End date in 'YYYY-MM-DD' UTC format.
 * @param {Object} [config=readConfig()] - The settings, as config.json names them
 * @returns {Promise<{consensus: Object.<string, string>, execution: Object.<string, string>}>}
 *          Object with consensus and execution totals by address, in PLS, as exact decimal text.
 */
export async function getValidatorPayments(
  ids,
  startDate,
  endDate,
  config = readConfig(),
) {
  try {
    const startTs = dayStartSeconds(startDate);
    const endTs = dayStartSeconds(endDate);

    if (startTs === null || endTs === null) {
      throw new Error("Invalid date format provided.");
    }

    const delayMs = config.retry_delay_ms ?? DEFAULT_RETRY_DELAY_MS;
    const settings = {
      config,
      retrying: (fn, context) => retry(fn, RETRIES, context, delayMs),
    };

    // Fetch genesis time with retries
    const genesis = await fetchGenesis(settings);

    // Calculate start and end slots, clamping startSlot to 0 to avoid negative slots (which do not exist and would cause API errors)
    let startSlot = Math.ceil(
      (startTs - genesis) / config.slot_interval_seconds,
    );
    startSlot = Math.max(0, startSlot); // Prevent negative slots, as they indicate pre-genesis times and don't exist
    // The last slot before the end day's midnight: a slot at that midnight
    // exactly is the end day's, which is not counted
    const endSlot =
      Math.ceil((endTs - genesis) / config.slot_interval_seconds) - 1;

    if (startSlot > endSlot) {
      throw new Error("Start slot is greater than end slot.");
    }

    // Get validator info with retries for each fetch
    const { validators, indicesSet } = await fetchValidators(settings, ids);
    if (indicesSet.size === 0) {
      throw new Error("No valid validators found.");
    }

    // Totals by address for consensus and execution layers: in gwei, and
    // in wei
    const totals = { consensus: {}, execution: {} };
    await scanSlots(
      { ...settings, validators, indicesSet },
      startSlot,
      endSlot,
      totals,
    );
    const paid = {
      consensus: plsTexts(
        totals.consensus,
        String(config.gwei_to_pls).length - 1,
      ),
      execution: plsTexts(totals.execution, WEI_DECIMALS),
    };

    // Output summary (consensus and execution totals by address)
    console.log(
      "Consensus Layer Payments by Withdrawal Address (PLS):",
      paid.consensus,
    );
    console.log(
      "Execution Layer Payments by Fee Recipient Address (PLS):",
      paid.execution,
    );
    return paid;
  } catch (error) {
    console.error("Fatal error in getValidatorPayments:", error.message);
    throw error; // Rethrow for caller handling
  }
}

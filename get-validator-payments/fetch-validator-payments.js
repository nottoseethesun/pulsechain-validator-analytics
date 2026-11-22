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
 * including by fee payment type (Consensus Layer and Execution Layer).
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
 * - "max_effective_balance" is the stake, in PLS: 32,000,000 on PulseChain, as the spec's
 *   MAX_EFFECTIVE_BALANCE, 32,000,000,000,000,000 gwei, says. "slots_per_epoch" turns the
 *   validator's withdrawable epoch into a slot: 32 on PulseChain (SLOTS_PER_EPOCH).
 * - An optional "retry_delay_ms" sets the wait before a failed request is tried again, times its
 *   attempt: 1000 when absent.
 * - An optional "request_timeout_ms" sets how long a request may take, its whole answer read, before
 *   it counts as failed: 30000 when absent.
 *
 * Usage:
 *
 * - Import or require the script in your Node.js file.  See for example, the file `./index.js`.
 *
 * - Call the function with parameters:
 *
 *     getValidatorPayments(['0xYourPubKey1', '12345'], '2025-01-01', '2025-11-04', readConfig())
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
 *   address.
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
import { KINDS } from "crypto-price-fetchers/lib/settings-schema";
import { fetchWithinTimeLimit } from "crypto-price-fetchers/lib/time-limited-fetch";

/** How long a request may take, its whole answer read, in ms, unless config.json sets request_timeout_ms. */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** How many times a failed request is tried again. */
const RETRIES = 4;

/** The wait before a failed request is tried again, times its attempt, in ms, unless config.json sets retry_delay_ms. */
const DEFAULT_RETRY_DELAY_MS = 1000;

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
    gwei_to_pls: KINDS.wholeAbove0,
    max_effective_balance: KINDS.wholeAbove0,
    slots_per_epoch: KINDS.wholeAbove0,
    concurrency: KINDS.wholeAbove0,
    retry_delay_ms: KINDS.wholeAtLeast0,
    request_timeout_ms: KINDS.wholeAbove0,
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

/**
 * A utility function to retry an async operation up to a specified number of times.
 * Logs success after retries if applicable.
 * @param {Function} fn - The async function to retry.
 * @param {number} retries - Number of retries.
 * @param {string} [context=''] - Optional context for logging (e.g., 'processing slot 123').
 * @param {number} [delayMs=DEFAULT_RETRY_DELAY_MS] - The wait before the next attempt, times the attempt.
 * @returns {Promise<any>} The result of the function.
 */
async function retry(
  fn,
  retries = RETRIES,
  context = "",
  delayMs = DEFAULT_RETRY_DELAY_MS,
) {
  let lastError;
  let attempt = 1;
  for (; attempt <= retries + 1; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        console.log(
          `Retry succeeded on attempt ${attempt}${context ? ` for ${context}` : ""}`,
        );
      }
      return result;
    } catch (error) {
      lastError = error;
      console.log(error); // The whole error, with what its message leaves out
      console.error(
        `Retry attempt ${attempt} failed${context ? ` for ${context}` : ""}. Retrying...`,
      );
      // The wait grows by delayMs with each attempt
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
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
 * Fetches the gas used for a transaction via RPC with error handling and retries.
 * @param {Object} scan - The scan: its settings, and how it retries
 * @param {string} txHash - The transaction hash.
 * @returns {Promise<bigint>} The gas used as BigInt.
 */
async function getGasUsed(scan, txHash) {
  return scan.retrying(async () => {
    try {
      const res = await rpcRequest(scan, "eth_getTransactionReceipt", [txHash]);
      if (!res.ok) {
        throw new Error(
          `HTTP error! Status: ${res.status} for txHash: ${txHash}`,
        );
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(
          `RPC error: ${data.error.message} for txHash: ${txHash}`,
        );
      }
      // A mined transaction has a receipt, so an endpoint that gives none
      // is behind or failing, and is asked again
      if (!data.result) {
        throw new Error(`No receipt for txHash: ${txHash}`);
      }
      return BigInt(data.result.gasUsed);
    } catch (error) {
      console.error(`Error fetching gas used for ${txHash}:`, error.message);
      throw error;
    }
  }, `fetching gas used for tx ${txHash}`);
}

/**
 * Fetches the beacon chain's genesis time.
 *
 * @param {Object} scan - The scan: its settings, and how it retries
 * @returns {Promise<number>} The genesis time, in unix seconds
 */
async function fetchGenesis(scan) {
  const genesisRes = await scan.retrying(
    async () =>
      await fetchWithTimeout(
        scan,
        `${scan.config.beacon_url}/eth/v1/beacon/genesis`,
      ),
    "fetching genesis",
  );
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
    const pubkey = valData.validator.pubkey;
    const withdrawalCred = valData.validator.withdrawal_credentials;
    let withdrawAddress = null;
    if (withdrawalCred.startsWith("0x01")) {
      withdrawAddress = "0x" + withdrawalCred.slice(-40);
    }
    validators[index] = {
      pubkey,
      withdrawAddress,
      withdrawableSlot:
        Number(valData.validator.withdrawable_epoch) *
        scan.config.slots_per_epoch,
      consensus: 0,
      execution: 0,
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
 * @returns {Array<{index: number, address: string, amount: number}>} The payments
 */
function slotWithdrawals(scan, slot, withdrawals) {
  const payments = [];
  for (const wd of withdrawals) {
    const index = parseInt(wd.validator_index, 10);
    if (!scan.indicesSet.has(index)) continue;
    const withdrawn = parseInt(wd.amount, 10) / scan.config.gwei_to_pls; // gwei to PLS
    const isFullExit = slot >= scan.validators[index].withdrawableSlot;
    const amount = isFullExit
      ? Math.max(0, withdrawn - scan.config.max_effective_balance)
      : withdrawn;
    payments.push({ index, address: wd.address.toLowerCase(), amount });
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
 * @returns {Promise<?{feeRecipient: string, amount: number}>} The fees, in PLS, or null when the block has no payload
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
  const feeRecipient = payload.fee_recipient.toLowerCase();

  // Fetch the execution block details
  const rpcRes = await scan.retrying(
    async () =>
      await rpcRequest(scan, "eth_getBlockByNumber", [
        `0x${blockNumber.toString(16)}`,
        true,
      ]),
    `fetching block ${blockNumber}`,
  );
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

  const prioritySum = await blockPriorityFees(scan, block.result);
  return { feeRecipient, amount: Number(prioritySum) / 1e18 };
}

/**
 * Adds one slot's payments to the totals: its block's withdrawals, and
 * its priority fees when a validator named proposed it, once every read
 * of the slot has succeeded.
 *
 * @param {Object} scan - The scan: its settings, validators, and how it retries
 * @param {number} slot - The slot
 * @param {{consensus: Object<string, number>, execution: Object<string, number>}} totals - The totals, in PLS, by address
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
    for (const { index, address, amount } of withdrawn) {
      scan.validators[index].consensus += amount;
      totals.consensus[address] = (totals.consensus[address] ?? 0) + amount;
    }
    if (tips !== null) {
      scan.validators[proposer].execution += tips.amount;
      totals.execution[tips.feeRecipient] =
        (totals.execution[tips.feeRecipient] ?? 0) + tips.amount;
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
 * progress. A slot whose block cannot be read after every attempt fails
 * the scan, once the slots read with it are done.
 *
 * @param {Object} scan - The scan: its settings, validators, and how it retries
 * @param {number} startSlot - The first slot
 * @param {number} endSlot - The last slot
 * @param {{consensus: Object<string, number>, execution: Object<string, number>}} totals - The totals, in PLS, by address
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
 * @returns {Promise<{consensus: Object.<string, number>, execution: Object.<string, number>}>}
 *          Object with consensus and execution totals by address (in PLS).
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

    // Totals by address for consensus and execution layers
    const totals = { consensus: {}, execution: {} };
    await scanSlots(
      { ...settings, validators, indicesSet },
      startSlot,
      endSlot,
      totals,
    );

    // Output summary (consensus and execution totals by address)
    console.log(
      "Consensus Layer Payments by Withdrawal Address (PLS):",
      totals.consensus,
    );
    console.log(
      "Execution Layer Payments by Fee Recipient Address (PLS):",
      totals.execution,
    );
    return { consensus: totals.consensus, execution: totals.execution };
  } catch (error) {
    console.error("Fatal error in getValidatorPayments:", error.message);
    throw error; // Rethrow for caller handling
  }
}

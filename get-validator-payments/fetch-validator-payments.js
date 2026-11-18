/**
 * @fileoverview Script to calculate validator payments, in $pls "Pulse" token,
 * on PulseChain for consensus and execution layers.
 *
 * This script scans the PulseChain beacon chain slots in a given date range to compute totals for
 * consensus layer payments (via withdrawals, excluding full exit principals) and execution layer
 * payments (via priority fees from proposed blocks). It uses the g4mm4.io APIs for data fetching.
 *
 * A full per-wallet address breakdown is provided so that coins are tracked on a per-wallet basis,
 * including by fee payment type (Consensus Layer and Execution Layer).
 *
 * Public API: The main function is getValidatorPayments(ids, startDate, endDate, config), where ids can be
 * validator public keys or indices, and config is the settings that readConfig() reads.
 *
 * Configuration:
 * - readConfig() loads major configuration values (e.g., API endpoints, concurrency) from a `config.json`
 *   file in the working directory; getValidatorPayments reads it when no config is passed.
 *
 * - Example config.json:
 *   {
 *     "beacon_url": "https://rpc-pulsechain.g4mm4.io/beacon-api",
 *     "rpc_url": "https://rpc-pulsechain.g4mm4.io",
 *     "slot_interval_seconds": 12,
 *     "gwei_to_pls": 1000000000,
 *     "max_effective_balance": 32,
 *     "concurrency": 90
 *   }
 * - Adjust values in config.json as needed for customization.
 * - An optional "retry_delay_ms" sets the wait before a failed request is tried again, times its
 *   attempt: 1000 when absent.
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

import fs from "node:fs";

// Hardcoded fetch timeout in ms (can be added to config.json later if needed)
const FETCH_TIMEOUT_MS = 30000;

/** How many times a failed request is tried again. */
const RETRIES = 4;

/** The wait before a failed request is tried again, times its attempt, in ms, unless config.json sets retry_delay_ms. */
const DEFAULT_RETRY_DELAY_MS = 1000;

/**
 * Reads the settings from config.json.
 *
 * @param {string} [file='config.json'] - The file, by default in the working directory
 * @returns {Object} The settings, as the file names them
 */
export function readConfig(file = "config.json") {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * A utility function to make a fetch request with timeout using AbortController.
 * @param {string} url - The URL to fetch.
 * @param {Object} [options={}] - Fetch options.
 * @returns {Promise<Response>} The fetch response.
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
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
      console.log(error); // Log full error object as requested
      console.error(
        `Retry attempt ${attempt} failed${context ? ` for ${context}` : ""}. Retrying...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt)); // Exponential backoff
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
 * @returns {Promise<Response>} The response
 */
function rpcRequest(scan, method, params) {
  return fetchWithTimeout(scan.config.rpc_url, {
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
      return data.result ? BigInt(data.result.gasUsed) : 0n;
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
      await fetchWithTimeout(`${scan.config.beacon_url}/eth/v1/beacon/genesis`),
    "fetching genesis",
  );
  if (!genesisRes.ok) {
    throw new Error(`Failed to fetch genesis: HTTP ${genesisRes.status}`);
  }
  const genesisData = await genesisRes.json();
  return parseInt(genesisData.data.genesis_time);
}

/**
 * Fetches each validator's index, public key and withdrawal address.
 *
 * @param {Object} scan - The scan: its settings, and how it retries
 * @param {string[]} ids - The validators, by public key or index
 * @returns {Promise<{validators: Object, indicesSet: Set<number>}>} The validators found, by index, and their indices
 */
async function fetchValidators(scan, ids) {
  const validators = {};
  const indicesSet = new Set();
  for (const id of ids) {
    try {
      const res = await scan.retrying(
        async () =>
          await fetchWithTimeout(
            `${scan.config.beacon_url}/eth/v1/beacon/states/finalized/validators/${id}`,
          ),
        `fetching validator ${id}`,
      );
      if (!res.ok) {
        console.error(`Failed to fetch validator ${id}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const valData = data.data;
      const index = parseInt(valData.index);
      const pubkey = valData.validator.pubkey;
      const withdrawalCred = valData.validator.withdrawal_credentials;
      let withdrawAddress = null;
      if (withdrawalCred.startsWith("0x01")) {
        withdrawAddress = "0x" + withdrawalCred.slice(-40);
      }
      validators[index] = {
        pubkey,
        withdrawAddress,
        consensus: 0,
        execution: 0,
      };
      indicesSet.add(index);
    } catch (error) {
      console.error(`Error fetching validator info for ${id}:`, error.message);
    }
  }
  return { validators, indicesSet };
}

/**
 * Adds a block's withdrawals to the validators named to the consensus
 * layer's totals, by withdrawal address.
 *
 * @param {Object} scan - The scan: its settings and validators
 * @param {Array<Object>} withdrawals - The block's withdrawals
 * @param {Object<string, number>} consensusTotals - The totals, in PLS, by address
 */
function addWithdrawals(scan, withdrawals, consensusTotals) {
  for (const wd of withdrawals) {
    const wdIndex = parseInt(wd.validator_index);
    if (scan.indicesSet.has(wdIndex)) {
      let amount = parseInt(wd.amount) / scan.config.gwei_to_pls; // Convert gwei to PLS
      if (amount > scan.config.max_effective_balance) {
        amount -= scan.config.max_effective_balance; // Exclude principal for full exits
      }
      scan.validators[wdIndex].consensus += amount;
      const addr = wd.address.toLowerCase();
      consensusTotals[addr] = (consensusTotals[addr] || 0) + amount;
    }
  }
}

/**
 * Adds up the priority fees a block's transactions paid its proposer.
 *
 * @param {Object} scan - The scan: its settings, and how it retries
 * @param {Object} b - The execution block, with its transactions
 * @param {number} blockNumber - Its number
 * @returns {Promise<bigint>} The fees, in wei
 */
async function blockPriorityFees(scan, b, blockNumber) {
  const baseFee = BigInt(b.baseFeePerGas || "0x0");
  let prioritySum = 0n;
  for (const tx of b.transactions) {
    try {
      const maxPriority = BigInt(tx.maxPriorityFeePerGas || "0x0");
      const maxFee = BigInt(tx.maxFeePerGas || tx.gasPrice || "0x0");
      const tip =
        maxPriority < maxFee - baseFee ? maxPriority : maxFee - baseFee;
      const gasUsed = await getGasUsed(scan, tx.hash);
      prioritySum += tip * gasUsed;
    } catch (txError) {
      console.error(
        `Error processing tx ${tx.hash} in block ${blockNumber}:`,
        txError.message,
      );
    }
  }
  return prioritySum;
}

/**
 * Adds the priority fees of a block a validator named proposed to the
 * execution layer's totals, by fee recipient.
 *
 * @param {Object} scan - The scan: its settings, validators, and how it retries
 * @param {number} slot - The block's slot
 * @param {?Object} payload - The block's execution payload
 * @param {number} proposer - The proposer's index
 * @param {Object<string, number>} executionTotals - The totals, in PLS, by address
 */
async function addProposal(scan, slot, payload, proposer, executionTotals) {
  // Safely access execution_payload with optional chaining; skip if undefined
  if (!payload) {
    console.log(
      `Skipping execution layer processing for slot ${slot}: execution_payload undefined`,
    );
    return;
  }
  const blockNumber = parseInt(payload.block_number);
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
  if (block.error || !block.result) {
    console.error(
      `RPC error for block ${blockNumber}: ${block.error ? block.error.message : "No result"}`,
    );
    return;
  }

  const prioritySum = await blockPriorityFees(scan, block.result, blockNumber);
  const executionAmount = Number(prioritySum) / 1e18;
  scan.validators[proposer].execution += executionAmount;
  executionTotals[feeRecipient] =
    (executionTotals[feeRecipient] || 0) + executionAmount;
}

/**
 * Adds one slot's payments to the totals: its block's withdrawals, and
 * its priority fees when a validator named proposed it.
 *
 * @param {Object} scan - The scan: its settings, validators, and how it retries
 * @param {number} slot - The slot
 * @param {{consensus: Object<string, number>, execution: Object<string, number>}} totals - The totals, in PLS, by address
 */
async function processSlot(scan, slot, totals) {
  try {
    const blockRes = await fetchWithTimeout(
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
    const proposer = parseInt(message.proposer_index);

    // Process consensus layer withdrawals if present in the block; if withdrawals is undefined or empty, treat as no withdrawals (common case, no error)
    addWithdrawals(
      scan,
      body.execution_payload?.withdrawals || [],
      totals.consensus,
    );

    // Process execution layer proposal if the proposer matches one of our validators
    if (scan.indicesSet.has(proposer)) {
      await addProposal(
        scan,
        slot,
        body.execution_payload,
        proposer,
        totals.execution,
      );
    }
  } catch (error) {
    console.error(`Error processing slot ${slot}:`, error.message);
    throw error;
  }
}

/**
 * Scans the slots, as many at once as the settings allow, logging its
 * progress.
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

  // Scan slots with concurrency; use Promise.allSettled to continue despite individual slot errors
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
      await Promise.allSettled(activePromises);
      processedSlots += activePromises.length;
      activePromises = [];
    }
  }

  // Wait for any remaining promises in the batch
  if (activePromises.length > 0) {
    await Promise.allSettled(activePromises);
    processedSlots += activePromises.length;
  }

  clearInterval(progressInterval);
  console.log(
    `Scan complete: Processed ${processedSlots} / ${totalSlots} slots (100.00%)`,
  );
}

/**
 * Calculates validator payments for consensus and execution layers on PulseChain.
 *
 * Scans beacon chain slots in the date range to sum consensus withdrawals (excluding full exit principals >32 PLS)
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
    const startTs = Math.floor(
      new Date(startDate + "T00:00:00Z").getTime() / 1000,
    );
    const endTs = Math.floor(new Date(endDate + "T00:00:00Z").getTime() / 1000);

    if (isNaN(startTs) || isNaN(endTs)) {
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
    const endSlot = Math.floor(
      (endTs - genesis) / config.slot_interval_seconds,
    );

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

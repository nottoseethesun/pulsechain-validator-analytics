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
 * Public API: The main function is getValidatorPayments(ids, startDate, endDate), where ids can be 
 * validator public keys or indices.
 * 
 * Configuration:
 * - The script loads major configuration values (e.g., API endpoints, concurrency) from a `config.json` 
 *   file in the working directory.
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
 * 
 * Usage:
 * 
 * - Import or require the script in your Node.js file.  See for example, the file `./index.js`.
 * 
 * - Call the function with parameters:
 * 
 *     getValidatorPayments(['0xYourPubKey1', '12345'], '2025-01-01', '2025-11-04')
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

import fetch from 'node-fetch'; // Updated to ESM import (node-fetch v3 is ESM-only)
import fs from 'node:fs'; // Built-in Node.js module for file system operations

// Load configuration from config.json
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const BEACON_URL = config.beacon_url;
const RPC_URL = config.rpc_url;
const SLOT_INTERVAL_SECONDS = config.slot_interval_seconds;
const GWEI_TO_PLS = config.gwei_to_pls;
const MAX_EFFECTIVE_BALANCE = config.max_effective_balance;
const CONCURRENCY = config.concurrency;

// Hardcoded fetch timeout in ms (can be added to config.json later if needed)
const FETCH_TIMEOUT_MS = 30000;

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
 * @returns {Promise<any>} The result of the function.
 */
async function retry(fn, retries = 4, context = '') {
  let lastError;
  let attempt = 1;
  for (; attempt <= retries + 1; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        console.log(`Retry succeeded on attempt ${attempt}${context ? ` for ${context}` : ''}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      console.log(error); // Log full error object as requested
      console.error(`Retry attempt ${attempt} failed${context ? ` for ${context}` : ''}. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
    }
  }
  throw new Error(`Fatal error: Crucial data could not be obtained after ${retries + 1} attempts${context ? ` for ${context}` : ''}. Please check your network connection and API conditions. Last error: ${lastError.message}`);
}

/**
 * Fetches the gas used for a transaction via RPC with error handling and retries.
 * @param {string} rpcUrl - The RPC URL.
 * @param {string} txHash - The transaction hash.
 * @returns {Promise<bigint>} The gas used as BigInt.
 */
async function getGasUsed(rpcUrl, txHash) {
  return retry(async () => {
    try {
      const body = {
        jsonrpc: '2.0',
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        id: 1
      };
      const res = await fetchWithTimeout(rpcUrl, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {'Content-Type': 'application/json'}
      });
      if (!res.ok) {
        throw new Error(`HTTP error! Status: ${res.status} for txHash: ${txHash}`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(`RPC error: ${data.error.message} for txHash: ${txHash}`);
      }
      return data.result ? BigInt(data.result.gasUsed) : 0n;
    } catch (error) {
      console.error(`Error fetching gas used for ${txHash}:`, error.message);
      throw error;
    }
  }, 4, `fetching gas used for tx ${txHash}`);
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
 * @returns {Promise<{consensus: Object.<string, number>, execution: Object.<string, number>}>} 
 *          Object with consensus and execution totals by address (in PLS).
 */
export async function getValidatorPayments(ids, startDate, endDate) {
  try {
    const startTs = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000);
    const endTs = Math.floor(new Date(endDate + 'T00:00:00Z').getTime() / 1000);

    if (isNaN(startTs) || isNaN(endTs)) {
      throw new Error('Invalid date format provided.');
    }

    // Fetch genesis time with retries
    const genesisRes = await retry(async () => await fetchWithTimeout(`${BEACON_URL}/eth/v1/beacon/genesis`), 4, 'fetching genesis');
    if (!genesisRes.ok) {
      throw new Error(`Failed to fetch genesis: HTTP ${genesisRes.status}`);
    }
    const genesisData = await genesisRes.json();
    const genesis = parseInt(genesisData.data.genesis_time);

    // Calculate start and end slots, clamping startSlot to 0 to avoid negative slots (which do not exist and would cause API errors)
    let startSlot = Math.ceil((startTs - genesis) / SLOT_INTERVAL_SECONDS);
    startSlot = Math.max(0, startSlot); // Prevent negative slots, as they indicate pre-genesis times and don't exist
    const endSlot = Math.floor((endTs - genesis) / SLOT_INTERVAL_SECONDS);

    if (startSlot > endSlot) {
      throw new Error('Start slot is greater than end slot.');
    }

    // Get validator info with retries for each fetch
    const validators = {};
    const indicesSet = new Set();
    for (const id of ids) {
      try {
        const res = await retry(async () => await fetchWithTimeout(`${BEACON_URL}/eth/v1/beacon/states/finalized/validators/${id}`), 4, `fetching validator ${id}`);
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
        if (withdrawalCred.startsWith('0x01')) {
          withdrawAddress = '0x' + withdrawalCred.slice(-40);
        }
        validators[index] = { pubkey, withdrawAddress, consensus: 0, execution: 0 };
        indicesSet.add(index);
      } catch (error) {
        console.error(`Error fetching validator info for ${id}:`, error.message);
      }
    }

    if (indicesSet.size === 0) {
      throw new Error('No valid validators found.');
    }

    // Initialize totals by address for consensus and execution layers
    const consensusTotals = {};
    const executionTotals = {};

    // Set up progress tracking for the slot scan
    const totalSlots = endSlot - startSlot + 1;
    let processedSlots = 0;
    console.log(`Starting scan of ${totalSlots} slots...`);
    const progressInterval = setInterval(() => {
      console.log(`Progress: Processed ${processedSlots} / ${totalSlots} slots (${((processedSlots / totalSlots) * 100).toFixed(2)}%)`);
    }, 4000); // Every 4 seconds (average of 3-5)

    // Scan slots with concurrency; use Promise.allSettled to continue despite individual slot errors
    let activePromises = [];
    for (let slot = startSlot; slot <= endSlot; slot++) {
      // Skip negative slots (though clamped earlier, added for safety)
      if (slot < 0) {
        console.log(`Skipping invalid negative slot: ${slot}`);
        continue;
      }

      activePromises.push(retry(async () => {
        try {
          const blockRes = await fetchWithTimeout(`${BEACON_URL}/eth/v1/beacon/blocks/${slot}`);
          if (!blockRes.ok) {
            // For 404, log explanation without throwing (no retry needed, as no block exists)
            if (blockRes.status === 404) {
              console.log(`HTTP error! Status: ${blockRes.status} for slot: ${slot} - No block exists for this slot; it is normal that this happens from time to time.`);
              return; // Skip without retry or error
            }
            // For 400 error (e.g., for invalid/negative slot), do not retry as the slot doesn't exist
            if (blockRes.status === 400) {
              console.log(`Skipping non-existent slot ${slot} (HTTP 400)`);
              return; // Skip without retry or error
            }
            throw new Error(`HTTP error! Status: ${blockRes.status} for slot: ${slot}`);
          }
          const blockData = await blockRes.json();
          const message = blockData.data.message;
          const body = message.body;
          const proposer = parseInt(message.proposer_index);

          // Process consensus layer withdrawals if present in the block; if withdrawals is undefined or empty, treat as no withdrawals (common case, no error)
          // Use optional chaining to safely handle cases where execution_payload might be undefined
          for (const wd of body.execution_payload?.withdrawals || []) {
            const wdIndex = parseInt(wd.validator_index);
            if (indicesSet.has(wdIndex)) {
              let amount = parseInt(wd.amount) / GWEI_TO_PLS; // Convert gwei to PLS
              if (amount > MAX_EFFECTIVE_BALANCE) {
                amount -= MAX_EFFECTIVE_BALANCE; // Exclude principal for full exits
              }
              validators[wdIndex].consensus += amount;
              const addr = wd.address.toLowerCase();
              consensusTotals[addr] = (consensusTotals[addr] || 0) + amount;
            }
          }

          // Process execution layer proposal if the proposer matches one of our validators
          if (indicesSet.has(proposer)) {
            // Safely access execution_payload with optional chaining; skip if undefined
            const payload = body.execution_payload;
            if (!payload) {
              console.log(`Skipping execution layer processing for slot ${slot}: execution_payload undefined`);
              return;
            }
            const blockNumber = parseInt(payload.block_number);
            const feeRecipient = payload.fee_recipient.toLowerCase();

            // Fetch the execution block details
            const rpcBody = {
              jsonrpc: '2.0',
              method: 'eth_getBlockByNumber',
              params: [`0x${blockNumber.toString(16)}`, true],
              id: 1
            };
            const rpcRes = await retry(async () => await fetchWithTimeout(RPC_URL, {
              method: 'POST',
              body: JSON.stringify(rpcBody),
              headers: {'Content-Type': 'application/json'}
            }), 4, `fetching block ${blockNumber}`);
            if (!rpcRes.ok) {
              throw new Error(`HTTP error! Status: ${rpcRes.status} for block: ${blockNumber}`);
            }
            const block = await rpcRes.json();
            if (block.error || !block.result) {
              console.error(`RPC error for block ${blockNumber}: ${block.error ? block.error.message : 'No result'}`);
              return;
            }

            const b = block.result;
            const baseFee = BigInt(b.baseFeePerGas || '0x0');

            let prioritySum = 0n;
            for (const tx of b.transactions) {
              try {
                const maxPriority = BigInt(tx.maxPriorityFeePerGas || '0x0');
                const maxFee = BigInt(tx.maxFeePerGas || tx.gasPrice || '0x0');
                const tip = maxPriority < (maxFee - baseFee) ? maxPriority : (maxFee - baseFee);
                const gasUsed = await getGasUsed(RPC_URL, tx.hash);
                prioritySum += tip * gasUsed;
              } catch (txError) {
                console.error(`Error processing tx ${tx.hash} in block ${blockNumber}:`, txError.message);
              }
            }

            const executionAmount = Number(prioritySum) / 1e18;
            validators[proposer].execution += executionAmount;
            executionTotals[feeRecipient] = (executionTotals[feeRecipient] || 0) + executionAmount;
          }
        } catch (error) {
          console.error(`Error processing slot ${slot}:`, error.message);
          throw error;
        }
      }, 4, `processing slot ${slot}`));

      if (activePromises.length >= CONCURRENCY) {
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
    console.log(`Scan complete: Processed ${processedSlots} / ${totalSlots} slots (100.00%)`);

    // Output summary (consensus and execution totals by address)
    console.log('Consensus Layer Payments by Withdrawal Address (PLS):', consensusTotals);
    console.log('Execution Layer Payments by Fee Recipient Address (PLS):', executionTotals);
    return { consensus: consensusTotals, execution: executionTotals };
  } catch (error) {
    console.error('Fatal error in getValidatorPayments:', error.message);
    throw error; // Rethrow for caller handling
  }
}

// No module.exports needed in ESM; the export is above

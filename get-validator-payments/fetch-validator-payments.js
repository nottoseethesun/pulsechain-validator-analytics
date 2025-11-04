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
 * Public API: The main function is getValidatorPayments(ids, startDate, endDate), where ids can be validator public keys or indices.
 * 
 * Usage:
 * - Import or require the script in your Node.js file.
 * - Call the function with parameters:
 *   getValidatorPayments(['0xYourPubKey1', '12345'], '2025-01-01', '2025-11-04')
 *     .then(result => console.log(result))
 *     .catch(err => console.error(err));
 * - The function logs summaries to console and returns an object with consensus and execution totals by address.
 * - Adjust CONCURRENCY if needed, but default is 90 for parallel requests.
 * 
 * Note: This performs a heavy scan over potentially millions of slots. Use with caution to avoid API rate limits.
 * Add retries and error handling for robustness in production.
 */

import fetch from 'node-fetch'; // Updated to ESM import (node-fetch v3 is ESM-only)

/**
 * Fetches the gas used for a transaction via RPC with error handling.
 * @param {string} rpcUrl - The RPC URL.
 * @param {string} txHash - The transaction hash.
 * @returns {Promise<bigint>} The gas used as BigInt.
 */
async function getGasUsed(rpcUrl, txHash) {
  try {
    const body = {
      jsonrpc: '2.0',
      method: 'eth_getTransactionReceipt',
      params: [txHash],
      id: 1
    };
    const res = await fetch(rpcUrl, {
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
    return 0n; // Fallback to 0 on error
  }
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
  const BEACON_URL = 'https://rpc-pulsechain.g4mm4.io/beacon-api';
  const RPC_URL = 'https://rpc-pulsechain.g4mm4.io';
  const SLOT_INTERVAL_SECONDS = 12;
  const GWEI_TO_PLS = 1e9;
  const MAX_EFFECTIVE_BALANCE = 32;
  const CONCURRENCY = 90;

  try {
    const startTs = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000);
    const endTs = Math.floor(new Date(endDate + 'T00:00:00Z').getTime() / 1000);

    if (isNaN(startTs) || isNaN(endTs)) {
      throw new Error('Invalid date format provided.');
    }

    // Get genesis time
    const genesisRes = await fetch(`${BEACON_URL}/eth/v1/beacon/genesis`);
    if (!genesisRes.ok) {
      throw new Error(`Failed to fetch genesis: HTTP ${genesisRes.status}`);
    }
    const genesisData = await genesisRes.json();
    const genesis = parseInt(genesisData.data.genesis_time);

    const startSlot = Math.ceil((startTs - genesis) / SLOT_INTERVAL_SECONDS);
    const endSlot = Math.floor((endTs - genesis) / SLOT_INTERVAL_SECONDS);

    if (startSlot > endSlot) {
      throw new Error('Start slot is greater than end slot.');
    }

    // Get validator info
    const validators = {};
    const indicesSet = new Set();
    for (const id of ids) {
      try {
        const res = await fetch(`${BEACON_URL}/eth/v1/beacon/states/finalized/validators/${id}`);
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

    // Totals by address
    const consensusTotals = {};
    const executionTotals = {};

    // Progress tracking
    const totalSlots = endSlot - startSlot + 1;
    let processedSlots = 0;
    console.log(`Starting scan of ${totalSlots} slots...`);
    const progressInterval = setInterval(() => {
      console.log(`Progress: Processed ${processedSlots} / ${totalSlots} slots (${((processedSlots / totalSlots) * 100).toFixed(2)}%)`);
    }, 4000); // Every 4 seconds (average of 3-5)

    // Scan slots with concurrency using Promise.allSettled to handle errors gracefully
    let activePromises = [];
    for (let slot = startSlot; slot <= endSlot; slot++) {
      activePromises.push((async () => {
        try {
          const blockRes = await fetch(`${BEACON_URL}/eth/v1/beacon/blocks/${slot}`);
          if (!blockRes.ok) {
            if (blockRes.status === 404) return; // Likely missed slot, skip silently
            throw new Error(`HTTP error! Status: ${blockRes.status} for slot: ${slot}`);
          }
          const blockData = await blockRes.json();
          const message = blockData.data.message;
          const body = message.body;
          const proposer = parseInt(message.proposer_index);

          // Process withdrawals (consensus layer)
          for (const wd of body.execution_payload.withdrawals || []) {
            const wdIndex = parseInt(wd.validator_index);
            if (indicesSet.has(wdIndex)) {
              let amount = parseInt(wd.amount) / GWEI_TO_PLS; // gwei to PLS
              if (amount > MAX_EFFECTIVE_BALANCE) {
                amount -= MAX_EFFECTIVE_BALANCE;
              }
              validators[wdIndex].consensus += amount;
              const addr = wd.address.toLowerCase();
              consensusTotals[addr] = (consensusTotals[addr] || 0) + amount;
            }
          }

          // Process proposal (execution layer) if matches
          if (indicesSet.has(proposer)) {
            const payload = body.execution_payload;
            const blockNumber = parseInt(payload.block_number);
            const feeRecipient = payload.fee_recipient.toLowerCase();

            // Get execution block
            const rpcBody = {
              jsonrpc: '2.0',
              method: 'eth_getBlockByNumber',
              params: [`0x${blockNumber.toString(16)}`, true],
              id: 1
            };
            const rpcRes = await fetch(RPC_URL, {
              method: 'POST',
              body: JSON.stringify(rpcBody),
              headers: {'Content-Type': 'application/json'}
            });
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
        }
      })());

      if (activePromises.length >= CONCURRENCY) {
        await Promise.allSettled(activePromises);
        processedSlots += activePromises.length;
        activePromises = [];
      }
    }

    // Wait for any remaining promises
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

/**
 * Didn't record your Execution Address(es) for your PulseChain Validator(s), but now
 * you need to find it/them?
 * 
 * This Node.js script looks through the PulseChain blockchain slot history to find where
 * your PulseChain Validator got paid by the network to its Execution Address, and stops to
 * report that wallet address to you on the command line.
 * 
 * This script fetches block data in 
 * parallel batches of 30 slots at a time.  It also does progress 
 * logging to show how far along it is, so it doesn't appear to hang — you'll see 
 * updates every 30 slots checked. If the validator hasn't proposed a block in 
 * the lookback period (default 1,200,000 slots, about 84 days on PulseChain with 
 * 3-second slots), it will report no findings.
 * 
 * You can increase the MAX_LOOKBACK value in the code for a deeper search, but 
 * note that public APIs may have rate limits, so too high a concurrency could 
 * cause errors—adjust CONCURRENCY down if needed.
 * 
 * Installation: 
 *   `cd` to directory holding this file and the `package.json`
 *   `npm install`
 * 
 * Usage:
 *   node fetch-execution-address.js <validator_pubkey> [start_slot]
 * 
 * Parameters:
 *   - validator_pubkey (required): The BLS public key of the validator as a 
 *     hexadecimal string (e.g., 
 *     '0xb1382b802b5a1400bdc939e12a9351759f44e0d797c9780269f6949054f1bfc4d9286ddaf82032ec70d41cc5d16f3c48').
 *     Data type: string.
 *   - start_slot (optional): The slot number to start scanning backwards from. 
 *     If omitted, the script fetches and uses the current head slot. Use this 
 *     to continue a search from a previous point (e.g., if you've already 
 *     checked recent slots and want to go deeper without re-scanning). 
 *     Data type: integer.
 * 
 * Example:
 *   node script.js 0xb1382b802b5a1400bdc939e12a9351759f44e0d797c9780269f6949054f1bfc4d9286ddaf82032ec70d41cc5d16f3c48
 *   (Uses current head slot as start)
 * 
 *   node script.js 0xb1382b802b5a1400bdc939e12a9351759f44e0d797c9780269f6949054f1bfc4d9286ddaf82032ec70d41cc5d16f3c48 1200000
 *   (Starts scanning backwards from slot 1200000)
 * 
 * Dependencies:
 *   - axios: For making HTTP requests to the Beacon API.  Included in `package.json`.
 */

const axios = require('axios');

const BEACON_API = 'https://pulsechain-beacon-api.publicnode.com/';
const CONCURRENCY = 30; // Number of parallel requests; adjust based on rate limits
const MAX_LOOKBACK = 1200000;

/**
 * Fetches the validator index for a given public key.
 * @param {string} pubkey - The BLS public key of the validator (hex string).
 * @returns {Promise<number>} The validator index as an integer.
 */
async function getValidatorIndex(pubkey) {
  try {
    const response = await axios.get(`${BEACON_API}eth/v1/beacon/states/finalized/validators/${pubkey}`);
    return parseInt(response.data.data.index);
  } catch (error) {
    console.error(`Error fetching validator index: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Fetches the current head slot from the Beacon API.
 * @returns {Promise<number>} The current head slot as an integer.
 */
async function getHeadSlot() {
  try {
    const response = await axios.get(`${BEACON_API}eth/v1/beacon/headers/head`);
    return parseInt(response.data.data.header.message.slot);
  } catch (error) {
    console.error(`Error fetching head slot: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Splits an array into chunks of a specified size.
 * @param {Array} array - The array to chunk.
 * @param {number} chunkSize - The size of each chunk.
 * @returns {Array<Array>} An array of chunked sub-arrays.
 */
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Scans slots backwards to find a block proposed by the validator and extracts 
 * the fee recipient (execution address).
 * @param {number} index - The validator index.
 * @param {string} pubkey - The validator public key (for logging).
 * @param {number} [maxLookback=MAX_LOOKBACK] - The maximum number of slots to scan backwards.
 * @param {number|null} [customStartSlot=null] - Optional custom starting slot; defaults to current head if null.
 * @returns {Promise<string|null>} The fee recipient address if found, else null.
 */
async function findFeeRecipient(index, pubkey, maxLookback = MAX_LOOKBACK, customStartSlot = null) {
  const startSlot = customStartSlot ?? await getHeadSlot();
  const endSlot = Math.max(startSlot - maxLookback + 1, 0);
  const slots = [];
  for (let s = startSlot; s >= endSlot; s--) {
    slots.push(s);
  }
  const totalSlots = slots.length;
  const slotChunks = chunkArray(slots, CONCURRENCY);

  let processed = 0;
  for (const chunk of slotChunks) {
    const promises = chunk.map(async (slot) => {
      try {
        const response = await axios.get(`${BEACON_API}eth/v2/beacon/blocks/${slot}`);
        const block = response.data.data.message;
        if (parseInt(block.proposer_index) === index) {
          return block.body.execution_payload.fee_recipient;
        }
      } catch (error) {
        if (error.response && error.response.status !== 404) {
          console.error(`Error fetching block at slot ${slot}: ${error.message}`);
        }
      }
      return null;
    });

    const results = await Promise.all(promises);
    const feeRecipient = results.find((r) => r !== null);
    if (feeRecipient) {
      return feeRecipient;
    }

    processed += chunk.length;
    const currentSlot = chunk[chunk.length - 1];
    console.log(`Progress for validator ${pubkey}: Processed ${processed} / ${totalSlots} slots (down to slot ${currentSlot})`);
  }
  return null;
}

/**
 * Main entry point for the script.
 */
async function main() {
  if (process.argv.length < 3) {
    console.log('Usage: node script.js <validator_pubkey> [start_slot]');
    process.exit(1);
  }
  const pubkey = process.argv[2];
  const customStartSlot = process.argv[3] ? parseInt(process.argv[3]) : null;
  const index = await getValidatorIndex(pubkey);
  console.log(`Validator index: ${index}`);
  const feeRecipient = await findFeeRecipient(index, pubkey, MAX_LOOKBACK, customStartSlot);
  if (feeRecipient) {
    console.log(`Execution Address (Fee Recipient): ${feeRecipient}`);
  } else {
    console.log('No recent block proposals found within the lookback period. Try increasing maxLookback if needed.');
  }
}

main();

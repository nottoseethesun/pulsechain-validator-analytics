/**
 * @module PulseChain Balance Checker
 * 
 * @description
 * This Node.js command-line program queries the balances of specified tokens for a given PulseChain wallet address
 * at a specific block number or UTC date (midnight). It supports the native PLS token and ERC-20 tokens.
 * Balances are formatted in human-readable decimal format with commas for readability.
 * A supplementary plain balance output is provided without commas or separators except for decimal points (trailing .0 removed for whole numbers).
 * 
 * Dependencies:
 * - NodeJS version ~ 21
 * - ethers: For interacting with the Ethereum-compatible PulseChain blockchain.
 * - commander: For parsing command-line options.
 * - fs: For reading the configuration file (built-in Node.js module).
 * 
 * Installation:
 * npm install
 * 
 * Configuration:
 * The program looks for a 'config.json' file in the current working directory with the following structure:
 * {
 *   "defaultRpc": "https://rpc-pulsechain.g4mm4.io"
 * }
 * If the file is missing or invalid, it falls back to the hardcoded default RPC URL.
 * 
 * Usage:
 * node script.js [options]
 * 
 * Options:
 *   -a, --address <address>          PulseChain wallet address (required)
 *   -b, --block <block>              PulseChain block number
 *   -d, --date <date>                UTC date in YYYY-MM-DD format (00:00:00 UTC)
 *   -t, --tokens <tokens>            Comma-separated list of token contract addresses or "Pulse_Native_Gas_Token" for native PLS (required)
 *   -r, --rpc <url>                  RPC URL (use an archive node for historical queries) (default: from config.json or https://rpc-pulsechain.g4mm4.io)
 * 
 * Notes:
 * - Either --block or --date must be provided.
 * - For historical balances (past blocks), the RPC must support archive mode (historical state queries). The default public RPC may not support old blocks. In that case, sign up for a free account at Moralis (https://moralis.com/), create a PulseChain node, and pass the node URL using --rpc <your_moralis_node_url> or update config.json.
 * - Balances are formatted with commas in the integer part and include the decimal part if non-zero (e.g., "430,537,004,257" or "1,234.567").
 * - The program uses binary search to find the closest block for a given date, which is efficient but assumes monotonic increasing timestamps.
 * 
 * Example usage:
 *   node script.js --address 0xYourAddress --date 2023-05-10 --tokens Pulse_Native_Gas_Token,0xContractAddress
 *   or
 *   node script.js --address 0xYourAddress --block 100000 --tokens Pulse_Native_Gas_Token --rpc https://your-archive-rpc.com
 * 
 * Error Handling:
 * - Invalid options or missing required options will cause the program to exit with an error message.
 * - Network or contract query errors are caught and logged, with the program exiting with code 1.
 */

import fs from 'fs';
import { ethers } from 'ethers';
import { Command } from 'commander';

let defaultRpc = 'https://rpc-pulsechain.g4mm4.io'; // Fallback default RPC

try {
  const configData = fs.readFileSync('config.json', 'utf8');
  const config = JSON.parse(configData);
  defaultRpc = config.defaultRpc || defaultRpc;
} catch (error) {
  console.warn('Warning: config.json not found or invalid. Using fallback default RPC.');
}

const program = new Command();

program
  .requiredOption('-a, --address <address>', 'PulseChain wallet address')
  .option('-b, --block <block>', 'PulseChain block number')
  .option('-d, --date <date>', 'UTC date in YYYY-MM-DD format (00:00:00 UTC)')
  .requiredOption('-t, --tokens <tokens>', 'Comma-separated list of token contract addresses or "Pulse_Native_Gas_Token" for native PLS')
  .option('-r, --rpc <url>', 'RPC URL (use an archive node for historical queries)', defaultRpc)
  .parse(process.argv);

const options = program.opts();

if (!options.block && !options.date) {
  console.error('Error: Provide either --block or --date');
  process.exit(1);
}

const tokens = options.tokens.split(',');
const provider = new ethers.JsonRpcProvider(options.rpc);

/**
 * Finds the block number closest to the given target timestamp using binary search.
 * 
 * This function performs a binary search over the blockchain blocks to find the block
 * whose timestamp is closest to the provided target timestamp. It iteratively narrows
 * down the search range by fetching block timestamps and adjusting the low and high bounds.
 * 
 * @param {ethers.JsonRpcProvider} provider - The ethers provider instance connected to the PulseChain RPC.
 * @param {number} targetTimestamp - The target Unix timestamp (in seconds) to find the closest block for.
 * @returns {Promise<number>} A promise that resolves to the block number closest to the target timestamp.
 * @throws {Error} If a block cannot be fetched during the search.
 */
async function findBlockByTimestamp(provider, targetTimestamp) {
  let low = 1;
  let high = await provider.getBlockNumber();
  let closestBlock = low;
  let closestDiff = Infinity;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const block = await provider.getBlock(mid);
    if (!block) {
      throw new Error(`Failed to fetch block ${mid}`);
    }
    const blockTimestamp = block.timestamp;
    const diff = Math.abs(blockTimestamp - targetTimestamp);

    if (diff < closestDiff) {
      closestDiff = diff;
      closestBlock = mid;
    }

    if (blockTimestamp < targetTimestamp) {
      low = mid + 1;
    } else if (blockTimestamp > targetTimestamp) {
      high = mid - 1;
    } else {
      return mid;
    }
  }

  return closestBlock;
}

/**
 * Determines the block number to query based on command-line options.
 * 
 * If a block number is provided via the --block option, it is parsed and returned.
 * If a date is provided via the --date option, it is converted to a Unix timestamp,
 * and the closest block to that timestamp is found using findBlockByTimestamp.
 * 
 * @returns {Promise<number>} A promise that resolves to the block number to query.
 * @throws {Error} If the date format is invalid or if block lookup fails.
 */
async function getBlockNumber() {
  if (options.block) {
    return parseInt(options.block, 10);
  } else {
    const dateStr = options.date + 'T00:00:00.000Z';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format. Use YYYY-MM-DD.');
    }
    const timestamp = Math.floor(date.getTime() / 1000);
    return await findBlockByTimestamp(provider, timestamp);
  }
}

/**
 * Formats a balance string with commas in the integer part.
 * 
 * @param {bigint} balance - The balance as a BigInt.
 * @param {number} decimals - The number of decimal places for the token.
 * @returns {string} The formatted balance string with commas.
 */
function formatBalanceWithCommas(balance, decimals) {
  const formatted = ethers.formatUnits(balance, decimals);
  const [integer, fraction = ''] = formatted.split('.');
  const integerWithCommas = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${integerWithCommas}.${fraction}` : integerWithCommas;
}

/**
 * Formats a balance string without commas or separators except for decimal point.
 * Removes trailing .0 for whole numbers.
 * 
 * @param {bigint} balance - The balance as a BigInt.
 * @param {number} decimals - The number of decimal places for the token.
 * @returns {string} The plain formatted balance string.
 */
function formatBalancePlain(balance, decimals) {
  let formatted = ethers.formatUnits(balance, decimals);
  // Remove trailing .0 if present
  if (formatted.endsWith('.0')) {
    formatted = formatted.slice(0, -2);
  }
  return formatted;
}

/**
 * Main execution function of the program.
 * 
 * This function orchestrates the program's logic: it retrieves the target block number,
 * logs it, and then iterates over the provided tokens to fetch and log their balances
 * at that block for the specified wallet address.
 * 
 * For the native token (PLS), it uses the provider's getBalance method and assumes 18 decimals.
 * For ERC-20 tokens, it constructs a contract instance with the balanceOf and decimals ABI and queries it.
 * 
 * Outputs both formatted (with commas) and plain balances.
 * 
 * @returns {Promise<void>} A promise that resolves when all balances are fetched and logged.
 * @throws {Error} If any balance query fails.
 */
async function main() {
  try {
    const blockNumber = await getBlockNumber();
    console.log(`Querying balances at block: ${blockNumber}`);

    const abi = [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)'
    ];

    console.log('\nFormatted Balances (with commas):');
    for (const token of tokens) {
      const trimmedToken = token.trim();
      let balance;
      let decimals;

      if (trimmedToken === 'Pulse_Native_Gas_Token') {
        balance = await provider.getBalance(options.address, blockNumber);
        decimals = 18;
      } else {
        const contract = new ethers.Contract(trimmedToken, abi, provider);
        balance = await contract.balanceOf(options.address, { blockTag: blockNumber });
        decimals = await contract.decimals({ blockTag: blockNumber });
      }

      const formattedBalance = formatBalanceWithCommas(balance, decimals);
      console.log(`${trimmedToken}: ${formattedBalance}`);
    }

    console.log('\nPlain Balances (no commas):');
    for (const token of tokens) {
      const trimmedToken = token.trim();
      let balance;
      let decimals;

      if (trimmedToken === 'Pulse_Native_Gas_Token') {
        balance = await provider.getBalance(options.address, blockNumber);
        decimals = 18;
      } else {
        const contract = new ethers.Contract(trimmedToken, abi, provider);
        balance = await contract.balanceOf(options.address, { blockTag: blockNumber });
        decimals = await contract.decimals({ blockTag: blockNumber });
      }

      const plainBalance = formatBalancePlain(balance, decimals);
      console.log(`${trimmedToken}: ${plainBalance}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

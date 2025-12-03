/**
 * @fileoverview Node.js script to fetch the execution (withdrawal) address for PulseChain validators.
 * 
 * This script uses the g4mm4.io Beacon API to directly look up validator details by public key or index
 * and extracts the execution address from the withdrawal credentials (if set with the 0x01 prefix).
 * 
 * Installation:
 * 1. Run `npm install` to install dependencies (node-fetch for HTTP requests).
 * 2. Ensure Node.js is installed (version 18+ recommended; for older versions, node-fetch provides fetch polyfill).
 * 
 * Usage:
 * - Run via: node fetch-execution-address.js --ids=12345,0xYourPubKey1,67890
 * - --ids: Comma-separated list of validator IDs (public keys like '0xabc...' or indices like '12345') (required).
 * 
 * The script will output the execution address for each validator or indicate if it's not set.
 * 
 * Note: This is a direct lookup and does not require scanning slots, making it fast.
 * For simplicity, this uses process.argv parsing without additional dependencies.
 * For more robust CLI, consider adding 'commander' or 'yargs' as a dependency.
 */

import fetch from 'node-fetch';

async function fetchValidatorExecutionAddress(ids) {
  const BEACON_URL = 'https://rpc-pulsechain.g4mm4.io/beacon-api';

  const results = {};

  for (const id of ids) {
    try {
      const res = await fetch(`${BEACON_URL}/eth/v1/beacon/states/finalized/validators/${id}`);
      if (!res.ok) {
        throw new Error(`HTTP error! Status: ${res.status} for validator ID: ${id}`);
      }
      const data = await res.json();
      const valData = data.data;
      const withdrawalCred = valData.validator.withdrawal_credentials;
      let executionAddress = 'Not set (withdrawal credentials not configured for execution address)';
      if (withdrawalCred.startsWith('0x01')) {
        executionAddress = '0x' + withdrawalCred.slice(-40);
      }
      results[id] = executionAddress;
    } catch (error) {
      console.error(`Error fetching execution address for validator ${id}:`, error.message);
      results[id] = 'Error: ' + error.message;
    }
  }

  return results;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  args.forEach(arg => {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      params[key] = value;
    }
  });
  return params;
}

async function main() {
  const params = parseArgs();
  
  if (!params.ids) {
    console.error('Usage: node get-validator-execution-address.js --ids=12345,0xYourPubKey1,67890');
    process.exit(1);
  }
  
  const ids = params.ids.split(',');
  
  try {
    const results = await fetchValidatorExecutionAddress(ids);
    console.log('Validator Execution Addresses:');
    for (const [id, address] of Object.entries(results)) {
      console.log(`- ID ${id}: ${address}`);
    }
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

main();

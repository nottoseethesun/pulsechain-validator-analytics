/**
 * @fileoverview Client module for the PulseChain validator payments calculator.
 * 
 * This script acts as a command-line client for the getValidatorPayments function.
 * It parses user input from command-line arguments and calls the function with the provided parameters.
 * 
 * Installation:
 * - This assumes the main function is exported from './fetch-validator-payments.js' (or adjust the import path accordingly).
 * - Run via: node index.js --ids=0xKey1,12345 --start=2025-01-01 --end=2025-11-04
 * 
 * Usage:
 * - --ids: Comma-separated list of validator IDs (public keys like '0xKey1' or indices like '12345') (required).
 * - --start: Start date in YYYY-MM-DD format (required).
 * - --end: End date in YYYY-MM-DD format (required).
 * 
 * Note: For simplicity, this uses process.argv parsing without additional dependencies.
 * For more robust CLI, consider adding 'commander' or 'yargs' as a dependency.
 */

import { getValidatorPayments } from './fetch-validator-payments.js'; // Updated to ESM import

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
  
  if (!params.ids || !params.start || !params.end) {
    console.error('Usage: node index.js --ids=0xKey1,12345 --start=YYYY-MM-DD --end=YYYY-MM-DD');
    process.exit(1);
  }
  
  const ids = params.ids.split(',');
  const startDate = params.start;
  const endDate = params.end;
  
  try {
    const result = await getValidatorPayments(ids, startDate, endDate);
    console.log(JSON.stringify(result, null, 2)); // Output clean JSON results
  } catch (error) {
    console.error('Error running validator payments calculation:', error.message);
    process.exit(1);
  }
}

main();
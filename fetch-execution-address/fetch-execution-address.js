/**
 * @fileoverview Node.js script to fetch the execution (withdrawal) address for PulseChain validators.
 *
 * This script uses a beacon node's api, g4mm4.io's unless another is named, to directly look up
 * validator details by public key or index and extracts the execution address from the withdrawal
 * credentials (if set with the 0x01 prefix). The lookup is in `./execution-address.js`.
 *
 * Installation:
 * 1. Run `npm install` to install dependencies (commander, for the command line).
 * 2. Node.js 22 or later.
 *
 * Usage:
 * - Run via: node fetch-execution-address.js --ids=12345,0xYourPubKey1,67890
 * - --ids: Comma-separated list of validator IDs (public keys like '0xabc...' or indices like '12345') (required).
 * - --beacon-url: The beacon node's api, in place of g4mm4.io's.
 * - --help: Lists the options and the exit codes.
 *
 * The script will output the execution address for each validator or indicate if it's not set.
 *
 * Note: This is a direct lookup and does not require scanning slots, making it fast.
 */

import { Command, InvalidArgumentError } from "commander";
import {
  VALIDATOR_IDS_DESCRIPTION,
  validatorIdsParser,
} from "../lib/validator-ids.js";
import {
  DEFAULT_BEACON_URL,
  fetchValidatorExecutionAddress,
} from "./execution-address.js";

/** What the help says after the options. */
const HELP_AFTER = `
Exit codes:
  0  each validator's address was printed, or the error that stopped its
     lookup in its place
  1  a mistake in the arguments, or a run that failed`;

/**
 * Builds the command line.
 *
 * @returns {import('commander').Command} The command, without its action
 */
function buildCommand() {
  return new Command("fetch-execution-address")
    .description(
      "Finds the execution address of each PulseChain validator named: the address its withdrawal credentials name.",
    )
    .requiredOption(
      "--ids <ids>",
      VALIDATOR_IDS_DESCRIPTION,
      validatorIdsParser(InvalidArgumentError),
    )
    .option("--beacon-url <url>", "the beacon node's api", DEFAULT_BEACON_URL)
    .addHelpText("after", HELP_AFTER);
}

await buildCommand()
  .action(async ({ ids, beaconUrl }) => {
    try {
      const results = await fetchValidatorExecutionAddress(ids, beaconUrl);
      console.log("Validator Execution Addresses:");
      for (const [id, address] of Object.entries(results)) {
        console.log(`- ID ${id}: ${address}`);
      }
    } catch (error) {
      console.error("Fatal error:", error.message);
      process.exitCode = 1;
    }
  })
  .parseAsync(process.argv);

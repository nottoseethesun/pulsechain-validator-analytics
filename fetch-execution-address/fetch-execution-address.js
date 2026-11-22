/**
 * @fileoverview Node.js script to fetch the execution (withdrawal) address for PulseChain validators.
 *
 * This script uses a beacon node's api, g4mm4.io's unless another is named, to directly look up
 * validator details by public key or index and extracts the execution address from the withdrawal
 * credentials (if set with the 0x01 or 0x02 prefix). The lookup is in `./execution-address.js`.
 *
 * Installation:
 * 1. Run `npm ci` to install dependencies (commander, for the command line, and crypto-price-fetchers).
 * 2. Node.js 24 or later.
 *
 * Usage:
 * - Run via: node fetch-execution-address.js --ids=12345,<public-key>,67890
 * - --ids: Comma-separated list of validator IDs (public keys like '0xabc...' or indices like '12345') (required).
 * - --beacon-url: The beacon node's api, in place of g4mm4.io's.
 * - --help: Lists the options and the exit codes.
 *
 * The script will output the execution address for each validator or indicate if it's not set.
 *
 * Note: it asks the beacon node for each validator by its index or public
 * key, so it scans no slots.
 */

import { Command, InvalidArgumentError } from "commander";
import { endQuietlyWhenOutputCloses } from "crypto-price-fetchers/lib/closed-output";
import { isHttpUrl } from "crypto-price-fetchers/lib/http-url";
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
Examples:
  The execution address of one validator, by its index:
    $ node fetch-execution-address.js --ids 12345
  The addresses of two validators, one by index and one by public key,
  from a beacon node on this computer:
    $ node fetch-execution-address.js --ids 12345,<public-key> --beacon-url http://localhost:5052
  The same first lookup, through npm, from the tool's folder:
    $ npm start -- --ids 12345

Exit codes:
  0  each validator's address was printed, or the error that stopped its
     lookup in its place
  1  a mistake in the arguments, or a run that failed`;

/**
 * Checks the beacon node's url, as commander parses it.
 *
 * @param {string} value - The url typed
 * @returns {string} The url
 * @throws {InvalidArgumentError} When it is not an http or https url
 */
function beaconUrl(value) {
  if (!isHttpUrl(value))
    throw new InvalidArgumentError("Not an http or https url.");
  return value;
}

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
    .option(
      "--beacon-url <url>",
      "the beacon node's api",
      beaconUrl,
      DEFAULT_BEACON_URL,
    )
    .addHelpText("after", HELP_AFTER);
}

endQuietlyWhenOutputCloses();
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

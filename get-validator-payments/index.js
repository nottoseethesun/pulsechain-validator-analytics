/**
 * @fileoverview Client module for the PulseChain validator payments calculator.
 *
 * This script acts as a command-line client for the getValidatorPayments function.
 * It parses user input from command-line arguments, with commander, reads config.json from the
 * working directory, and calls the function with the provided parameters.
 *
 * Installation:
 * - Run `npm install` to install dependencies (commander, for the command line). Node.js 24 or later.
 * - Run via: node index.js --ids=0xKey1,12345 --start=2025-01-01 --end=2025-11-04
 *
 * Usage:
 * - --ids: Comma-separated list of validator IDs (public keys like '0xKey1' or indices like '12345') (required).
 * - --start: Start date in YYYY-MM-DD format (required, inclusive).
 * - --end: End date in YYYY-MM-DD format (required, exclusive).
 * - --help: Lists the options and the exit codes.
 *
 * See the file header documentation for file `./fetch-validator-payments.js` for more detail.
 */

import { Command, InvalidArgumentError } from "commander";
import {
  VALIDATOR_IDS_DESCRIPTION,
  validatorIdsParser,
} from "../lib/validator-ids.js";
import {
  getValidatorPayments,
  readConfig,
} from "./fetch-validator-payments.js";

/** What the help says after the options. */
const HELP_AFTER = `
The start date is counted; the end date is not. The settings are in
config.json, in the folder it runs in. See the file header of
fetch-validator-payments.js for details.

Examples:
  What two validators were paid in October 2026, by address:
    $ node index.js --ids 12345,12346 --start 2026-10-01 --end 2026-11-01
  What one validator was paid on one day:
    $ node index.js --ids 12345 --start 2026-11-20 --end 2026-11-21
  The same day, through npm, from the tool's folder:
    $ npm start -- --ids 12345 --start 2026-11-20 --end 2026-11-21

Exit codes:
  0  the totals were printed, as JSON, last
  1  a mistake in the arguments, or a run that failed`;

/**
 * Checks a date, as commander parses it.
 *
 * @param {string} value - The date typed
 * @returns {string} The date
 * @throws {InvalidArgumentError} When it is not a day in YYYY-MM-DD form
 */
function utcDate(value) {
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (!valid) throw new InvalidArgumentError("Not a day in YYYY-MM-DD form.");
  return value;
}

/**
 * Builds the command line.
 *
 * @returns {import('commander').Command} The command, without its action
 */
function buildCommand() {
  return new Command("get-validator-payments")
    .description(
      "Works out the PLS paid to PulseChain validators over a date range, by address: their consensus layer withdrawals and their execution layer priority fees.",
    )
    .requiredOption(
      "--ids <ids>",
      VALIDATOR_IDS_DESCRIPTION,
      validatorIdsParser(InvalidArgumentError),
    )
    .requiredOption(
      "--start <date>",
      "the first day counted, YYYY-MM-DD, in UTC",
      utcDate,
    )
    .requiredOption(
      "--end <date>",
      "the day the count stops before, YYYY-MM-DD, in UTC",
      utcDate,
    )
    .addHelpText("after", HELP_AFTER);
}

await buildCommand()
  .action(async ({ ids, start, end }) => {
    try {
      const result = await getValidatorPayments(ids, start, end, readConfig());
      console.log(JSON.stringify(result, null, 2)); // Output clean JSON results
    } catch (error) {
      console.error(
        "Error running validator payments calculation:",
        error.message,
      );
      process.exitCode = 1;
    }
  })
  .parseAsync(process.argv);

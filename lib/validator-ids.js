/**
 * Validators as the two tools' command lines take them: each a public key,
 * 0x and 96 hex digits, or an index, a whole number, several separated by
 * commas.
 * @module lib/validator-ids
 *
 * Each tool is a package of its own, with its own commander, so this
 * module imports none: a tool hands `validatorIdsParser` the error class
 * its commander reads as an argument's mistake.
 */

/** What the option takes, for the help. */
export const VALIDATOR_IDS_DESCRIPTION =
  "the validators, separated by commas: each a public key (0x and 96 hex digits) or an index";

/** Why a value is refused. */
const REFUSAL =
  "Each validator is a public key, 0x and 96 hex digits, or an index, a whole number, separated by commas.";

/**
 * Builds the parser of the validators option.
 *
 * @param {function(new: Error, string)} InvalidArgumentError - The error class the tool's commander reads as an argument's mistake
 * @returns {function(string): string[]} The parser: the validators typed, or the error thrown
 */
export function validatorIdsParser(InvalidArgumentError) {
  return (value) => {
    const ids = value.split(",").map((id) => id.trim());
    const valid = ids.every(
      (id) => /^0x[0-9a-fA-F]{96}$/.test(id) || /^[0-9]+$/.test(id),
    );
    if (!valid) throw new InvalidArgumentError(REFUSAL);
    return ids;
  };
}

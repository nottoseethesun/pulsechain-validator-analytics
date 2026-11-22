/**
 * The payments calculator's command line: `node bin/get-validator-payments.js`.
 * @module bin/get-validator-payments
 *
 * What: works out the PLS paid to the validators named over a date range,
 * by address, with the settings of `config.json` in the folder it runs
 * in, `get-validator-payments/` as its README says; `--help` gives its
 * options, examples and exit codes.
 *
 * How: loads `get-validator-payments/index.js`, the tool's package, which
 * sets the run to end quietly when the program reading its output stops
 * reading, then runs it with this process's arguments. This file imports
 * nothing else, so the packages `npm ci` installs in the tool's folder are
 * all it needs; the package's own imports resolve from them.
 */

import "../get-validator-payments/index.js";

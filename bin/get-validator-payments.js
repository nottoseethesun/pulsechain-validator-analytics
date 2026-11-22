/**
 * The payments calculator's command line: `node bin/get-validator-payments.js`.
 * @module bin/get-validator-payments
 *
 * What: works out the PLS paid to the validators named over a date range,
 * by address, with the settings of `config.json` in the folder it runs
 * in, `get-validator-payments/` as its README says; `--help` gives its
 * options, examples and exit codes.
 *
 * How: loading `get-validator-payments/index.js`, the tool's package, runs
 * it with this process's arguments, after the run is set to end quietly
 * when the program reading its output stops reading. The package's own
 * imports resolve from its own folder's packages.
 */

import { endQuietlyWhenOutputCloses } from "crypto-price-fetchers/lib/closed-output";

endQuietlyWhenOutputCloses();
await import("../get-validator-payments/index.js");

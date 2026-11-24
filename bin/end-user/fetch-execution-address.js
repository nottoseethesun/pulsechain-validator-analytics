/**
 * The address lookup's command line: `node bin/end-user/fetch-execution-address.js`.
 * @module bin/end-user/fetch-execution-address
 *
 * What: prints the execution address each validator's withdrawal
 * credentials name, read from a beacon node; `--help` gives its options,
 * examples and exit codes.
 *
 * How: loads `fetch-execution-address/fetch-execution-address.js`, the
 * tool's package, which sets the run to end quietly when the program
 * reading its output stops reading, then runs it with this process's
 * arguments. This file imports nothing else, so the packages `npm ci`
 * installs in the tool's folder are all it needs; the package's own
 * imports resolve from them.
 */

import "../../fetch-execution-address/fetch-execution-address.js";

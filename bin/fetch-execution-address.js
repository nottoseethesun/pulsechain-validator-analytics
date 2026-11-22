/**
 * The address lookup's command line: `node bin/fetch-execution-address.js`.
 * @module bin/fetch-execution-address
 *
 * What: prints the execution address each validator's withdrawal
 * credentials name, read from a beacon node; `--help` gives its options,
 * examples and exit codes.
 *
 * How: loading `fetch-execution-address/fetch-execution-address.js`, the
 * tool's package, runs it with this process's arguments, after the run is
 * set to end quietly when the program reading its output stops reading.
 * The package's own imports resolve from its own folder's packages.
 */

import { endQuietlyWhenOutputCloses } from "crypto-price-fetchers/lib/closed-output";

endQuietlyWhenOutputCloses();
await import("../fetch-execution-address/fetch-execution-address.js");

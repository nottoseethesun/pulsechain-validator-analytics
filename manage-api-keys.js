/**
 * The api key manager of pulsechain-validator-analytics: `npm run api-keys`.
 * @module manage-api-keys
 *
 * What: lists the api keys of the services this project's `config.json`
 * names under `apiKeys`, each saved or not, never showing their
 * characters, and asks for each one not saved, keeping it encrypted in
 * `api-keys.json` here, which git ignores. The tools ask no service that
 * takes a key today, so the list is empty; a service added to it is then
 * asked for. `npm run api-keys -- set <service>` replaces one, and
 * `check-password` is what `unlock-api-keys.sh` runs; `--help` gives the
 * rest.
 *
 * How: the manager is crypto-price-fetchers' (`api-key-store`), run with
 * this folder as the project's top folder.
 */

import { fileURLToPath } from "node:url";
import { runKeyManager } from "crypto-price-fetchers/api-key-store";
import { endQuietlyWhenOutputCloses } from "crypto-price-fetchers/lib/closed-output";

endQuietlyWhenOutputCloses();

process.exitCode = await runKeyManager(process.argv, {
  projectTop: fileURLToPath(new URL(".", import.meta.url)),
});

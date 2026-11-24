/**
 * Tests of how pulsechain-validator-analytics keeps api keys:
 * crypto-price-fetchers' key store, with the keys its tools send listed in
 * its top `config.json`, its key manager, and its copy of
 * `bin/unlock-api-keys.sh`.
 * @module test/api-keys.test
 *
 * The manager runs with a key file of its own in a temp folder, removed
 * afterwards, and no `API_KEYS_PASSWORD`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readNeededKeys } from "crypto-price-fetchers/api-key-store";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

describe("the api keys", () => {
  it("are none today, as config.json lists them: the beacon api and the rpc endpoint take no key", () => {
    assert.deepEqual(readNeededKeys(REPO_TOP), []);
  });

  it("are unlocked by a copy of crypto-price-fetchers' bin/unlock-api-keys.sh", () => {
    const store = fileURLToPath(
      import.meta.resolve("crypto-price-fetchers/api-key-store"),
    );
    const theirs = path.join(
      path.dirname(store),
      "..",
      "bin",
      "unlock-api-keys.sh",
    );
    assert.equal(
      fs.readFileSync(path.join(REPO_TOP, "bin", "unlock-api-keys.sh"), "utf8"),
      fs.readFileSync(theirs, "utf8"),
    );
  });

  it("are listed by the key manager, npm run api-keys, which says none is needed", () => {
    const folder = fs.mkdtempSync(
      path.join(os.tmpdir(), "pulsechain-validator-analytics-test-api-keys-"),
    );
    try {
      const env = {
        ...process.env,
        API_KEYS_FILE_PATH: path.join(folder, "api-keys.json"),
      };
      delete env.API_KEYS_PASSWORD;
      const ended = spawnSync(
        process.execPath,
        [path.join(REPO_TOP, "bin", "end-user", "manage-api-keys.js")],
        { env, input: "", encoding: "utf8", timeout: 15000 },
      );
      assert.equal(ended.status, 0, ended.stderr);
      assert.equal(
        ended.stdout,
        "The project's config.json lists no service, so it keeps no api key.\n",
      );
      assert.deepEqual(fs.readdirSync(folder), []);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});

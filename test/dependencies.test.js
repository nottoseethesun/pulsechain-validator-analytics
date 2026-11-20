/**
 * Tests of how pulsechain-validator-analytics installs
 * crypto-price-fetchers: from GitHub, following its main branch or its
 * latest release, with the versions tool, `npm run github-project-deps`,
 * that switches between the two.
 * @module test/dependencies.test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

/** The repo's package.json. */
const manifest = JSON.parse(
  fs.readFileSync(path.join(REPO_TOP, "package.json"), "utf8"),
);

describe("crypto-price-fetchers", () => {
  it("is installed from GitHub, following its main branch or its latest release", () => {
    assert.match(
      manifest.dependencies["crypto-price-fetchers"],
      /^github:nottoseethesun\/crypto-price-fetchers#(main|semver:\*)$/,
    );
  });

  it("gives the versions tool that npm run github-project-deps runs", () => {
    assert.equal(
      manifest.scripts["github-project-deps"],
      "github-project-deps",
    );
    const store = fileURLToPath(
      import.meta.resolve("crypto-price-fetchers/api-key-store"),
    );
    const packageTop = path.join(path.dirname(store), "..");
    assert.ok(fs.existsSync(path.join(packageTop, "github-project-deps.js")));
  });
});

/**
 * Tests of how pulsechain-validator-analytics installs
 * crypto-price-fetchers: from GitHub, following its main branch or its
 * latest release, with the versions tool, `npm run github-project-deps`,
 * that switches between the two, at the top and in each tool's package.
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

/** The two tools' package.json files, which install it too. */
const TOOL_MANIFESTS = [
  "get-validator-payments",
  "fetch-execution-address",
].map((folder) =>
  JSON.parse(
    fs.readFileSync(path.join(REPO_TOP, folder, "package.json"), "utf8"),
  ),
);

describe("crypto-price-fetchers", () => {
  it("is installed from GitHub, following its main branch or its latest release", () => {
    assert.match(
      manifest.dependencies["crypto-price-fetchers"],
      /^github:nottoseethesun\/crypto-price-fetchers#(main|semver:\*)$/,
    );
  });

  it("is installed by each tool's package too, with the same ref, so the versions tool moves all three together", () => {
    for (const tool of TOOL_MANIFESTS) {
      assert.equal(
        tool.dependencies["crypto-price-fetchers"],
        manifest.dependencies["crypto-price-fetchers"],
        tool.name,
      );
    }
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

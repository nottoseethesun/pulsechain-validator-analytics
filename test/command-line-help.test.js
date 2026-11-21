/**
 * Tests that every command line this repo runs answers `--help`, and `-h`,
 * as the repo's CLAUDE.md asks: its options, then examples of its common
 * uses, then its exit codes.
 * @module test/command-line-help.test
 *
 * The checks are crypto-price-fetchers' (`crypto-price-fetchers/lib/command-line-help`),
 * the owner's repo of code his projects share, so every repo holds its help
 * to the same rule. Each command line runs in a child process, from the
 * repo's top folder, with no way to the owner's keys; a help is printed
 * before anything is asked of the chain. `COMMAND_LINES` lists the two
 * tools, the key manager and its commands, and the bins of
 * crypto-price-fetchers the npm targets run: its versions tool, which
 * `npm run github-project-deps` runs, and `run-actionlint`, which the lint
 * and `npm run audit:actionlint` run. A second test
 * holds the list to the repo, the tools' own packages included, so a
 * command line added later is held to the rule too.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  filesRunBy,
  filesUsingCommander,
  helpIntoClosedPipe,
  helpOf,
  helpProblems,
} from "crypto-price-fetchers/lib/command-line-help";

/** The repo's top folder. */
const REPO_TOP = fileURLToPath(new URL("..", import.meta.url));

/** crypto-price-fetchers' bins, by name, each with the file it runs, from its package.json. */
const DEPENDENCY_BINS = Object.freeze(
  Object.fromEntries(
    Object.entries(
      JSON.parse(
        fs.readFileSync(
          path.join(
            REPO_TOP,
            "node_modules/crypto-price-fetchers/package.json",
          ),
          "utf8",
        ),
      ).bin,
    ).map(([name, file]) => [
      name,
      `node_modules/crypto-price-fetchers/${file}`,
    ]),
  ),
);

/**
 * Every command line: the file node runs, and the subcommand, if any, whose
 * help is asked for.
 */
const COMMAND_LINES = Object.freeze([
  { file: "fetch-execution-address/fetch-execution-address.js", command: [] },
  { file: "get-validator-payments/index.js", command: [] },
  { file: "manage-api-keys.js", command: [] },
  { file: "manage-api-keys.js", command: ["set"] },
  { file: "manage-api-keys.js", command: ["check-password"] },
  { file: DEPENDENCY_BINS["github-project-deps"], command: [] },
  { file: DEPENDENCY_BINS["run-actionlint"], command: [] },
]);

describe("every command line's help", () => {
  for (const commandLine of COMMAND_LINES) {
    const name = [commandLine.file, ...commandLine.command].join(" ");
    it(`${name} answers --help with its options, examples of its uses and its exit codes, and -h with the same`, () => {
      const help = helpOf(REPO_TOP, commandLine, "--help");
      assert.deepEqual(helpProblems(help), []);
      assert.deepEqual(helpOf(REPO_TOP, commandLine, "-h"), help);
    });
  }
});

describe("every command line's help into a closed pipe", () => {
  for (const commandLine of COMMAND_LINES) {
    const name = [commandLine.file, ...commandLine.command].join(" ");
    it(`${name} ends quietly, with exit code 0, when the program reading its help has closed the pipe`, async () => {
      assert.deepEqual(await helpIntoClosedPipe(REPO_TOP, commandLine), {
        status: 0,
        stderr: "",
      });
    });
  }
});

describe("the list of command lines", () => {
  it("holds every file an npm target runs, every bin it runs, and every file that declares a command with commander", () => {
    const listed = new Set(COMMAND_LINES.map(({ file }) => file));
    for (const file of [
      ...filesRunBy(REPO_TOP, "."),
      ...filesRunBy(REPO_TOP, "fetch-execution-address"),
      ...filesRunBy(REPO_TOP, "get-validator-payments"),
    ]) {
      assert.ok(listed.has(path.posix.normalize(file)), `${file} is listed`);
    }
    const scripts = JSON.parse(
      fs.readFileSync(path.join(REPO_TOP, "package.json"), "utf8"),
    ).scripts;
    for (const script of Object.values(scripts)) {
      for (const command of script.split("&&")) {
        const name = command.trim().split(" ")[0];
        const bin = Object.hasOwn(DEPENDENCY_BINS, name)
          ? DEPENDENCY_BINS[name]
          : undefined;
        assert.ok(bin === undefined || listed.has(bin), `${name} is listed`);
      }
    }
    for (const file of filesUsingCommander(REPO_TOP)) {
      assert.ok(listed.has(file), `${file} declares a command; list it`);
    }
  });
});

# pulsechain-validator-analytics — `npm` Project Commands

Every command of pulsechain-validator-analytics, the owner's tools for
questions about PulseChain validators, that npm, the package manager of
Node, the program that runs JavaScript outside a browser, runs from a
`package.json`: those its top `package.json` defines, which run from the
repo's top folder, and those of the two tools' packages, which run in each
tool's folder; with what each does and what to type. Two of the top folder's
commands run tools of crypto-price-fetchers, the owner's repo of code his
projects share, which this repo installs from GitHub, the website that hosts
his code: `api-keys`, its key manager, which saves and lists the api keys,
and `github-project-deps`, its versions tool, which moves
crypto-price-fetchers to its newest main or its latest release.

Each command runs on both major versions of Node the repo supports: the
newest LTS (long-term support) version, today 26, and the version two
majors before it, today 24.

Companion to [`docs/engineering.md`](engineering.md), which covers how the
gates work. This file covers how to drive them.

---

## Table of Contents

- [Passing Flags](#passing-flags)
- [Api Keys](#api-keys)
- [Dependency Versions](#dependency-versions)
- [Developer Tools](#developer-tools)
- [Test](#test)
- [Commands That Are Usually Not Run Alone](#commands-that-are-usually-not-run-alone)
- [The Tools' Own Packages](#the-tools-own-packages)
- [See Also](#see-also)

---

## Passing Flags

Run with `npm run <name>`; `start` and `test` also work without `run`.
Flags go after a `--` separator, which tells npm the rest belongs to the
script, as in these two commands: the first, in the top folder, runs the
tests whose names hold `getValidatorPayments` ([Test](#test)), and the
second, in `get-validator-payments/`, runs the payments calculator
([The Tools' Own Packages](#the-tools-own-packages)):

```sh
npm test -- --test-name-pattern="getValidatorPayments"
npm start -- --ids=12345 --start=2026-01-01 --end=2026-02-01
```

A command that runs one of the repo's command lines passes `--help` on to
it, which then lists its options, examples of its common uses and its exit
codes: `npm start -- --help`, in a tool's folder.

---

## Api Keys

The tools send no api key today, but the repo has the key manager, which saves and lists the api keys, ready,
should a service that takes one be added.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `api-keys` | `set <service>`, `check-password`, `--help` | The key manager, crypto-price-fetchers'. Lists each key the top `config.json` names, saved or not, never showing a key's characters, and asks for each one not saved. It names none today. | `npm run api-keys` |

---

## Dependency Versions

crypto-price-fetchers is installed from GitHub, at the commit
`package-lock.json` keeps. One command, entirely optional, moves it.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `github-project-deps` | `main` or `release`; `--help` | crypto-price-fetchers' versions tool. Sets every dependency installed from GitHub to its project's main branch (`#main`) or latest release (`#semver:*`), then makes `package-lock.json` again from a fresh `node_modules`, so the newest commit of main, or the newest release, is installed. When the install fails, it puts `package.json` and `package-lock.json` back and installs `node_modules` again from them. | `npm run github-project-deps -- main` |

---

## Developer Tools

These commands check or fix the form of the code: `lint` runs the checks,
and `format` and `lint:fix` make the fixes the tools can make.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `format` | — | The write pass of Prettier, the package that formats code, over every JavaScript, JSON and YAML file. | `npm run format` |
| `knip:files` | — | The dead-code check: fails on any file nothing reaches. `lint` runs it. | `npm run knip:files` |
| `lint` | — | The linters: ESLint, which checks JavaScript against rules; markdownlint, which checks the form of Markdown files; Prettier in check mode; actionlint, which checks the GitHub Actions workflow files, run from its official release by crypto-price-fetchers' bin `run-actionlint`, which checks the release's SHA-256; and knip's check for files nothing uses. husky, the package that runs scripts at the hooks of git, the version-control program, runs it before each commit. | `npm run lint` |
| `lint:fix` | — | ESLint and markdownlint with their fixes, then `format`. | `npm run lint:fix` |

---

## Test

These commands run the gates: the tests and the audits. `check` runs all of
them, after the lint, and must pass before a commit and a push.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `audit:actionlint` | `--help` | Runs `run-actionlint --check`, a bin of crypto-price-fetchers: downloads every archive of the release of actionlint, the checker of GitHub Actions workflow files, that `lint` runs, and fails when one cannot be downloaded or its SHA-256 differs from the one crypto-price-fetchers pins; npm audit does not cover actionlint, which is no npm package. `audit:deps` runs it. | `npm run audit:actionlint` |
| `audit:deps` | — | `npm audit`, npm's check of the installed packages against known vulnerabilities, at the `high` threshold over the packages that ship (`--omit=dev`): the repo's and each tool's; then `audit:actionlint`. | `npm run audit:deps` |
| `audit:secrets` | — | secretlint, which looks for keys and credentials in files, across the repo. | `npm run audit:secrets` |
| `audit:security` | — | The security lint, `eslint-security.config.js`: the rules of eslint-plugin-security, against code open to attack, of eslint-plugin-no-secrets, against strings that look like keys, and crypto-price-fetchers' `no-secret-logging`, against printing a name that may hold a secret. | `npm run audit:security` |
| `check` | — | The full gate: `lint`, `test:coverage`, `audit:deps` (with `audit:actionlint`), `audit:security` and `audit:secrets`, in that order, stopping at the first that fails. | `npm run check` |
| `format:check` | — | Prettier in check mode; fails rather than rewriting. | `npm run format:check` |
| `test` | any `node --test` flag | The tests, on Node's test runner. | `npm test -- --test-name-pattern="executionAddressOf"` |
| `test:coverage` | — | The same tests with coverage, failing below 80% of lines covered. | `npm run test:coverage` |

---

## Commands That Are Usually Not Run Alone

npm runs this command itself, after another one.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `prepare` | — | Runs after `npm install`; installs the husky hooks. | automatic |

---

## The Tools' Own Packages

Each tool has a package of its own: run `npm install` in its folder before
using it.

| Folder | Command | Description | Example |
| ------ | ------- | ----------- | ------- |
| `fetch-execution-address/` | `start` | Look up validators' execution addresses. `npm start -- --help` lists the options, with examples and the exit codes. | `npm start -- --ids=12345` |
| `get-validator-payments/` | `start` | Work out validators' payments over a date range, reading `config.json` in that folder. `npm start -- --help` lists the options, with examples and the exit codes. | `npm start -- --ids=12345 --start=2026-01-01 --end=2026-02-01` |

---

## See Also

- [`docs/engineering.md`](engineering.md) — the gates, the tests and CI,
  the checks GitHub Actions runs at each push.
- [`docs/architecture.md`](architecture.md) — how the tools work.
- [LP Ranger's `docs/claude/CLAUDE-CI.md`](https://github.com/nottoseethesun/lp-ranger/blob/main/docs/claude/CLAUDE-CI.md)
  — the merge protocol of LP Ranger, the owner's bot that manages his 9mm V3
  liquidity positions, which these gates feed.

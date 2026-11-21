# pulsechain-validator-analytics — `npm` Project Commands

Every npm command of pulsechain-validator-analytics, the owner's tools
for questions about PulseChain validators: those its top `package.json`
defines, which run from the repo's top folder, and those of the two
tools' packages, which run in each tool's folder; with what each does and
what to type. Two of the top folder's commands run tools of
crypto-price-fetchers, the owner's repo of code his projects share, which this
repo installs from GitHub: `api-keys` and `github-project-deps`.

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

---

## Api Keys

The tools send no api key today, but the repo has the key manager ready,
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
| `format` | — | Prettier's write pass over every JavaScript, JSON and YAML file. | `npm run format` |
| `knip:files` | — | The dead-code check: fails on any file nothing reaches. `lint` runs it. | `npm run knip:files` |
| `lint` | — | The linters: ESLint, markdownlint, Prettier in check mode, actionlint, and knip's unused files. husky, the package that runs scripts at git's hooks, runs it before each commit. | `npm run lint` |
| `lint:fix` | — | ESLint and markdownlint with their fixes, then `format`. | `npm run lint:fix` |

---

## Test

These commands run the gates: the tests and the audits. `check` runs all of
them, after the lint, and must pass before a commit and a push.

| Command | Flags | Description | Example |
| ------- | ----- | ----------- | ------- |
| `audit:deps` | — | `npm audit` at the `high` threshold over the packages that ship (`--omit=dev`): the repo's and each tool's. | `npm run audit:deps` |
| `audit:secrets` | — | secretlint across the repo. | `npm run audit:secrets` |
| `audit:security` | — | The security lint, `eslint-security.config.js`: eslint-plugin-security, eslint-plugin-no-secrets and `no-secret-logging`. | `npm run audit:security` |
| `check` | — | The full gate: `lint`, `test:coverage` and the three audits, in that order, stopping at the first that fails. | `npm run check` |
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
| `fetch-execution-address/` | `start` | Look up validators' execution addresses. `npm start -- --help` lists the options. | `npm start -- --ids=12345` |
| `get-validator-payments/` | `start` | Work out validators' payments over a date range, reading `config.json` in that folder. `npm start -- --help` lists the options. | `npm start -- --ids=12345 --start=2026-01-01 --end=2026-02-01` |

---

## See Also

- [`docs/engineering.md`](engineering.md) — the gates, the tests and CI.
- [`docs/architecture.md`](architecture.md) — how the tools work.
- [LP Ranger's `docs/claude/CLAUDE-CI.md`](https://github.com/nottoseethesun/lp-ranger/blob/main/docs/claude/CLAUDE-CI.md)
  — the merge protocol these gates feed.

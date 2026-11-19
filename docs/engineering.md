# pulsechain-validator-analytics — Engineering Reference

The files the tools read, the gates every change passes, the tests, and CI.
For how the tools work, see [`docs/architecture.md`](architecture.md); for
every npm command, see [`docs/npm-project-commands.md`](npm-project-commands.md).

The repo follows LP Ranger's coding standards: its `CLAUDE.md` and
`docs/claude/`, in
[nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger).

---

## Table of Contents

- [Quick Start](#quick-start)
- [Files on Disk](#files-on-disk)
- [The Gate: `npm run check`](#the-gate-npm-run-check)
- [Lint](#lint)
- [Tests](#tests)
- [Security Audits](#security-audits)
- [Dead Code Detection](#dead-code-detection)
- [CI and Branch Protection](#ci-and-branch-protection)
- [Known Bugs](#known-bugs)

---

## Quick Start

Node 22 or later. From the repo's top folder:

```bash
npm ci
npm ci --prefix fetch-execution-address
npm ci --prefix get-validator-payments
npm run check
```

`npm ci` installs crypto-price-fetchers too, from GitHub, at the commit
`package.json` pins: no other step installs it.

---

## Files on Disk

| File | In git | What it holds |
| ---- | ------ | ------------- |
| `config.json` | yes | The services whose keys the programs send, under `apiKeys`: none today. |
| `api-keys.json` | no | Api keys, encrypted with the owner's password, should a service that takes one be added. |
| `get-validator-payments/config.json` | yes | The payments calculator's settings, read from the folder it runs in. |
| `coverage/` | no | A test run's coverage report. |

---

## The Gate: `npm run check`

`npm run check` runs every gate, in order, and stops at the first that
fails: the lint, the tests with coverage, then the three security audits.
It must pass before every commit and push, and CI runs it on Node 22 and
Node 24.

---

## Lint

`npm run lint` runs:

| Tool | Configured in | What it holds the repo to |
| ---- | ------------- | ------------------------- |
| ESLint | `eslint.config.js` | LP Ranger's rules, with no warning allowed: cyclomatic complexity ≤ 17, ≤ 500 lines of code a file (blank lines and comments not counted), lines ≤ 80 characters but strings, urls and comments, `===`, no unused name, no `var`, `const` where nothing is reassigned, no `Math.random`, no comment that tells Prettier to skip code, and every import resolved. |
| markdownlint | `.markdownlint-cli2.jsonc` | LP Ranger's settings, over every Markdown file. |
| Prettier | `.prettierrc`, `.prettierignore` | Its formatting, in check mode, over every JavaScript, JSON and YAML file. |
| actionlint | — | The GitHub workflows. |
| knip | `knip.json` | No file nothing reaches. See [Dead Code Detection](#dead-code-detection). |

The lint covers both tools, whose imports resolve once their own packages
are installed. The husky pre-commit hook (`.husky/pre-commit`) runs
`npm run lint`, which `prepare` installs; `npm run format` or
`npm run lint:fix` fixes formatting. No rule is ever switched off in a
file, no file is left out of the lint, and a file over 500 lines is split,
not excused.

---

## Tests

The tests are in `test/`, on Node's test runner. They ask nothing outside
the computer: the tools run against a stand-in beacon node and rpc
endpoint, served on a local port.

| Test | What it covers |
| ---- | -------------- |
| `execution-address.test.js` | Reading an address from withdrawal credentials, and the lookup, by index or public key, an error in place of an address. |
| `validator-payments.test.js` | The payments calculator: withdrawals by address less a full exit's principal, tips by fee recipient, a legacy transaction's among them, validators by index or public key, the slots asked, the end day left out, a slot with no block, a request tried again, a run that fails on a validator, block or receipt it cannot read, and its refusals. |
| `command-lines.test.js` | Both command lines, run as their owner runs them: their help, their output, their refusals and their exit codes. |
| `api-keys.test.js` | The keys `config.json` lists, none today, the key manager, the copy of `unlock-api-keys.sh`, and the pin of crypto-price-fetchers. |

`test/helpers/` holds the stand-ins:

- `stand-in-pulsechain.js` serves a beacon api, its genesis time,
  validators and blocks, and an rpc endpoint, its execution blocks and
  receipts, from what a test gives, and fails a path as many times as the
  test says.
- `payments-chain.js` builds the chain the payments tests share: a day of
  hour-long slots, the tests' validator and another, and blocks that pay
  nothing unless a test says otherwise; and the settings a run against it
  takes, retries a millisecond apart.
- `known-bug.js` declares a known-bug test.

`npm run test:coverage` fails below 80% of lines covered. Code written to
check something goes into the tests, so it is kept and run again rather
than written again.

---

## Security Audits

| Command | What it runs | What it catches |
| ------- | ------------ | --------------- |
| `npm run audit:deps` | `npm audit --audit-level=high --omit=dev`, for the repo and each tool | Known vulnerabilities, of high severity or worse, in the packages that ship. |
| `npm run audit:security` | ESLint with `eslint-security.config.js` | Code open to attack (eslint-plugin-security), strings that look like keys (eslint-plugin-no-secrets), and printing a name that may hold a secret (`no-secret-logging`, from crypto-price-fetchers). |
| `npm run audit:secrets` | secretlint, with `.secretlintrc.json` and `.secretlintignore` | Keys and credentials in any file. |

The security lint follows LP Ranger's: no warning allowed, with
`detect-non-literal-fs-filename` and `detect-object-injection` off.

---

## Dead Code Detection

`npm run knip:files` fails on any file nothing reaches, as in LP Ranger.
`knip.json` names the entry points knip cannot find for itself: the two
command lines, the security config and the tests. Unused exports are not
gated.

---

## CI and Branch Protection

Two workflows run on every push to `main`, every pull request to `main`, and
by hand:

| Workflow | Job | Runs |
| -------- | --- | ---- |
| `ci.yml` | Check (Node 22), Check (Node 24) | `npm run check`, after installing the repo's packages and each tool's. |
| `security-audit.yml` | Dependency Audit, Security Lint, Secret Scan | Each audit as a job of its own. |

`main` is protected: a change reaches it only by a pull request whose five
checks, those five jobs, have passed. Force pushes and deletion are
refused. Merges are merge commits, never squashed, and no branch is
deleted. The steps from a branch to `main` are LP Ranger's eight, in its
`docs/claude/CLAUDE-CI.md`.

---

## Known Bugs

None is known. A bug found gets a test in `test/known-bugs.test.js`,
declared with `knownBug` (`test/helpers/known-bug.js`), so the test passes
while the bug is present. The bug's fix makes its test fail; the same change
declares the test with `it`, among the tests of the code it is about.

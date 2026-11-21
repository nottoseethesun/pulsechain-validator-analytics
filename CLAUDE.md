# pulsechain-validator-analytics — notes for Claude

## Conventions

Follow the coding standards of LP Ranger, the owner's bot that manages his
9mm V3 liquidity positions: its `CLAUDE.md` and everything under
`docs/claude/`, in [nottoseethesun/lp-ranger](https://github.com/nottoseethesun/lp-ranger)
or the local clone at `~/code/lp-ranger/github-repo/lp-ranger/`. Read them, and
never change anything in LP Ranger.

Work in this repo, never in a copy of it. Code written to check something goes
into the tests, so that later sessions reuse it instead of writing it again.

**Never show any character of an api key once it is entered**: not in a
reply, a log line, an error message, a test's output, or a listing.

## The tools

`fetch-execution-address/` and `get-validator-payments/` are each a package
of their own, with its own `package.json`: a command line, declared with
commander, the package that reads a command line's options, beside the
module that does its work, which the tests run
directly. `lib/validator-ids.js` checks the validators both take. The
payments calculator's settings are its `config.json`, which the command line
reads from the folder it runs in and hands the calculator; the module reads
nothing as it loads.

## Keys

The tools send no api key today. Should they come to, the key is kept as the
key store of crypto-price-fetchers, the owner's repo of code his projects
share, which this repo installs (below), keeps keys
(`crypto-price-fetchers/api-key-store`): the service is listed in the top
`config.json` under `apiKeys`, `npm run api-keys` runs the manager
(`manage-api-keys.js`), and `source ./unlock-api-keys.sh`, a script at the
repo's top, keeps the password for a terminal. `unlock-api-keys.sh` is a
copy of crypto-price-fetchers', which a test holds it to; a change to it is
made there. A key is never a setting in a file git keeps, nor a command-line
argument.

## crypto-price-fetchers

The top `package.json` installs crypto-price-fetchers from GitHub,
following its main branch (`#main`); `package-lock.json` keeps the commit
installed. crypto-price-fetchers' versions tool, which this repo runs as
`npm run github-project-deps -- main|release`, sets the ref to `#main` or
`#semver:*` (the latest release) and makes the lockfile again; the tool
lives there, and this repo keeps no copy. `test/dependencies.test.js`
holds both to that.

## Docs

`docs/architecture.md` says how the tools work, `docs/engineering.md`
covers the files, the gates, the tests and CI, and
`docs/npm-project-commands.md` lists every npm command, as LP Ranger's
`docs/` does. A change keeps them true.

Every doc passes the owner's documentation audit: it tells no story of an
old bug, leads every topic and sub-topic with the context it needs,
introduces each tool where it first names it, explains with facts rather
than adjectives, and leaves out no step in the logic of an explanation. A
tool is anything a reader runs or a program uses: an `npm run` command, a
bin, a script, a package or an outside service. Its introduction starts
from the big picture, gives a few words of context or a scenario where the
tool is used, says which codebase it comes from, and says what it does in
precise words.

## Command lines

Every command line in this repo answers `--help`, and `-h`, with all it
takes and how to use it: each option and argument with what it does, then
examples of its common uses, each a full command and what it does, and its
exit codes. An npm target that runs one passes the flag through, as
`npm run <target> -- --help`. Each is declared with commander, the package
that parses command lines, so the options its help lists come from the
declaration the program parses; the examples and exit codes go in the
help's closing text (`addHelpText("after", …)`).
`docs/npm-project-commands.md` lists every npm target, including those
that run other tools, such as `lint` and `check`, with its flags and an
example. LP Ranger's rules do not yet ask for the examples; this repo does.

## Gates and CI

`npm run check` is the one gate, LP Ranger's: the lint (ESLint with LP
Ranger's rules, markdownlint, Prettier, actionlint, knip's unused files),
the tests with at least 80% of lines covered, and the security audits (npm
audit for the three packages, the security lint in
`eslint-security.config.js` with crypto-price-fetchers' `no-secret-logging`,
secretlint). It must pass before a commit and a push; husky, the package
that runs scripts at git's hooks, runs `npm run lint` before each commit.
CI runs `npm run check` on Node 22 and 24
(`ci.yml`) and each audit as a job of its own (`security-audit.yml`), after
installing the three packages. `main` is protected: those five checks must
pass on a pull request, never squashed, and no branch is deleted. LP
Ranger's eight steps in `docs/claude/CLAUDE-CI.md` take a change to `main`.

## Tests

The tests are in `test/`, on Node's own test runner, and ask nothing outside
the computer: the tools run against a stand-in beacon node and rpc endpoint
served locally (`test/helpers/stand-in-pulsechain.js`).
`docs/engineering.md` lists them.

```bash
npm ci
npm ci --prefix fetch-execution-address
npm ci --prefix get-validator-payments
npm run check
```

## Known bugs

None is known. When one is found, it gets a test in
`test/known-bugs.test.js`, declared with `knownBug`
(`test/helpers/known-bug.js`), so the test passes while the bug is present.
The bug's fix makes its test fail; declare that test with `it` instead, in
the same change, among the tests of the code it is about.

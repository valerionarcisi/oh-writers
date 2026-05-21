# CI is red — what now?

Reach for this when the QA workflow fails on GitHub. Aim: back to green in <10 min.

## Triage in order

1. **Get the failing logs**

   ```sh
   gh run list --limit 5
   gh run view <RUN_ID> --log-failed | tail -200
   ```

2. **If the E2E job is the one that failed — download the Playwright report**

   ```sh
   gh run download <RUN_ID> -n playwright-report -D /tmp/pw-report
   open /tmp/pw-report/index.html
   ```

3. **Reproduce locally**
   ```sh
   pnpm dev:up        # if postgres is not running
   pnpm ci:repro      # <90s, byte-for-byte mirror of e2e-mock
   ```
   `ci:repro` green + CI red ⇒ environment drift (Node minor, runner OS, glibc, fonts).
   Escalate, do not patch blindly.

## Known failure patterns (the 9 already paid for, 2026-05-21)

| Symptom in CI log                                            | Likely cause                                            | Fix                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Cannot resolve 'postgres'` / `async_hooks` in client bundle | Server driver bundled in client                         | Add a stub in `apps/web/src/shims/` and map it in `apps/web/app.config.ts`                      |
| `relation "public.user" does not exist`                      | Migration references singular table                     | Use `public.users`                                                                              |
| `relation "document_versions" already exists`                | Two migrations create the same table                    | Consolidate into one or guard with `CREATE TABLE IF NOT EXISTS`                                 |
| `column ... does not exist` only on fresh DB                 | Migration `ALTER`s a table created by a later migration | Re-order: rename `.sql` to earlier index AND update `_journal.json.when`                        |
| Migration file silently skipped                              | `.sql` not registered in `_journal.json`                | `pnpm check:migrations` catches this — add `{idx, when, tag, breakpoints:true}` entry           |
| `pnpm: unknown command "--project=mock-ui"`                  | pnpm 10 forwards `--` literally to the script           | Drop the `--`: `pnpm test:e2e --project=mock-ui`                                                |
| Playwright `webServer timed out after 60000ms`               | Cold-start exceeds 60s on GitHub runners                | Bump `playwright.config.ts` → `webServer.timeout` to 180_000                                    |
| `Cannot find module '@oh-writers/db'` / missing dist         | Workspace package not built before E2E                  | Ensure `pnpm --filter './packages/*' build` runs before `playwright test` (already in `qa.yml`) |
| Input field empty after `fill()` (no user message in log)    | React controlled-input bypassed by single change event  | Use `locator.pressSequentially(value, { delay: 0 })`                                            |

## Useful one-liners

- `gh run watch <RUN_ID>` — stream the run in your terminal instead of waiting on the browser.
- `gh run view <RUN_ID> --json conclusion,jobs -q '.jobs[] | "\(.conclusion // .status): \(.name)"'` — per-job status without scrolling HTML.
- `gh api repos/{owner}/{repo}/check-runs/<JOB_ID>/annotations` — surface inline error annotations.

## When ci:repro itself is wrong

Drift between `qa.yml` and `ci-repro.sh`:

```sh
diff <(grep -E '^\s+- (run|name):' .github/workflows/qa.yml) scripts/ci-repro.sh
```

Reconcile the script with the workflow and commit the fix in the same PR.

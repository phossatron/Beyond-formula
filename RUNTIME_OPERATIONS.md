# Beyond Formula local runtime operations

## Runtime governance (mandatory)

GitHub is the source of truth for all application changes. Every production
version must trace to an approved task or issue, commit, pull request, review,
release or artifact, deployment record, health check, and rollback target.

Codex is the development agent. It may change application source only within an
approved task scope on a feature branch and must provide tests, impact analysis,
and rollback guidance. Codex must not final-approve its own critical change,
deploy production, access production secrets or unmasked production data, or
bypass pull-request and review controls.

Hermes is the read-only governance monitor by default. The Runtime / Platform
Operator is the separate authority permitted to deploy, health-check, and roll
back an approved release. The operator must not edit application source,
user-interface behavior, business logic, database schema, data structure,
permissions, or dependencies directly on the runtime.
Critical changes require independent approval from CODEOWNER `@phossatron` (or
a formally delegated System Owner reviewer); the change author cannot provide
the final approval.

The application currently consists of `index.html` and is served unchanged as a
static site. Runtime files in `runtime/` do not alter its contents or behavior.

## Selected local deployment

| Approach | Advantages | Trade-offs | Assessment |
| --- | --- | --- | --- |
| **launchd + Python standard-library HTTP server (selected)** | No app build or package dependency; starts after login/restarts automatically; binds to localhost only; simple logs and health probe | Requires macOS/Python 3 on this iMac; intended for this host only | 92/100 |
| Docker static-server container | Reproducible container boundary; straightforward port mapping | Requires Docker Desktop to remain running and pulls/maintains an image for a one-file static app | 86/100 |
| Vercel production deployment | Already integrated with `main`; managed HTTPS availability | Not a local iMac runtime; depends on external service/network and is outside the requested local operating boundary | 83/100 |

The selected service listens only at `http://127.0.0.1:4173/`. It needs no AI
service and application functionality continues independently of Codex or any
AI limit.

## Start and verify

From the repository root, run once after a fresh checkout or after changing the
runtime configuration:

```sh
./runtime/install-local-runtime.sh
./runtime/healthcheck.sh
```

Open `http://127.0.0.1:4173/` on the iMac. The LaunchAgent label is
`com.beyond-formula.runtime`; it is configured to restart on failure and writes
its stdout/stderr to `runtime/logs/` (logs are intentionally untracked).

To stop it temporarily:

```sh
launchctl bootout "gui/$(id -u)/com.beyond-formula.runtime"
```

To start it again, run the install script.

## Controlled update

Only the authorized Runtime / Platform Operator may run an update after the
approved commit has passed the required GitHub PR, review, and checks. The
runtime working tree must be clean. If local changes exist, the operator must
stop and escalate them to the development owner; the operator must not commit,
discard, or deploy those changes. Then:

```sh
./runtime/deploy-approved-main.sh
./runtime/healthcheck.sh
```

For an Auth/RLS release, the Supabase Owner must first complete the reviewed
schema and staging gates in `supabase/AUTH_RLS_RUNBOOK.md`. The Runtime Operator
must not run SQL or use Supabase credentials while deploying the static app.

The script refuses a dirty working tree, fetches `origin/main`, fast-forwards
only (never creates a merge commit), restarts the service, and prints the
deployed commit. It therefore cannot replace local source with an uncommitted
version.

## Rollback and restore support

To roll back to a known developer commit, first record the current commit and
then run:

```sh
git rev-parse HEAD
./runtime/rollback-to-commit.sh <approved-commit-sha>
./runtime/healthcheck.sh
```

Rollback uses only a commit already present in `origin` and leaves the checkout
detached at that exact version. To return to the approved `main`, run the
controlled update script. Browser data is stored in browser `localStorage` (and
optionally the existing Supabase setup), not in this static runtime; this
runtime neither mutates nor backs up application data. Use the browser/Supabase
owner's established export/backup process before restoring data.

## Operator checks

```sh
tail -n 100 runtime/logs/runtime-error.log
launchctl print "gui/$(id -u)/com.beyond-formula.runtime"
git status --short
```

If the health check fails, inspect the error log and verify port 4173 is not
occupied with `lsof -nP -iTCP:4173 -sTCP:LISTEN`. Do not repair failures by
editing application files; escalate an application defect to the development
team with the deployed commit and relevant log output.

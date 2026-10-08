# Debug log

## 2026-10-07 — PR #13: retired Vercel integration requests deployment authorization

Status: diagnosis verified; hosting configuration remediation pending owner action.
Task: user-reported PR #13 check failure; no separate Task/Issue ID assigned.
Scope: read-only GitHub metadata and repository documentation; documentation changes only.
Environment/data: development worktree; public repository/check metadata, no production credentials or business data.
Owner/reviewer: repository/project owner, `@phossatron`; hosting changes require the accountable platform operator.

### Reproduction and evidence

PR: https://github.com/phossatron/Beyond-formula/pull/13
Application commit inspected: `c6ad98102f231d84e1e5d5a5ca483ed207c0e42a`.

```sh
gh pr view 13 --repo phossatron/Beyond-formula \
  --json headRefOid,mergeable,mergeStateStatus,reviews,statusCheckRollup
gh api repos/phossatron/Beyond-formula/commits/c6ad98102f231d84e1e5d5a5ca483ed207c0e42a/status \
  --jq '{state,statuses:[.statuses[]|{context,state,description}]}'
gh api repos/phossatron/Beyond-formula/branches/main --jq '{name,protected}'
gh api repos/phossatron/Beyond-formula/rules/branches/main --jq '[.[]|{type,parameters}]'
```

- The only reported check is `Vercel`, state `failure`, description `Authorization required to deploy.` Its target is the Vercel fork-deployment authorization flow; the full opaque job URL is omitted here.
- GitHub reports `MERGEABLE`, merge state `UNSTABLE`, and no reviews. There is no merge conflict.
- Read-only branch metadata reports `protected: false` and applicable rules `[]`. This does not establish Vercel as a required merge check; the project's human review/release governance still applies.
- `README.md` (deployment section) says Formula is served by the company runtime, does not use Vercel, and merging `main` does not deploy production.
- Commit `57c0807ad39230eb67b057d1b8fafb96a9faec0e` removed `vercel.json`. Its message explicitly says removing the file does not stop the Vercel project and that its Git integration needs separate removal. Commit `7b7f5e6` documented the company-runtime deployment route.
- The application verification already recorded for this PR is 21 focused tests passing. These local results are not GitHub CI statuses. This Vercel check contains no evidence of an application test failure.

### Cause and limits

The retired Vercel project still reacts to this repository's PRs. Vercel requires owner/team authorization before deploying a PR from a fork. The failure is at deployment authorization, before any preview deployment, rather than an observed failure of the inactivity rule.

This conclusion is supported by the check description, authorization target, and repository deployment history. The Vercel project settings were not accessed; the precise account/project configuration still needs owner confirmation.

Official references:

- [Vercel for GitHub — fork deployment authorizations](https://vercel.com/docs/git/vercel-for-github)
- [Vercel Git settings — disconnecting a repository](https://vercel.com/docs/project-configuration/git-settings)

### Remediation and verification

No application fix or hosting configuration change was applied for this incident. No regression test was added: the failure is an external authorization/configuration condition, not a reproduced application defect. Documentation validation: `git diff --check`.

Proposed owner action, consistent with the repository's existing deployment decision:

1. Identify the retired Formula project in the Vercel dashboard and confirm it has no required active preview use.
2. Open that project's **Settings → Git → Connected Git Repository → Disconnect**. Scope the action to that retired project; do not remove unrelated projects or organization integrations.
3. Inspect PR #13's latest status and confirm new commits no longer cause this retired project to request deployment. Historical failure statuses may remain; disconnecting does not prove that an existing status is rewritten.
4. Complete independent review and the approved company-runtime release/UAT workflow. Do not approve a Vercel preview, disable fork protection, fabricate a green status, or bypass human review to clear the red indicator.

Security/database/permission/dependency impact of this documentation change: none. Production runtime, IAM, secrets, branch protection and source behavior were unchanged.
Rollback: revert this documentation commit; no business-data restore is required. Any hosting configuration change needs its own owner-approved rollback plan.
Residual risk: Vercel check remains unresolved until owner configuration action and verification; no merge or production deployment was performed.

# Formula ↔ OPC user directory adapter

Formula resolves the signed-in user's identity against the read-only OPC
Workflow directory. Formula keeps its existing authentication and role
boundary; OPC is used only as the identity reference for this rollout.

The browser calls the same-origin `/api/opc-user-directory` function. That
function verifies the Formula session, then calls OPC with the machine token.
The OPC token is never sent to or stored in the browser.

## Staging configuration

Configure these variables in the Formula deployment environment. Do not place
their values in `index.html`, a test fixture, or a repository file.

```text
FORMULA_AUTH_USER_URL=https://<formula-auth-host>/auth/v1/user
FORMULA_AUTH_API_KEY=<Formula authentication API key>
OPC_USER_DIRECTORY_URL=https://<opc-staging-host>/api/integrations/v1/formula/users
OPC_USER_DIRECTORY_TOKEN=<OPC REPORT_API_TOKEN>
```

On OPC Staging, enable the existing route with:

```text
FORMULA_USER_DIRECTORY_ENABLED=true
REPORT_API_TOKEN=<same value used by OPC_USER_DIRECTORY_TOKEN>
```

The Formula release has the OPC reference check enabled and fails closed when
the adapter, authenticated session, or active OPC reference is unavailable.

## Verification order

1. Check OPC Staging returns `200` with the machine token and `401` without it.
2. Check Formula's same-origin adapter returns `401` without a Formula session.
3. Sign in with one approved user and confirm the OPC `source_record_id` is
   retained without changing Formula's existing role.
4. Sign in with an inactive or unlisted user and confirm access is denied.
5. Only after those checks pass may the Runtime Operator promote the immutable
   release to the next environment.

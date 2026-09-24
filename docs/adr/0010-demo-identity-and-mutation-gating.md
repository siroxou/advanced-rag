# 10. Demo identity, and gating mutations instead of the whole API

Date: 2026-06-25

## Status

Accepted.

## Context

Two goals pulled in opposite directions.

A portfolio project has to be *openable*. A reviewer who lands on a login form and
has to hunt for credentials mostly does not bother, so the demo needed to work with
no sign-in. The earlier build achieved that by falling back to a demo identity when
no JWT was present, and gave that identity `viewer,analyst,admin`.

That turned out to mean something nobody intended. Every endpoint depending on
`get_current_user` was reachable with no credentials at all, holding every role.
Two route modules (`settings.py`, `presets.py`) never imported the auth dependency
in the first place, so `PUT /api/settings` could disable every guardrail, lift the
rate limit, and overwrite the API key, unauthenticated. `admin.py` accepted a
dependency parameter named `admin` and never read it, so anyone could create an
admin user. The only role check in the entire API was one row filter in `audit.py`.

The obvious fix - flip `auth_required` to true - would have closed none of it. The
two ungated modules would still have been open, `admin.py` would still not check a
role, and the frontend would have broken completely: no page sends an
`Authorization` header and there is no login UI to obtain a token from.

## Decision

Separate **who you are** from **what you may do**, and gate on the former.

`CurrentUser` now records `authenticated`, true only when a valid signed token was
presented. Roles alone authorize nothing. Every mutating endpoint depends on
`RequireAdmin`, which returns 401 for an unauthenticated caller and 403 for an
authenticated one lacking the role. Reads stay open to the demo identity, because
Row-Level Security already decides what it can actually see.

The demo identity's roles are client-assertable, via `X-Demo-Roles`. This looks
wrong at first glance and is the point: it makes the role switcher work against the
real backend, so the RBAC refusal is something you can watch happen rather than
something the README claims. It is safe because those roles only reach read paths
(the RLS policy, and whether the agent may search the web), and the header cannot set
`authenticated`, so it can never reach a write or anyone else's audit rows.

`demo_roles` defaults to `viewer` - least privilege, and it means the refusal is
visible on first run instead of hidden behind an accidental admin.

## Consequences

The demo stays one click deep, and the destructive surface is closed. The security
story also gets *easier* to tell: the demo identity is untrusted by construction,
which is why it is read-only, and the database is what enforces the reads.

The cost is a second concept in `deps.py`, and the split between the hosted demo and
the full stack is now something the README has to state plainly rather than gloss.
That honesty is worth more than the gloss was.

The audit log is the one place a role decides visibility outside RLS (`audit_log`
has no policy), so it follows the same rule as writes: only a signed token carrying
`admin` sees every user's rows. The demo identity sees the demo identity's rows,
whatever `X-Demo-Roles` claims, and those rows record the roles the client asserted,
not roles it was granted. `GET /api/metrics` aggregates the same table across every
user, so it sits behind `RequireAdmin` like a write. Web search is the other read decided by roles
(`web_allowed`), so a demo caller claiming `analyst` may spend the server's Tavily
key; that is accepted for a demo, and no deployment of it sets a Tavily key.

`AUTH_REQUIRED=true` still restores a hard JWT gate on every request for anyone
deploying this for real. Note that it is read once at import, so it is a deployment
choice, not a runtime toggle.

Untouched by this decision, and still true: the `documents` and `users` tables carry
no RLS policy of their own. `GET /documents` derives its visibility from `chunks`
instead of duplicating the ACL check, so there is one source of truth for access.

## Follow-up (2026-09-24)

The remark above that no page sends an `Authorization` header is no longer true. The
full-stack console has a sign-in under the role switcher: the token is kept in
`localStorage` and sent as a Bearer header, and write controls render only for a token
carrying `admin` (a signed-in viewer would only collect 403s). While signed in, the token's
roles replace the switcher's, because a valid JWT always wins in `get_current_user`. The
hosted demo is unchanged and never sends a token. `localStorage` is readable by any script
on the page, which is acceptable for a console on localhost; a real deployment should move
the token to an httpOnly cookie.

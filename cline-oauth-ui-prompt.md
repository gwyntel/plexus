Task: Build the admin UI surface for the existing Plexus MCP OAuth feature,
plus add eager token revocation on API key rotation/deletion. OAuth backend
(discovery, DCR, PKCE, resource param, key-rotation binding check) is
already implemented and tested — this pass is UI + one remaining backend
piece.

Scope is INSTANCE-WIDE only (one OAuth on/off toggle for the whole proxy,
not per-mounted-server) — this matches the current implementation, do not
add per-server granularity.

## 1. Settings panel: OAuth origin + enable/disable toggle

Add a section to the existing admin settings UI (wherever system-level
config like this currently lives — follow existing settings page
conventions/component patterns already in the frontend) with:
- A toggle: "Enable OAuth for MCP clients" — bound to `mcpOAuth.enabled`.
  Off by default, matches existing schema.
- A text field: "External issuer URL" — bound to `mcpOAuth.issuer`. This
  is the externally-reachable URL (e.g. a Tailscale Funnel URL) that gets
  used in discovery metadata instead of localhost. Include a short help
  text explaining that discovery metadata will be wrong / claude.ai
  connections will fail if this doesn't match the actual external URL
  the instance is reachable at.
- Validate the issuer field is a well-formed URL before allowing save.
- Wire to the existing `PATCH /v0/management/system-settings` endpoint
  pattern already used for this config (no new endpoint needed, this
  was already set via API — just needs a UI in front of it).

## 2. Consent / API-key-paste page — restyle to match Plexus login

The current `/oauth/authorize` consent page (renders when a user is asked
to paste their Plexus API key to authorize a client) should be visually
restyled to match the look of the existing Plexus login page — same
layout structure, color scheme, logo placement, typography, form styling.
Find the existing login page component/template and either reuse its
styles directly (preferred, avoids drift over time) or closely mirror it.
Rationale: a consent page that looks unfamiliar or inconsistent with the
rest of the app is itself a phishing-resistance concern for self-hosters —
familiarity is a security signal here, not just aesthetics.

Keep the actual form behavior unchanged (paste API key, submit, redirect
with auth code) — this is a styling pass, not a flow change.

## 2b. Client registration dedup (minor, address if straightforward)

Noticed in testing: claude.ai's connector retries DCR on each connection
attempt, resulting in 5 registered clients for a single logical connector
after repeated connection attempts during testing. Consider (only if low
effort): de-duplicating by matching on redirect_uris + client_name during
`/register`, returning the existing client_id instead of minting a new one
when an identical registration is submitted again. If this adds meaningful
complexity or risks breaking legitimate multi-client scenarios, skip it
and just note that it was considered but deferred.

## 3. Clients + tokens visibility pane

Plexus already has MCP usage logs somewhere in the admin UI — find that
existing pane/page and add a section (or a new adjacent pane, whichever
fits the existing navigation structure better) showing:
- List of registered OAuth clients (client_id, client_name if provided,
  registered redirect_uris, created_at)
- For each client: active tokens issued to it, and which Plexus API key
  (by keyName, never the raw secret) each token is bound to
- A manual "revoke" action per token (sets revokedAt, same mechanism the
  automatic rotation-check already uses) — this is useful independent of
  the eager-revocation work in section 4, as a manual admin override

This should read from the existing `mcp_oauth_clients` and
`mcp_oauth_tokens` tables — no new tables needed, this is a read (+ one
manual-revoke action) surface on data that already exists.

## 4. Eager revocation on key rotate/delete

Currently token invalidation on rotation/deletion is LAZY — a token bound
to a rotated/deleted key just fails validation next time it's used, but
the row stays in the table until natural expiry. For instances with many
users/devices, this causes table bloat over time.

Add EAGER cleanup: at the point in the codebase where API key rotation
and API key deletion already happen (find the existing rotate/delete
handler(s) — likely in the same service/repository layer as
`getConfig().keys`), add a call that revokes (sets `revokedAt`, do NOT
hard-delete — keep for audit/debugging purposes matching how revocation
already works elsewhere) all `mcp_oauth_tokens` rows where `keyName`
matches the key being rotated or deleted.

- On rotation: revoke all tokens bound to the OLD secret hash for that
  keyName. (Tokens are per-secret-hash already, so this is just: revoke
  every non-revoked token row for this keyName, since they're all bound
  to the hash that's about to become stale.)
- On deletion: same — revoke every non-revoked token row for that keyName.
- This is explicitly a belt-and-suspenders addition on top of the
  existing lazy check (section already covers correctness) — this is
  about cleanup/bloat, not fixing a security gap that still exists.
- Add test coverage: rotate a key with 2 active tokens bound to it,
  confirm both get `revokedAt` set (not deleted) immediately, without
  needing either token to be used again.

Do not touch packages/backend/src/routes/mcp/plexus.ts or
RESERVED_SERVER_NAMES. Follow existing repo conventions (Zod validation,
existing settings-page component patterns, existing revoke-token
mechanism reused rather than reimplemented).

Output: file diffs/new files for the settings UI, the restyled consent
page, the clients/tokens pane, and the eager revocation change, plus a
short note on the DCR dedup decision (implemented or deferred, and why).

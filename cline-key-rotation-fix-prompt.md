Task: Close a security gap in the existing Plexus MCP OAuth implementation
(PlexusIdpProvider). Currently validateToken() only checks token existence,
revocation status, and expiry — it does NOT verify the underlying Plexus
API key that the token was issued against is still valid. This means
rotating or deleting a Plexus API key does not invalidate OAuth tokens
already issued from it; they remain usable until their own expiry.

## Threat model this addresses

Plexus instance is exposed to the internet (via Tailscale funnel). OAuth
access/refresh tokens are opaque, server-side-stored, never exposed in a
form a client could leak beyond the token itself (no JWT payload to
inspect). The realistic risk is a stolen/leaked token being used to hit
/mcp/:name directly. The mitigation is not preventing theft (that's normal
bearer-token risk, same as any OAuth deployment) — it's making sure
revocation/rotation of the underlying credential is IMMEDIATE and doesn't
silently leave old OAuth tokens live.

## Required fix

1. At token issuance time (both the initial /oauth/token authorization_code
   grant AND every subsequent refresh_token grant), compute and store a
   hash of the CURRENT secret value of the bound Plexus API key
   (apiKeySecretHash — use the existing hashSecret() helper from
   utils/encryption.ts, same one used elsewhere in this codebase). Add this
   column to the mcp_oauth_tokens table (both sqlite and postgres schema
   files) if not already present, wired through drizzle/schema/*/index.ts
   exactly like the existing three tables.

2. In validateToken(), after confirming the token exists/isn't
   revoked/isn't expired, look up the CURRENT secret hash of the bound
   Plexus API key (by keyName, via the existing key store / config
   accessor already used elsewhere in mcp-oauth-repository.ts or
   utils/auth.ts) and compare it against the stored apiKeySecretHash.
   - If the key no longer exists at all → treat as invalid, same as
     expired/revoked (401 + WWW-Authenticate: Bearer error="invalid_token").
   - If the key exists but its secret hash has changed (i.e. it was
     rotated) → same: invalid.
   - Only proceed if the hashes match exactly.

3. On refresh_token grant: re-check the same binding before issuing a new
   access token. If the underlying key has been rotated/deleted since the
   refresh token was issued, reject the refresh (invalid_grant) rather than
   silently minting a fresh access token bound to a stale hash. If the
   refresh succeeds, the newly issued access token must be re-bound to the
   CURRENT key secret hash (not copy the old one forward), so the same
   check stays meaningful going forward.

4. This is a tightening of validation only — it must not change the
   default-off behavior, the raw-bearer-API-key fast path (untouched), or
   any of the discovery/PKCE/resource-parameter logic already implemented.
   Do not touch packages/backend/src/routes/mcp/plexus.ts or
   RESERVED_SERVER_NAMES.

5. Fix the minor schema redundancy flagged in the last verification pass
   while you're in the schema file: the `code`, `accessToken`, and
   `refreshToken` columns each currently have both a `unique` constraint
   on the encrypted value itself AND a separate unique-constrained hash
   column (codeHash/accessTokenHash/refreshTokenHash) used for actual
   lookups. Drop the redundant `unique` constraint on the encrypted-value
   columns themselves — only the hash columns need it, since hash columns
   are what queries actually filter on.

6. Add test coverage for: (a) token issued, key rotated, token now rejected
   with invalid_token; (b) token issued, key deleted entirely, same
   rejection; (c) refresh_token grant against a rotated key correctly
   rejected with invalid_grant; (d) normal (non-rotated) refresh still
   works and the newly issued access token carries the updated hash.

Output: file diffs, plus confirmation that `bun run typecheck` and the
existing test suite (previously 50 cases / 27 passing per last
verification — investigate and note if that gap between 50 and 27 is
pre-existing skips/todos or a real regression, since it wasn't explained
in the last report) both pass after this change.

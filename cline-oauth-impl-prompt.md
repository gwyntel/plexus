Task: Implement OAuth 2.1 authorization-code-flow support in Plexus's MCP
proxy (mcowger/plexus fork), scoped to /mcp/:name routes only.

## Architecture requirement: pluggable AuthProvider

Do not hardwire OAuth logic directly into the route handlers. Define a
small AuthProvider interface that both the initial implementation and a
future second implementation can satisfy:

  interface AuthProvider {
    getDiscoveryMetadata(req): OAuthDiscoveryMetadata
    getProtectedResourceMetadata(req): ProtectedResourceMetadata
    handleAuthorize(req, reply): Promise<void>   // GET + POST /oauth/authorize
    handleToken(req, reply): Promise<void>       // POST /oauth/token
    handleRegister(req, reply): Promise<void>    // POST /register
    validateToken(token: string): Promise<{ keyName: string; scopes: string[] } | null>
  }

Implement ONE concrete provider now: `PlexusIdpProvider` — Plexus acts as
its own authorization server. The consent screen at /oauth/authorize lets
the user paste an existing Plexus API key instead of a username/password.
Do NOT implement a second provider (external OIDC delegation) yet — just
make sure the interface and the place where the active provider is selected
(a single config-driven switch, e.g. `config.mcpOAuth.provider = "plexus-idp"`)
are structured so a second implementation can be dropped in later without
touching the route registration or middleware code.

## Library preference

Prefer well-supported existing libraries over hand-rolled OAuth logic where
they fit Plexus's existing stack (Fastify, Node, TypeScript, Drizzle).
Specifically evaluate and prefer, in this order of preference, whichever
is compatible with a from-scratch authorization-server role (not just an
RP/client library — Plexus needs to ISSUE tokens, not consume someone
else's):

1. `@node-oauth/oauth2-server` — framework-agnostic OAuth 2 server
   implementation, has a maintained Fastify integration pattern, supports
   authorization_code + refresh_token grants and PKCE. Good fit if it can
   be adapted to Plexus's existing Drizzle-backed storage via its model
   interface (implement the model's getClient/saveToken/getAccessToken/etc.
   against mcp-oauth-repository.ts rather than hand-writing token issuance).
2. If (1) doesn't cleanly support PKCE + DCR + the custom consent flow
   (API-key-as-credential instead of password), it is acceptable to
   hand-implement using existing Plexus primitives (hashSecret, encryptField,
   Zod validation) rather than force-fitting a library that doesn't match
   the shape of this problem. Justify whichever choice is made in a short
   comment block at the top of the new oauth service file.
3. Do NOT pull in a full IdP framework (e.g. oidc-provider/node-oidc-provider)
   — that's built for issuing ID tokens/JWTs and is heavier than what a
   bearer-opaque-token proxy auth layer needs here.

Use `@fastify/formbody` for the token endpoint and consent form POST
(application/x-www-form-urlencoded) — add it to package.json, it is not
currently a dependency.

## Trigger condition — this is the important behavioral spec

The OAuth flow is a FALLBACK, not a replacement. Existing behavior (raw
Plexus API key via bearer auth or x-api-key header) must be fully preserved
and unchanged when present. Specifically, on requests to /mcp/:name:

1. If a valid `Authorization: Bearer <plexus-api-key>` or `x-api-key` header
   is present and validates against the existing key store → proceed exactly
   as today, no OAuth involved at all.
2. If NO api-key-style auth header is present at all (neither Authorization
   nor x-api-key) → this is the OAuth entry point. Respond 401 with a
   WWW-Authenticate header pointing at the protected-resource metadata URL,
   per the MCP spec's discovery flow. This is what triggers Claude's OAuth
   discovery sequence.
3. If an `Authorization: Bearer <token>` header IS present but does NOT
   match a raw Plexus API key → attempt OAuth access token validation
   (hash lookup against issued tokens). Valid → proceed, resolving to the
   bound Plexus API key. Invalid/expired/revoked → 401 with
   WWW-Authenticate: Bearer error="invalid_token".

Do not attempt OAuth token validation before raw API key validation has
been tried and failed to match the header format — raw keys and OAuth
tokens should be distinguishable by format/prefix if possible (e.g. give
issued OAuth access tokens a distinct prefix) to avoid unnecessary hash
lookups on every request.

## Default-off requirement

The entire OAuth surface (discovery endpoints beyond what already exists,
/oauth/authorize, /oauth/token, /register with real DCR) must be gated
behind a single config flag, OFF by default. When off:
- Existing bearer-auth-only behavior is 100% unchanged (this is today's
  behavior and must not regress).
- /oauth/* and /register routes should not be registered at all (404,
  not "disabled" responses).
- Discovery metadata at /.well-known/oauth-authorization-server should
  either not be registered, or honestly reflect that no real OAuth is
  available (do not advertise fake endpoints, which is the current bug
  being fixed).

## PKCE and resource parameter — MANDATORY, not optional

- code_challenge / code_challenge_method=S256 is REQUIRED on every
  /oauth/authorize request. Reject requests without it. Advertise
  code_challenge_methods_supported: ["S256"] in discovery metadata —
  Claude will refuse to proceed without this being present.
- The `resource` parameter (RFC 8707) MUST be accepted on both the
  authorize and token requests and validated against the server's own
  MCP resource URL. Do not treat it as optional.

## Callback URLs to support (for redirect_uri validation / testing)

- Claude.ai web/desktop/mobile/Cowork: https://claude.ai/api/mcp/auth_callback
  and https://claude.com/api/mcp/auth_callback (register both)
- Claude Code: http://localhost/callback and http://127.0.0.1/callback,
  loopback with PORT-AGNOSTIC matching (Claude Code uses a random ephemeral
  port per session — do not require exact port match for loopback redirect
  URIs specifically; exact match is still required for all non-loopback URIs)

## Deliverables (implement all, using the deliverables spec + cross-check
from the prior round as the source of truth for file layout, schema shape,
and existing-pattern conventions):

1. AuthProvider interface + PlexusIdpProvider implementation
2. /oauth/authorize (GET renders consent w/ API key paste form, POST issues
   code)
3. /oauth/token (authorization_code + refresh_token grants)
4. /register (real DCR, RFC 7591, random client_id, no static id)
5. Drizzle schema: mcp_oauth_clients, mcp_oauth_authorization_codes,
   mcp_oauth_tokens — sqlite + postgres, wired into
   drizzle/schema/{sqlite,postgres}/index.ts (NOT client.ts directly)
6. Middleware change per the trigger-condition spec above, with
   WWW-Authenticate header on both the initial 401 and invalid_token cases
7. Discovery metadata (oauth-authorization-server + oauth-protected-resource)
   reflecting real endpoints, gated by the default-off config flag
8. Config flag wiring (off by default) + minimal admin-facing config schema
   entry for enabling it (do not build the full admin UI panel yet — just
   the config surface a UI could hook into later)

Do not touch anything under packages/backend/src/routes/mcp/plexus.ts or
any x-admin-key auth path. The reserved server name "plexus" must remain
excluded from /mcp/:name handling exactly as it is today.

Follow existing repo conventions throughout: encrypt()/hashSecret()/
encryptField() from utils/encryption.ts for all secret storage, Zod for
input validation (matching routes/management/oauth.ts style), no manually
written migration files (schema .ts changes only, CI generates migrations),
epoch-ms integer timestamps matching api-keys.ts/mcp-servers.ts convention.

Output: the actual implementation as file diffs/new files, plus a short
summary of any deviation from the spec above and why.

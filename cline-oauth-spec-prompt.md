Task: Propose a strict deliverables spec for adding real OAuth 2.0 
authorization-code flow support to Plexus's MCP proxy (mcowger/plexus), 
so remote MCP clients that require full OAuth (e.g. claude.ai's custom 
connector) can authenticate against a self-hosted Plexus instance.

Context: Plexus currently exposes OAuth *discovery* endpoints 
(/.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource, 
/register) that advertise `bearer` and `client_credentials` grants, but no 
actual /oauth/authorize or /oauth/token endpoints exist. Real auth is 
bearer-token-as-API-key. /register returns a static client ID 
("plexus-mcp-static") with no real per-client credentials.

Deliverables to specify (don't implement yet — just spec each one):
1. /oauth/authorize — GET, browser-facing. Must render a consent screen 
   where the user pastes/selects an existing Plexus API key rather than 
   doing a username/password login. Needs redirect_uri validation, state 
   passthrough, PKCE support (code_challenge/code_challenge_method) since 
   claude.ai's connector may require it.
2. /oauth/token — POST. Exchanges an authorization code (or refresh_token) 
   for an access_token. Needs to validate PKCE code_verifier if used.
3. /register — real dynamic client registration (RFC 7591): generate a 
   real client_id per registering client, store redirect_uris, no client 
   secret needed for public clients.
4. Token storage — schema for issued authorization codes (short-lived) 
   and access/refresh tokens (bound to a Plexus API key + client_id), 
   encrypted at rest consistent with existing Plexus conventions 
   (AES-256-GCM, matches how API keys/OAuth provider tokens are already stored).
5. Middleware change — the existing /mcp/:name proxy auth check needs to 
   accept these newly-issued OAuth access tokens *in addition to* raw 
   Plexus API keys, resolving the token back to the underlying API key.
6. Update discovery metadata to reflect real endpoints (already mostly 
   correct, just needs authorization_endpoint/token_endpoint to actually work).

For each deliverable, specify: exact file(s)/module(s) it likely touches, 
inputs/outputs, error cases, and how it fits Plexus's existing patterns 
(Fastify route conventions, existing encryption helpers, existing DB 
migration style). Do not write implementation code — deliverables spec only.

Output as structured markdown, one section per deliverable.

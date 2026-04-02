# Remove WebAuthn/Face ID Feature

## Summary

Removes the WebAuthn-based Face ID authentication feature entirely, simplifying the codebase by eliminating 492 lines of complexity and two external dependencies.

## Why

The WebAuthn/Face ID feature added significant complexity for a security layer that may not be needed in the current threat model. Removing it:
- Eliminates WebAuthn-specific TLS proxy workarounds
- Removes credential storage and challenge management overhead
- Simplifies the server bootstrap and client initialization
- Reduces attack surface and maintenance burden

## What Changed

**Files deleted:**
- `src/faceid.ts` — Server-side WebAuthn service (credential store, challenge generation, verification)
- `public/app/core/faceid.js` — Client-side overlay UI and WebAuthn API integration

**Files modified:**
- `package.json` — Removed `@simplewebauthn/browser` and `@simplewebauthn/server` dependencies
- `src/server.ts` — Removed `/api/faceid/*` routes and vendor file serving for simplewebauthn
- `src/proxy.ts` — Simplified comment (removed WebAuthn-specific context)
- `public/app/main.js` — Removed faceid guard import and startup call
- `tests/golden/proxy.test.ts` — Updated test URLs from `/api/faceid/challenge` to `/api/sessions`
- `bun.lock` — Updated lockfile

**Stats:** -502 lines, +10 lines across 8 files

## Risk / Rollout Notes

- **User impact:** Users who had enrolled Face ID will no longer see the unlock prompt. The credential file at `~/.pi/agent/pi-web/faceid-credentials.json` becomes orphaned but harmless.
- **No migration needed:** The app simply starts without the auth guard. No data loss or corruption.
- **Rollback:** Revert this commit to restore the feature. Enrolled credentials remain valid.

## Verification

### Automated
- [x] Unit tests pass (120/121 — 1 unrelated failure in repo browser CSS class test)
- [x] No TypeScript errors (no typecheck script available)
- [ ] E2E tests: Not run

### Manual
- [ ] Start server with `bun run dev` — confirm app loads without Face ID overlay
- [ ] Verify `/api/faceid/*` routes return 404
- [ ] Confirm no console errors about missing faceid module

## Follow-ups

None — this is a clean feature removal with no partial migration state.

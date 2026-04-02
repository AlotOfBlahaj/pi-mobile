---
date: 2026-04-02T00:00:00Z
author: claude
type: tdd-tests
plan: docs/plans/2026-04-02-sidebar-refactoring.md
status: green (tests passing after implementation)
---

# TDD Tests: Sidebar Refactoring — Flat Lazy-Loaded Navigation

## Test Coverage Map

### Backend (Phase 1)
| Test File | Test Count | What It Verifies |
|-----------|-----------|-----------------|
| `tests/golden/sidebar-backend.test.ts` | 28 tests | `isPathAllowed()` pure function, `GET /api/sidebar` shape & sorting, `GET /api/fs/ls` entries & security, `DELETE /api/repos` CRUD, `GET /api/sessions?cwd=` filtering |

### Frontend Core (Phase 2)
| Test File | Test Count | What It Verifies |
|-----------|-----------|-----------------|
| `tests/golden/session-row.test.js` | 19 tests | Session row rendering, dirty data (XSS, null, very long), active/running state, click handling, update method |
| `tests/golden/repo-group.test.js` | 21 tests | COLLAPSED↔LOADING↔EXPANDED↔ERROR state machine, lazy loading, caching, remove repo, new session, refresh, highlight |
| `tests/golden/active-session.test.js` | 12 tests | Active session rendering, ALL running sessions shown, .active highlight, click handling, refresh behavior |
| `tests/golden/repo-browser.test.js` | 17 tests | Directory listing, navigation, breadcrumb, path input, Select/Cancel, close, error handling |

### E2E (Phase 4)
| Test File | Test Count | What It Verifies |
|-----------|-----------|-----------------|
| `tests/e2e/sidebar.e2e.js` | 10 tests | Full flow: open sidebar, expand repo, lazy load, active session, create session, add repo, remove repo, mobile overlay, refresh |

## Test Categories
- **Happy path tests**: 40
- **Edge case tests** (dirty data, boundary values): 15
- **Error handling tests** (network failure, permission denied, 404): 10
- **Security tests** (path traversal, XSS, HTML injection): 6
- **State machine tests** (expand/collapse transitions): 8
- **Integration tests** (HTTP routes, lazy loading verification): 5
- **Total**: ~97 tests across 6 files

## Contracts Tested

### Backend Contracts
- **`isPathAllowed(resolvedPath, homeDir)`**: 15 test cases covering home dir subpaths, blocked paths (/etc, /proc, /sys, /dev), path traversal, boundary conditions (trailing slashes, similar prefixes)
- **`GET /api/sidebar`**: Response shape (`ApiSidebarResponse`), repos sorted by `lastActivity` desc/nulls last, `activeSessions` with required fields, `isRunning` always true for active
- **`GET /api/fs/ls?path=...`**: Sorted entries (dirs first, then files, alpha within), 400 for missing path, 403 for disallowed, 404 for non-existent
- **`DELETE /api/repos`**: 400 for empty/missing cwd, 404 for non-existent repo, 204 on success, repo removed from list
- **`GET /api/sessions?cwd=...`**: Sessions filtered by cwd, correct ApiSessionSummary shape

### Frontend Contracts
- **`createSessionRow({ session, isActive, onSelect })`**: Returns `{ getElement(), update() }`; renders `.si` with `.si-name`, `.si-meta`, `.si-run-dot`; handles name/firstMessage/id fallback; XSS escaping; truncation; click→onSelect
- **`createRepoGroup({ cwd, homeDir, api, ... })`**: Returns `{ getElement(), isExpanded(), setExpanded(), refresh(), highlightSession() }`; COLLAPSED→LOADING→EXPANDED→COLLAPSED state machine; ERROR with retry; caching on collapse; remove button; new session button; refresh when expanded only
- **`createActiveSession({ container, api, ... })`**: Returns `{ update(), getElement() }`; renders ALL running sessions; highlights viewed with `.active`; shows "ACTIVE" label; hidden when no sessions; click→onSelectSession
- **`createRepoBrowser({ api, onSelect, onCancel })`**: Returns `{ open(), close(), getElement() }`; directory listing from API; navigation into dirs; breadcrumb; path input; Select→onSelect; Cancel/Close/Escape→onCancel; error display for permission denied

## Assumptions Made
1. **`isPathAllowed` is exported** from `src/session-runtime.ts` as a standalone function — based on plan specifying it as a "helper" to be tested
2. **`api` object has `getJson`, `postJson`, `deleteJson` methods** — inferred from research doc mention of "HTTP client (getJson, postJson)" and standard REST patterns
3. **Frontend factory functions** are ESM exports from `public/app/ui/sidebar/*.js` — based on plan's file structure
4. **Session row DOM structure** uses `.si`, `.si-name`, `.si-meta`, `.si-run-dot` classes — based on plan referencing existing sidebar.js patterns
5. **Repo group DOM structure** uses `.repo-group`, `.repo-header`, `.repo-sessions` classes — based on plan's CSS specifications
6. **Repo browser DOM structure** uses `.repo-browser-overlay`, `.repo-browser`, `.repo-browser-entry` classes — based on plan's CSS specifications
7. **Backend route tests** start the server on port 14567 — may need auth token or environment configuration during Green phase
8. **`happy-dom`** provides sufficient DOM environment for frontend unit tests — standard Bun testing approach
9. **`ApiSessionSummary` shape** includes `id, path, cwd, name, firstMessage, created, modified, messageCount, isRunning` — from existing `src/types.ts`

## Not Covered (and why)
- **Internal implementation of PiWebRuntime methods** (`getSidebarData`, `listSessionsByCwd`, `removeRepo`, `listFsEntries`): Tested through HTTP routes instead of direct method calls — black-box testing principle
- **PiWebRuntime constructor details**: Not needed for route-level testing; constructor is an implementation detail
- **`SessionManager.list()` vs `listAll()` call verification**: Cannot mock the SDK at the unit test level without reading implementation internals. Verified indirectly through route behavior
- **Expand/collapse animation transitions**: Plan specifies "instant for now" — no animation to test
- **Expand/collapse state persistence**: Explicitly out of scope in plan
- **Session search/filter**: Explicitly out of scope in plan
- **Session delete/rename**: Explicitly out of scope in plan
- **Cross-repo batch operations**: Explicitly out of scope in plan
- **Symlink resolution in `isPathAllowed`**: Requires real filesystem with symlinks — better tested in integration environment
- **Concurrent expand/collapse race conditions**: Hard to test deterministically; plan mentions abort controller pattern but doesn't require tests

## Test Infrastructure Changes
- **Added** `happy-dom` as dev dependency for frontend DOM testing
- **Created** `bunfig.toml` with `preload = ["./tests/setup-dom.js"]` for Bun test configuration
- **Created** `tests/setup-dom.js` to configure happy-dom global DOM environment

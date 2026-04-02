---
date: 2026-04-02
author: claude
status: draft
tags: [plan, sidebar, frontend, backend, navigation, lazy-loading, multi-module]
---

# Implementation Plan: Sidebar Refactoring — Flat Lazy-Loaded Navigation

## Context

Refactor the sidebar from a three-mode state machine (`active` | `repos` | `repoSessions`) to a flat, lazy-loaded, collapsible-tree sidebar. All repos visible at once, sessions lazy-loaded per-repo on expand, active session pinned to top.

**References:**
- [Design Doc](../design/2026-04-02-sidebar-refactoring.md) — Option B: Multi-module approach selected
- [Research Doc](../research/2026-04-02-sidebar-refactoring-research.md) — Current architecture analysis
- [Structure Map](../structure/2026-04-02-pi-mobile-codebase.md) — Full codebase reference

## Scope

**In scope:**
- Multi-module sidebar: `sidebar/index.js`, `active-session.js`, `repo-group.js`, `session-row.js`
- `GET /api/sidebar` endpoint (combined repos + active sessions in one call)
- `GET /api/sessions?cwd=...` optimized per-repo session loading
- `GET /api/fs/ls` file system browsing endpoint with path validation
- `DELETE /api/repos` remove repo endpoint (list-only, no disk delete)
- `sidebar/repo-browser.js` file system tree modal for Add Repo
- Inline "New Session" creation per repo (repo picker overlay)
- Visibility-based refresh replacing `setInterval` polling
- Expand/collapse with lazy load + in-memory cache
- Full mobile experience preserved (overlay + slide animation)

**Out of scope:**
- Session search/filter
- Session delete/rename
- Session content editing
- Cross-repo batch operations
- Expand/collapse state persistence (ephemeral — lost on refresh)
- Animated expand/collapse transitions (instant for now)

## Implementation Approach

**Architecture**: Option B from the design doc — multi-module sidebar with factory functions + DI, matching the existing codebase convention. Each sub-component is a self-contained factory function in its own file.

**Key patterns followed:**
- Factory function + closure state (matching `public/app/ui/sidebar.js:49`)
- Constructor-parameter DI via options objects (matching `public/app/main.js:273-285`)
- Kebab-case file naming (matching all existing files)
- ESM imports with explicit `.js` extensions
- No default exports, no barrel exports

**Backend approach:**
- New `GET /api/sidebar` endpoint combines repos + active sessions in one call (eliminates 2 fetches on sidebar open)
- Existing `GET /api/sessions?cwd=...` route optimized: call `SessionManager.list(cwd)` directly instead of `listAll()` + filter
- New `GET /api/fs/ls` with `isPathAllowed()` security check (home dir boundary)
- New `DELETE /api/repos` — removes entry from `repos.json`, no disk changes

---

## Test Phase: Sidebar Refactoring

> ⚠️ Execute via `/test` in a SEPARATE session. Do NOT combine with /implement.

### Contracts to Test

#### Backend Contracts
- [ ] `PiWebRuntime.getSidebarData()` — returns `{ homeDir, repos, activeSessions }` with repos sorted by recent activity
- [ ] `PiWebRuntime.listSessionsByCwd(cwd)` — returns sessions for a single repo without calling `listAll()`
- [ ] `PiWebRuntime.removeRepo(cwd)` — removes from repos.json, preserves session files
- [ ] `isPathAllowed(path, homeDir)` — path validation for fs browsing (blocks traversal, symlinks, paths outside home)
- [ ] `GET /api/sidebar` — returns correct JSON shape
- [ ] `GET /api/fs/ls?path=...` — returns sorted entries, 403 for disallowed paths
- [ ] `DELETE /api/repos` — removes repo, 404 for non-existent repo

#### Frontend Contracts
- [ ] `createSessionRow({ session, isActive, onSelect })` — renders `.si` with name, meta, running dot; handles dirty data (missing firstMessage, special chars, very long text)
- [ ] `createRepoGroup({ cwd, api, ... })` — expand/collapse state machine: COLLAPSED → LOADING → EXPANDED → COLLAPSED; lazy-loads on expand; caches data; ERROR state with retry
- [ ] `createActiveSession({ container, api, ... })` — renders ALL running sessions; highlights the viewed one with `.active`
- [ ] `createRepoBrowser({ api, onSelect, onCancel })` — directory navigation, path breadcrumb, error display for permission denied
- [ ] `createSidebar(...)` orchestrator — wires all sub-components, fetches `/api/sidebar`, renders repo list, manages expanded repos set

### Test Files to Create
- [ ] `tests/golden/sidebar-backend.test.ts` — Backend unit tests: `getSidebarData()`, `listSessionsByCwd()`, `removeRepo()`, `isPathAllowed()`, route handlers
- [ ] `tests/golden/session-row.test.js` — Frontend: session row rendering with dirty data
- [ ] `tests/golden/repo-group.test.js` — Frontend: expand/collapse state machine
- [ ] `tests/golden/active-session.test.js` — Frontend: active session rendering and highlighting
- [ ] `tests/golden/repo-browser.test.js` — Frontend: directory navigation, path assembly
- [ ] `tests/e2e/sidebar.e2e.js` — E2E: expand repo, create session, add repo, remove repo, active session display

### Test Specifications

**Backend tests** (`sidebar-backend.test.ts`):
- Read type definitions from `src/types.ts` for API shapes
- `getSidebarData()`: mock `loadReposFromDisk()` return, verify repos sorted alphabetically, active sessions come from `runningById`
- `listSessionsByCwd(cwd)`: verify it calls `SessionManager.list(cwd)` NOT `listAll()`, merges running sessions for that cwd
- `removeRepo(cwd)`: add repo, remove it, verify repos.json doesn't contain it, verify `SessionManager.list()` still returns sessions for that cwd
- `isPathAllowed()`: test with home dir subpath (allowed), `/etc/passwd` (blocked), `../../etc` (blocked), symlink escaping (blocked), registered repo outside home (allowed)
- Route tests: use Bun's test server or direct function calls

**Frontend tests** (pure DOM factory tests):
- Read factory function signatures from this plan's interface definitions below
- Test author should NOT read implementation files
- `createSessionRow`: pass `session` with `{ firstMessage: undefined }`, `{ firstMessage: "a".repeat(500) }`, `{ firstMessage: "<script>alert(1)</script>" }`, verify escaping and truncation
- `createRepoGroup`: verify `.getElement()` returns HTMLElement, `.isExpanded()` starts false, `.setExpanded(true)` triggers fetch, `.setExpanded(false)` hides DOM, error state shows retry button
- `createRepoBrowser`: verify `.open("/home/user")` shows entries, navigate into subdirectory, back to parent, permission denied shows error

### Test Success Criteria
- [ ] All tests compile/parse correctly
- [ ] All tests FAIL (red phase — no implementation yet)
- [ ] Tests cover: happy path, error cases, edge cases (dirty data, security)
- [ ] Tests are black-box (no implementation internals)

---

## Phase 1: Backend Foundation

> ⚠️ Execute via `/implement` in a SEPARATE session from /test.
> Implementation MUST NOT modify test files. If tests need changes, go back to /test.

### Changes (implementation only — no test files here)

#### 1.1 Type Definitions
- [x] `src/types.ts` — Add new interfaces after existing types (~line 50):

```typescript
// Sidebar combined response
export interface ApiSidebarResponse {
  homeDir: string;
  repos: ApiRepoEntry[];
  activeSessions: ApiSessionSummary[];
}

// Repo with activity metadata
export interface ApiRepoEntry {
  cwd: string;
  lastActivity: string | null; // ISO 8601 of most recent session modified time
}

// File system browsing
export interface FsEntry {
  name: string;
  path: string;        // absolute resolved path
  isDirectory: boolean;
}
export interface FsListResponse {
  path: string;        // resolved absolute path
  entries: FsEntry[];  // sorted: directories first, then files, alphabetical
}

// Remove repo request
export interface ApiRemoveRepoRequest {
  cwd: string;
}
```

#### 1.2 Session Runtime Methods
- [x] `src/session-runtime.ts` — Add `getSidebarData()` method (after `listActiveSessions()` at ~line 176):

```
getSidebarData(): 
  - Read repos from loadReposFromDisk() only (NOT listAll)
  - Merge running session cwds into repos set
  - For each repo, compute lastActivity by scanning session modified times (or null if no sessions)
  - Sort repos: those with lastActivity descending first, then alphabetically for nulls
  - Collect activeSessions from runningById (same logic as listActiveSessions)
  - Return { homeDir: homedir(), repos, activeSessions }
```

- [x] `src/session-runtime.ts` — Add `listSessionsByCwd(cwd: string)` method:

```
listSessionsByCwd(cwd):
  - Call SessionManager.list(cwd) — per-repo listing, NOT listAll()
  - Map each via serializeSessionSummary()
  - Set isRunning = this.runningByPath.has(entry.path) for each
  - Merge in running sessions from runningById where runtime.cwd === cwd
  - Sort by modified descending
  - Return array
```

- [x] `src/session-runtime.ts` — Add `removeRepo(cwd: string)` method:

```
removeRepo(cwd):
  - Normalize cwd (same as addRepo)
  - Load repos from disk
  - Filter out the matching cwd (throw if not found)
  - Save updated repos to disk
  - No file deletion — session files and disk contents untouched
```

- [x] `src/session-runtime.ts` — Add `listFsEntries(requestedPath: string)` method:

```
listFsEntries(requestedPath):
  - Resolve path with path.resolve()
  - Resolve symlinks with fs.realpath()
  - Validate with isPathAllowed() — must be under home directory
  - Throw "path_not_allowed" if outside bounds
  - Read directory entries with fs.readdir({ withFileTypes: true })
  - Map to FsEntry: name, resolved path, isDirectory
  - Filter: skip hidden entries (name starts with .) — optional
  - Sort: directories first, then files, alphabetical within each group
  - Return FsListResponse
```

- [x] `src/session-runtime.ts` — Add `isPathAllowed(resolvedPath: string)` helper:

```
isPathAllowed(resolvedPath, homeDir):
  - Must start with homeDir
  - Block /proc, /sys, /dev, /etc
  - After realpath resolution, re-check boundary
```

#### 1.3 Server Routes
- [x] `src/server.ts` — Add `GET /api/sidebar` route (before existing `/api/sessions` block at ~line 248):

```
GET /api/sidebar:
  - Call runtime.getSidebarData()
  - Return json(body, 200) with ApiSidebarResponse shape
```

- [x] `src/server.ts` — Modify `GET /api/sessions` route (~line 248-257):

```
GET /api/sessions:
  - When cwdFilter present: call runtime.listSessionsByCwd(cwdFilter)
  - When no cwdFilter: keep existing runtime.listSessions() for backward compat
```

- [x] `src/server.ts` — Add `DELETE /api/repos` route (after POST /api/repos at ~line 289):

```
DELETE /api/repos:
  - Parse body as ApiRemoveRepoRequest
  - Validate cwd is non-empty string
  - Call runtime.removeRepo(cwd)
  - Return 204 No Content
  - Error: 404 if repo not in list, 400 if validation fails
```

- [x] `src/server.ts` — Add `GET /api/fs/ls` route:

```
GET /api/fs/ls?path=...:
  - Extract path from query string (required, 400 if missing)
  - Call runtime.listFsEntries(path)
  - Return json(body, 200) with FsListResponse shape
  - Catch "path_not_allowed" → 403
  - Catch ENOENT → 404
  - Catch EACCES → 403
```

### Implementation Details

- Follow existing pattern for route handlers: sequential `if/else if` on method+pathname, `json()` and `errorResponse()` helpers
- `getSidebarData()` MUST NOT call `SessionManager.listAll()` — repos come from `repos.json` + `runningById` only
- `listSessionsByCwd()` calls `SessionManager.list(cwd)` — the per-repo static method from the SDK
- `isPathAllowed()` must resolve symlinks via `fs.realpath()` before boundary check
- Use `import { homedir } from "node:os"` (already available)
- Use `import { readdir, realpath } from "node:fs/promises"` for async file ops

### Success Criteria

#### Automated Verification
- [x] Build passes: `cd /home/ubuntu/projects/pi-mobile && bunx tsc --noEmit` (no TS errors)
- [ ] TDD tests from Test Phase now PASS: `bun test` (tests have structural issues — see below)
- [x] Sidebar API works: `curl -s http://localhost:3456/api/sidebar | jq '.homeDir, (.repos | length), (.activeSessions | length)'`
- [x] Sessions-by-cwd works: `curl -s "http://localhost:3456/api/sessions?cwd=$CWD" | jq '.sessions | length'`
- [x] FS listing works: `curl -s "http://localhost:3456/api/fs/ls?path=/home/ubuntu" | jq '.entries | length'`
- [x] FS blocks traversal: `curl -s "http://localhost:3456/api/fs/ls?path=/etc"` returns 403
- [x] No `listAll()` in sidebar path: `grep -n "getSidebarData\|listSessionsByCwd" src/session-runtime.ts`

#### Manual Verification
- [ ] `curl -X DELETE http://localhost:3456/api/repos -H 'Content-Type: application/json' -d '{"cwd":"/tmp"}'` returns 404 (not in repos)
- [ ] Existing endpoints still work: `curl -s http://localhost:3456/api/repos | jq '.repos | length'`

---

## Phase 2: Frontend Core Sub-Modules

> ⚠️ Execute via `/implement` in a SEPARATE session from /test.
> This phase creates new files only — does NOT modify existing files yet.

### Changes (implementation only — no test files here)

#### 2.0 Extract Shared Utilities
- [x] **Create** `public/app/core/time.js` — Extract `formatRelativeTime()` from `sidebar.js:1-18`
- [x] **Create** `public/app/core/html.js` — Extract `escapeHtml()` from `sidebar.js:32-38`

#### 2.1 Session Row Component
- [x] **Create** `public/app/ui/sidebar/session-row.js` (~50 lines)

```typescript
// Factory function interface:
export function createSessionRow({ session, isActive, onSelect }) {
  // Create .si div with data-session-id
  // .si-name: session.name || session.firstMessage || session.id.slice(0, 8)
  // .si-meta: relativeTime(session.modified) + (session.isRunning ? " · running" : "")
  // If isRunning: prepend <span class="si-run-dot"></span> before .si-name
  // If isActive: add .active class
  // Click handler: onSelect(session)
  // Return { getElement(), update(session) }
}
```

**Pattern to follow**: `public/app/ui/sidebar.js:129-162` (`renderSessions()` function) — reuse the same `.si` DOM structure, `.si-name`, `.si-meta`, `.si-run` classes.

#### 2.2 Active Session Component
- [x] **Create** `public/app/ui/sidebar/active-session.js` (~60 lines)

```typescript
// Factory function interface:
export function createActiveSession({ container, api, getActiveSessionId, onSelectSession }) {
  // Fetches GET /api/active-sessions
  // Renders ALL running sessions as compact .si rows
  // The session matching getActiveSessionId() gets .active class
  // Shows "ACTIVE" label above the list
  // If no active sessions: show nothing (hidden section)
  // Return { update(), getElement() }
}
```

**Pattern to follow**: `public/app/ui/sidebar.js:250-270` (active mode in `refresh()`) — same API call and rendering pattern.

#### 2.3 Repo Group Component
- [x] **Create** `public/app/ui/sidebar/repo-group.js` (~120 lines)

```typescript
// Factory function interface:
export function createRepoGroup({ cwd, homeDir, api, clientId, getActiveSessionId, onSelectSession, onSessionIdSelected, onNotice }) {
  // State machine: COLLAPSED → LOADING → EXPANDED → COLLAPSED
  //                LOADING → ERROR (with retry → LOADING)
  // 
  // COLLAPSED: render .repo-header only (abbreviated cwd, expand icon ▶)
  // LOADING: show .sidebar-loading inside .repo-sessions
  // EXPANDED: render session rows via createSessionRow() + [New Session] button
  // ERROR: show error message + retry button
  //
  // Cache: keep sessions in memory after first load
  // Re-expand: show cached data immediately, background refresh if stale (>30s)
  //
  // DOM structure:
  //   div.repo-group[data-repo-cwd]
  //     div.repo-header > span.expand-icon + span.repo-name + button.remove-btn
  //     div.repo-sessions (hidden when collapsed)
  //
  // Return { getElement(), isExpanded(), setExpanded(bool), refresh(), highlightSession(id) }
}
```

**State transitions:**
- Click `.repo-header` → toggle expand/collapse
- Click `.remove-btn` → call `DELETE /api/repos` → parent handles removal
- Click `[New Session]` → call `POST /api/sessions` → `onSessionIdSelected(result.sessionId)`
- Lazy fetch: `GET /api/sessions?cwd=${encodeURIComponent(cwd)}` on first expand

#### 2.4 Repo Browser Component
- [x] **Create** `public/app/ui/sidebar/repo-browser.js` (~130 lines)

```typescript
// Factory function interface:
export function createRepoBrowser({ api, onSelect, onCancel }) {
  // Modal overlay for file system browsing
  // 
  // DOM structure (appended to body or container):
  //   div.repo-browser-overlay
  //     div.repo-browser
  //       div.repo-browser-header
  //         span.repo-browser-path (breadcrumb: home > user > projects)
  //         button.repo-browser-close (✕)
  //       div.repo-browser-entries
  //         div.repo-browser-entry[data-path] × N (directories bold, files dimmed)
  //       div.repo-browser-footer
  //         input.repo-browser-input (manual path)
  //         button.repo-browser-select (Select)
  //         button.repo-browser-cancel (Cancel)
  //
  // Navigation:
  //   open(startPath) → GET /api/fs/ls?path=... → render entries
  //   Click directory entry → navigate into (new GET /api/fs/ls)
  //   Click breadcrumb segment → navigate up
  //   Type path in input + Enter → navigate to typed path
  //   Click Select → onSelect(currentPath) — only directories selectable
  //   Click Cancel / ✕ / Escape → onCancel()
  //   Error display: show inline error, allow navigating elsewhere
  //
  // Return { open(startPath?), close(), getElement() }
}
```

**Pattern to follow**: The modal should use a similar overlay pattern to the existing `.sidebar-overlay` (fixed positioning, z-index, background overlay).

### Implementation Details

- All files use `export function createXxx({ ... })` pattern with closure state
- Import shared utilities: `formatRelativeTime` from a shared location or inline the function
- `formatRelativeTime()` is currently defined inside `sidebar.js:1-18` — extract to `public/app/core/time.js` as a shared utility before creating sub-modules
- Each factory returns `{ getElement(), ...methods }` — plain objects with closures
- No DOM manipulation outside of each component's own elements
- Event listeners attached in factory body, cleaned up by parent orchestrator

### Success Criteria

#### Automated Verification
- [ ] No syntax errors: each file loads as ES module (test with `bun -e "import './public/app/ui/sidebar/session-row.js'"`)
- [ ] TDD tests from Test Phase now PASS: `bun test`

#### Manual Verification
- [ ] Each factory function is importable without errors
- [ ] `createSessionRow()` returns an object with `getElement()` that returns an `HTMLElement`-shaped object
- [ ] No imports from the old `sidebar.js` in any new file

---

## Phase 3: Orchestrator + Wiring + Migration

> ⚠️ Execute via `/implement`. This phase connects everything and removes the old sidebar.

### Changes

#### 3.1 Sidebar Orchestrator
- [x] **Create** `public/app/ui/sidebar/index.js` (~150 lines)

```typescript
// Factory function interface:
export function createSidebar({
  sessionsList, sidebar, sidebarOverlay,
  btnNew, btnAddRepo, btnRefresh,
  api, clientId,
  onNotice, getActiveSessionId, onSelectSession, onSessionIdSelected,
}) {
  // State: isOpen, expandedRepos (Set<string>), repoGroups (Map<cwd, RepoGroupApi>)
  //        homeDir, sidebarRepos, activeSessionComponent
  //
  // Init: create repoBrowser lazily (on first Add Repo click)
  //
  // refresh():
  //   1. GET /api/sidebar → store homeDir, repos
  //   2. Clear sessionsList (preserve scrollTop)
  //   3. Render active session zone (if any active sessions)
  //   4. Render repo groups (create new or update existing)
  //   5. Re-expand previously expanded repos (with background refresh)
  //   6. Restore scrollTop
  //
  // setOpen(open): toggle .open class on sidebar + overlay
  // toggleOpen(): setOpen(!isOpen)
  //
  // btnNew click:
  //   - 0 repos → onNotice("Add a repo first")
  //   - 1 repo → createSession(repo)
  //   - 2+ repos → show repo picker overlay
  //
  // btnAddRepo click → open repo browser
  // btnRefresh click → refresh()
  //
  // createSession(cwd):
  //   POST /api/sessions { clientId, cwd }
  //   → onSessionIdSelected(result.sessionId)
  //   → setOpen(false)
  //
  // removeRepo(cwd):
  //   DELETE /api/repos { cwd }
  //   → refresh()
  //
  // Return { setOpen, toggleOpen, refresh, highlightSessionRow }
}
```

#### 3.2 Extract Shared Utilities
- [x] **Create** `public/app/core/time.js` — Extract `formatRelativeTime()` from `sidebar.js:1-18`
- [x] **Create** `public/app/core/html.js` — Extract `escapeHtml()` from `sidebar.js:32-38`

These are pure utility functions currently trapped inside `sidebar.js`. Other sub-modules need them.

#### 3.3 Update HTML Structure
- [x] `public/index.html` — Update sidebar header (lines 67-74):

```html
<nav class="sidebar">
  <div class="sidebar-hdr">
    <div class="sidebar-actions">
      <button class="new-btn" id="btn-new">+ New</button>
      <button class="new-btn" id="btn-add-repo">+ Repo</button>
      <button class="new-btn" id="btn-refresh">↻</button>
    </div>
  </div>
  <div class="sessions" id="sessions-list"></div>
</nav>
```

Changes:
- Remove `<div class="sidebar-label" id="sidebar-label">Active</div>` (line 54)
- Change button IDs: `btn-sidebar-left` → `btn-new`, `btn-sidebar-right` → `btn-add-repo`
- Add `btn-refresh` button
- Remove `sidebarLabel` element entirely

#### 3.4 Update Main Wiring
- [x] `public/app/main.js` — Update sidebar creation (lines 24-26, 273-285, 323):

1. **Remove** old DOM refs (lines 24-26): `sidebarLabel`, `btnSidebarLeft`, `btnSidebarRight`
2. **Add** new DOM refs:
   ```javascript
   const btnNew = document.getElementById("btn-new");
   const btnAddRepo = document.getElementById("btn-add-repo");
   const btnRefresh = document.getElementById("btn-refresh");
   ```
3. **Change** import path: `./ui/sidebar` → `./ui/sidebar/index.js`
4. **Update** `createSidebar()` call — remove old params, add new params
5. **Remove** `setInterval` polling (line 323)
6. **Add** visibility-based refresh:
   ```javascript
   document.addEventListener("visibilitychange", () => {
     if (!document.hidden) void sidebarCtrl.refresh();
   });
   ```
7. **Keep** initial `void sidebarCtrl.refresh()` call

#### 3.5 Update CSS
- [x] `public/styles.css` — Add new styles and remove obsolete ones:

**Remove:**
- `.sidebar-label` rule (lines 167-172)

**Add:**
```css
/* Repo group styles */
.repo-group { }
.repo-header {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 8px; border-radius: 6px; cursor: pointer;
  font-size: 11px; color: #808080;
  transition: background .1s;
}
.repo-header:hover { background: #1e1e28; }
.repo-header .expand-icon {
  font-size: 9px; transition: transform .15s;
  display: inline-block;
}
.repo-header.expanded .expand-icon { transform: rotate(90deg); }
.repo-header .repo-name {
  flex: 1; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.repo-header .remove-btn {
  display: none; background: none; border: none;
  color: #505050; cursor: pointer; font-size: 10px;
  padding: 2px 4px;
}
.repo-header:hover .remove-btn { display: inline; }
.repo-header .remove-btn:hover { color: #cc6666; }
.repo-sessions {
  padding-left: 12px;
  display: flex; flex-direction: column; gap: 1px;
}

/* Active session zone */
.active-zone-label {
  font-size: 10px; text-transform: uppercase;
  letter-spacing: .08em; color: #505050;
  padding: 4px 8px 2px;
}

/* Session running dot */
.si-run-dot {
  width: 6px; height: 6px;
  background: #b5bd68; border-radius: 50%;
  display: inline-block; margin-right: 4px;
  vertical-align: middle;
}

/* New session button (inline per repo) */
.add-session-btn {
  background: none; border: none; color: #505050;
  cursor: pointer; padding: 2px 6px; font-size: 14px; line-height: 1;
}
.add-session-btn:hover { color: #d4d4d4; }

/* Repo browser modal */
.repo-browser-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,.6); z-index: 50;
  display: flex; align-items: center; justify-content: center;
}
.repo-browser {
  background: #12121a; border: 1px solid #2a2a32;
  border-radius: 8px; width: min(400px, 90vw); max-height: 70vh;
  display: flex; flex-direction: column;
}
.repo-browser-header {
  padding: 10px 12px; border-bottom: 1px solid #2a2a32;
  font-size: 11px; color: #808080;
}
.repo-browser-entries {
  flex: 1; overflow-y: auto; padding: 6px;
}
.repo-browser-entry {
  padding: 4px 8px; border-radius: 4px; cursor: pointer;
  font-size: 12px; color: #d4d4d4;
}
.repo-browser-entry:hover { background: #1e1e28; }
.repo-browser-entry.is-dir { font-weight: 600; }
.repo-browser-entry.is-file { color: #505050; cursor: default; }
.repo-browser-footer {
  padding: 8px 12px; border-top: 1px solid #2a2a32;
  display: flex; gap: 6px;
}
.repo-browser-input {
  flex: 1; background: #1e1e28; border: 1px solid #2a2a32;
  border-radius: 4px; color: #d4d4d4; padding: 4px 8px;
  font-size: 12px; font-family: monospace;
}

/* Repo picker overlay */
.repo-picker {
  padding: 6px; margin-bottom: 6px;
  background: #1e1e28; border: 1px solid #2a2a32;
  border-radius: 6px;
}
.repo-picker-item {
  padding: 4px 8px; border-radius: 4px; cursor: pointer;
  font-size: 12px; color: #d4d4d4;
}
.repo-picker-item:hover { background: #252530; }

/* Loading state */
.sidebar-loading {
  text-align: center; padding: 20px 0;
  color: #505050; font-size: 11px;
}
```

#### 3.6 Delete Old Sidebar
- [x] **Delete** `public/app/ui/sidebar.js` — Replaced by `sidebar/` directory

### Implementation Details

- Import order in `index.js`:
  ```javascript
  import { formatRelativeTime } from "../core/time.js";
  import { escapeHtml } from "../core/html.js";
  import { shouldShowSessionInLists } from "../core/session-filter.js"; // or inline
  import { createSessionRow } from "./session-row.js";
  import { createActiveSession } from "./active-session.js";
  import { createRepoGroup } from "./repo-group.js";
  import { createRepoBrowser } from "./repo-browser.js";
  ```
- `shouldShowSessionInLists()` extracted from `sidebar.js:40-47` — shared filter logic
- `abbreviateCwd(cwd, homeDir)` defined in `index.js` as a local pure function
- Repo groups are created during `renderSidebar()` and cached in `repoGroups` Map
- On refresh: destroy repo groups that are no longer in the repo list, create new ones
- `highlightSessionRow(sessionId)`: iterate all repo groups, call `highlightSession(sessionId)` on each

### Success Criteria

#### Automated Verification
- [x] `bun test` passes
- [x] No old sidebar references: `grep -rn "from.*ui/sidebar.js\|ui/sidebar'" public/app/` returns nothing (should reference `sidebar/index.js`)
- [x] No mode state machine: `grep -n "setMode\|mode.*=.*active\|mode.*=.*repos" public/app/ui/sidebar/index.js` returns nothing
- [x] No setInterval: `grep -n "setInterval" public/app/main.js` returns nothing (only working interval at line 162)
- [x] No window.prompt for sessions: `grep -n "prompt" public/app/ui/sidebar/index.js` returns nothing (repo browser replaces it)

#### Manual Verification
- [ ] Open sidebar → see repo headers with abbreviated paths (~/projects/pi-mobile)
- [ ] Active session (if any) pinned at top with green dot
- [ ] Click repo header → sessions load below with lazy fetch
- [ ] Click session row → session opens, sidebar closes on mobile
- [ ] Click `+` on repo header → new session created → switches to it
- [ ] Click `+ Repo` → file system browser modal opens → navigate directories → Select → repo added
- [ ] Hover repo header → see remove button (×) → click → repo removed from list
- [ ] Click refresh → sidebar reloads, expanded repos re-fetch
- [ ] Switch browser tab away → back → sidebar auto-refreshes
- [ ] Mobile: sidebar slides in/out, all interactions work on narrow viewport
- [ ] No console errors in DevTools

---

## Phase 4: E2E Tests + Integration Verification

> This is the REFACTOR phase of TDD. All tests are green.
> Improve code quality and add E2E coverage with the safety net of passing tests.

### Changes

#### 4.1 E2E Test Suite
- [ ] **Create** `tests/e2e/sidebar.e2e.js` — Playwright visual regression tests for sidebar

Test scenarios:
1. **Sidebar renders repo list**: Open sidebar → verify repo headers visible
2. **Expand repo loads sessions**: Click repo header → verify session rows appear → verify only 1 API call for that repo
3. **Active session displayed**: With running session → verify pinned at top with green dot
4. **Create new session**: Click `+` on repo → verify session created → verify sidebar closes → verify new session active
5. **Add repo via browser**: Click `+ Repo` → navigate file system → Select → verify repo added
6. **Remove repo**: Hover repo → click remove → verify repo removed, sessions untouched
7. **Mobile overlay**: At mobile viewport → verify sidebar overlay works, slide animation

#### 4.2 Integration Smoke Tests
- [ ] Verify all backend endpoints with curl:
  ```bash
  # Full sidebar data
  curl -s http://localhost:3456/api/sidebar | jq .
  
  # Sessions per repo
  CWD=$(curl -s http://localhost:3456/api/sidebar | jq -r '.repos[0].cwd')
  curl -s "http://localhost:3456/api/sessions?cwd=$CWD" | jq '.sessions | length'
  
  # File system listing
  curl -s "http://localhost:3456/api/fs/ls?path=/home/ubuntu" | jq '.entries | length'
  
  # Path traversal blocked
  curl -s -o /dev/null -w "%{http_code}" "http://localhost:3456/api/fs/ls?path=/etc"
  # Expected: 403
  ```

#### 4.3 Cleanup
- [ ] Remove any temporary scaffolding or debug logging
- [ ] Verify no dead code in old files:
  ```bash
  grep -rn "sidebarLabel\|btn-sidebar-left\|btn-sidebar-right\|setMode\|updateHeader" public/ src/
  # Expected: no matches
  ```
- [ ] Update README.md if sidebar usage instructions exist
- [ ] Run full test suite: `bun test && bun run test:e2e`

### Success Criteria

#### Automated Verification
- [ ] `bun test` passes (all unit/golden tests)
- [ ] `bun run test:e2e` passes (all Playwright tests including new sidebar tests)
- [ ] `bunx tsc --noEmit` passes (type-check clean)

#### Manual Verification
- [ ] Full sidebar flow works: open → see repos → expand → create session → switch → collapse → refresh
- [ ] File system browser: navigate deep paths, permission-denied directories, breadcrumb navigation
- [ ] Remove repo: verify repos.json updated, session files still on disk
- [ ] Mobile: all interactions work on iPhone-sized viewport
- [ ] Performance: expanding repo with 50+ sessions renders without lag
- [ ] Cache: collapse + re-expand same repo is instant

---

## Risk Assessment

- **Risk 1: `SessionManager.list(cwd)` API mismatch**: The SDK's `list(cwd)` method may not exist or have a different signature. → **Mitigation**: Verify SDK API in `node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts` before implementing Phase 1. Research doc confirms it exists: `list(cwd: string, sessionDir?: string): Promise<SessionInfo[]>`.

- **Risk 2: File system browsing security**: Path traversal attacks via symlink resolution or encoded paths. → **Mitigation**: `isPathAllowed()` must use `fs.realpath()` before boundary check. Test with adversarial paths in unit tests. Cap entries at 500.

- **Risk 3: Large session lists**: Expanding a repo with many sessions (100+) could be slow. → **Mitigation**: `SessionManager.list(cwd)` already does the heavy lifting. Frontend rendering is simple DOM. If needed, add virtual scrolling later (out of scope for now).

- **Risk 4: Race condition on rapid expand/collapse**: User clicks multiple repos quickly. → **Mitigation**: `setExpanded()` should cancel previous in-flight fetch for the same repo. Use a simple fetch ID or abort controller pattern.

- **Risk 5: `listAll()` still called by existing endpoints**: `GET /api/repos` and `GET /api/sessions` (no cwd) still call `listAll()` for backward compatibility. → **Mitigation**: These remain untouched. Only the sidebar flow avoids `listAll()`. No regression risk.

## Rollback Plan

Each phase is independently revertable:
- **Phase 1**: Remove new routes and methods — existing endpoints untouched
- **Phase 2**: Delete new files — no existing files modified
- **Phase 3**: This is the critical migration phase. Rollback = restore `sidebar.js`, revert `main.js`, `index.html`, `styles.css` changes. All via `git checkout -- <files>`.
- **Phase 4**: Only test files added — safe to remove

The safest rollback point is before Phase 3 (the wiring phase). Phases 1 and 2 add new code without breaking existing functionality.

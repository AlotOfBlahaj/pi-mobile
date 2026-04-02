---
date: 2026-04-02
author: claude
status: draft
tags: [design, sidebar, frontend, backend, navigation, lazy-loading]
---

# Design: Sidebar Refactoring — Flat Lazy-Loaded Navigation

## Context

The current sidebar uses a three-mode state machine (`active` | `repos` | `repoSessions`) that replaces the entire content area on each mode switch. Each mode fetches data independently, and navigating repo → sessions → back requires full re-fetches. This creates friction when switching between repos frequently.

**Goal**: Migrate to a flat, collapsible-tree sidebar inspired by superset.sh, where all repos are visible at once, sessions are lazy-loaded per-repo on expand, and the active session is pinned to the top.

**Referenced inputs**:
- [Requirements Summary](../../question.md)
- [Research: Current Architecture](../research/2026-04-02-sidebar-refactoring-research.md)

## Requirements

### Functional
- All repos listed in sidebar with expand/collapse
- Active session pinned to top (read-only display)
- Lazy-load sessions only when repo is expanded
- Inline "New Session" creation per repo
- "Add Repo" with file system tree browser + manual path input
- "Remove Repo" (list-only removal, no disk delete)

### Non-Functional
- Expanding a repo must not load data for other repos
- No full sidebar re-render on expand/collapse — only the affected repo section
- Smooth mobile experience (overlay sidebar with slide animation, preserved)
- Existing polling interval (5s) continues for active session updates

### Constraints
- **Cannot change**: Session file format (JSONL, managed by upstream SDK), SSE event system, `SessionManager` API
- **Must preserve**: Factory function + DI pattern, existing API response shapes (backward-compatible extensions OK), dark theme and CSS conventions
- **Tech stack locked**: Vanilla JS (no framework), Bun server, REST + SSE

## Design Options

### Option A: Single-File Rewrite of `sidebar.js`

**Description**: Replace the entire `createSidebar()` implementation with a new flat-tree renderer. One file, ~400-500 lines.

**Pros**:
- Minimal file changes — easy to review in one PR
- No module wiring complexity
- Follows the current single-file convention

**Cons**:
- Single file becomes too large for comfort (~500 lines)
- File system browser UI would bloat it further
- Harder to unit test individual pieces
- Mixing concerns: tree rendering, expand/collapse state, API calls, file browser

**Complexity**: Medium
**Risk**: Medium — large file makes future changes harder

### Option B: Multi-Module Sidebar with Sub-Components

**Description**: Split the sidebar into focused modules under `public/app/ui/sidebar/`, each a factory function with DI. The main `createSidebar()` becomes an orchestrator.

```
public/app/ui/sidebar/
├── index.js              ← orchestrator, wires sub-components
├── active-session.js     ← pinned active session display
├── repo-group.js         ← single repo row + expand/collapse + session list
├── repo-browser.js       ← file system tree modal for Add Repo
└── session-row.js        ← single session item rendering (shared)
```

**Pros**:
- Each module < 100 lines, single responsibility
- Testable in isolation (pure DOM factories)
- File system browser isolated — can be developed/tested independently
- Follows existing factory function + DI pattern at a finer granularity
- New devs can find code quickly by purpose

**Cons**:
- More files to create and wire up
- Need a barrel export or import convention
- Slightly more complex wiring in the orchestrator

**Complexity**: Medium
**Risk**: Low — modules are small, individually verifiable

### Option C: State-Driven with Tiny Reactive Store

**Description**: Introduce a minimal reactive store (e.g., a proxy-based observable) that sidebar components subscribe to. State changes trigger targeted DOM updates.

**Pros**:
- Decouples state from rendering
- Granular updates without manual DOM diffing
- Future-proof for more complex UI state

**Cons**:
- **Breaks existing convention** — no reactive store anywhere in the codebase
- Adds a new pattern for 2-3 developers to learn
- Over-engineering for a sidebar with ~5 state variables
- Risk of scope creep (store grows, becomes a framework)

**Complexity**: High
**Risk**: High — new paradigm, maintenance burden

## Recommended Approach

**Option B: Multi-Module Sidebar with Sub-Components**

This balances the need for modularity (the new sidebar is significantly more complex than the current 304-line file) with consistency (factory functions + DI are already the established pattern). The file system browser alone justifies isolation — it's a greenfield feature with distinct concerns (tree rendering, pagination of large directories, path resolution).

**Key trade-off accepted**: More files to manage, but each file is small and has a clear owner. The orchestrator (`index.js`) is the only place that needs to understand the full picture.

**Why not Option A**: The file system tree browser is a substantial new feature (~100-150 lines). Embedding it in a single 500-line sidebar file violates the "high cohesion, low coupling" principle. Adding Remove Repo + lazy loading + inline creation + file browser all into one file would create a maintenance burden.

**Why not Option C**: Introducing a reactive store for one component is over-engineering. The current closure-based state pattern works well for the sidebar's complexity level. If the app grows significantly, a store can be introduced later as a cross-cutting refactor.

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────┐
│ createSidebar()  ← orchestrator (index.js)      │
│                                                  │
│  ┌─────────────────────────────────────────────┐│
│  │ createActiveSession()                       ││
│  │  └─ .active-sessions pinned to top (list)   ││
│  │     ● session-abc · first prompt · 10:32    ││
│  │     ● session-xyz · another task · 09:15    ││
│  │       (viewed session gets .active highlight)││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  ┌─────────────────────────────────────────────┐│
│  │ createRepoGroup({ cwd, expanded }) × N      ││
│  │  ├─ .repo-header ▼ repo-a                   ││
│  │  ├─ .repo-sessions (lazy, only if expanded) ││
│  │  │   ├─ createSessionRow() × M              ││
│  │  │   └─ [+ New Session] button              ││
│  │  └─ (collapsed: just .repo-header ▶ repo-b) ││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  ┌─────────────────────────────────────────────┐│
│  │ [+ Add Repo] button                         ││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  ┌─────────────────────────────────────────────┐│
│  │ createRepoBrowser()  ← modal overlay        ││
│  │  ├─ path breadcrumb + input                 ││
│  │  ├─ directory listing (from API)            ││
│  │  └─ [Select] / [Cancel]                     ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

### Data Flow: Lazy Loading

```
User opens sidebar
  → createSidebar() fetches GET /api/repos (repo list, sorted by recent activity)
  → Renders repo headers (collapsed)
  → Fetches GET /api/active-sessions (for pinned active session list — may be 0..N)

User clicks repo header to expand
  → createRepoGroup() calls GET /api/sessions?cwd=<repo-path>
  → Renders session rows with metadata (firstMessage, modified, isRunning)
  → Stores expanded state locally (no API call)

User clicks another repo header
  → Previous repo collapses (DOM hidden, data kept in memory)
  → New repo expands, fetches if not previously loaded
  → Only one API call for the newly expanded repo

User collapses then re-expands same repo
  → Cached data rendered immediately
  → If cache is older than 30s, background fetch fires
  → DOM silently updates when fresh data arrives
```

### Data Flow: Active Session

```
Polling (every 5s, existing behavior)
  → GET /api/active-sessions
  → createActiveSession() updates pinned section with ALL running sessions
  → The session matching getActiveSessionId() gets .active class highlight
  → If an expanded repo contains a running session, that row also updates

User clicks any pinned running session
  → onSelectSession() callback fires (same as clicking a session row)
  → Sidebar closes on mobile, session content loads
```

### Key Interfaces

#### Backend API Additions

```typescript
// --- Remove Repo ---

// DELETE /api/repos
// Request:
interface RemoveRepoRequest {
  cwd: string;
}
// Response: 204 No Content
// Removes cwd from repos.json only. Does NOT delete session files or disk data.
// Sessions for this repo remain discoverable via SessionManager.listAll().

// --- File System Browsing ---

// GET /api/fs/ls?path=/home/user
// Response:
interface FsEntry {
  name: string;
  path: string;       // absolute path
  isDirectory: boolean;
}
interface FsListResponse {
  path: string;       // resolved absolute path
  entries: FsEntry[]; // sorted: directories first, then files, alphabetical
}
// Only lists one level deep. Client navigates by calling again with subdirectory path.
// Security: path must be under the server's allowed roots (home dir + registered repos)
// Returns 403 for paths outside allowed scope.
```

#### Backend API Changes (Existing, No Breaking Changes)

```typescript
// GET /api/repos — MODIFIED: response now includes lastActivity timestamp for sort
// Response:
interface ApiRepoEntry {
  cwd: string;
  lastActivity: string | null;  // ISO 8601 of most recent session modified time, null if no sessions
}
// Repos sorted by lastActivity descending (most recent first).
// Repos with null lastActivity sort to the end, alphabetical among themselves.

// GET /api/sessions?cwd=... — no change needed
// Already supports per-repo filtering, returns ApiSessionSummary[]

// GET /api/active-sessions — no change needed
// Already returns running sessions with isRunning=true
```

#### Frontend Sub-Component Interfaces

```typescript
// --- createSidebar (orchestrator) ---
// public/app/ui/sidebar/index.js

interface SidebarConfig {
  // DOM elements (same as current, injected)
  sessionsList: HTMLElement;
  sidebar: HTMLElement;
  sidebarOverlay: HTMLElement;
  sidebarLabel: HTMLElement;
  btnSidebarLeft: HTMLElement;
  btnSidebarRight: HTMLElement;
  // Services
  api: ApiService;
  clientId: string;
  // Callbacks
  onNotice: (msg: string) => void;
  getActiveSessionId: () => string | null;
  onSelectSession: (session: ApiSessionSummary) => void;
  onSessionIdSelected: (sessionId: string) => void;
}

interface SidebarApi {
  setOpen(open: boolean): void;
  toggleOpen(): void;
  refresh(): Promise<void>;
  highlightSessionRow(sessionId: string): void;
}

// --- createActiveSession ---
// public/app/ui/sidebar/active-session.js

interface ActiveSessionConfig {
  container: HTMLElement;  // DOM slot above repo list
  api: ApiService;
  getActiveSessionId: () => string | null;
  onSelectSession: (session: ApiSessionSummary) => void;
}

interface ActiveSessionApi {
  update(): Promise<void>;  // re-fetch active sessions, update display
  getElement(): HTMLElement;
  // Renders ALL running sessions as a list (not just one).
  // The session matching getActiveSessionId() gets the .active highlight.
}

// --- createRepoGroup ---
// public/app/ui/sidebar/repo-group.js

interface RepoGroupConfig {
  cwd: string;
  api: ApiService;
  clientId: string;
  getActiveSessionId: () => string | null;
  onSelectSession: (session: ApiSessionSummary) => void;
  onSessionIdSelected: (sessionId: string) => void;
  onNotice: (msg: string) => void;
}

interface RepoGroupApi {
  getElement(): HTMLElement;
  isExpanded(): boolean;
  setExpanded(expanded: boolean): Promise<void>;  // triggers lazy load if expanding
  refresh(): Promise<void>;  // re-fetch sessions if expanded, no-op if collapsed
  highlightSession(sessionId: string): void;
}

// --- createSessionRow ---
// public/app/ui/sidebar/session-row.js

interface SessionRowConfig {
  session: ApiSessionSummary;
  isActive: boolean;
  onSelect: (session: ApiSessionSummary) => void;
}

interface SessionRowApi {
  getElement(): HTMLElement;
  update(session: ApiSessionSummary): void;  // update in place
}

// --- createRepoBrowser ---
// public/app/ui/sidebar/repo-browser.js

interface RepoBrowserConfig {
  api: ApiService;
  onSelect: (cwd: string) => void;  // user confirmed a directory
  onCancel: () => void;
}

interface RepoBrowserApi {
  open(startPath?: string): void;   // show the browser
  close(): void;
  getElement(): HTMLElement;
}
```

### Data Model

**No database changes.** All data is file-based.

**`repos.json` changes**: The existing `repos.json` format (JSON array of path strings) does not need to change. Remove Repo simply removes the entry from the array and writes it back.

**No new persisted state.** Expand/collapse state is ephemeral (lost on page refresh), which is the correct default — users don't expect sidebar tree state to persist.

### Error Handling

| Scenario | Behavior |
|----------|----------|
| `GET /api/sessions?cwd=...` fails (repo expand) | Show "Failed to load sessions" inline within the repo group, with a retry button. Keep repo expanded so user sees the error. Do NOT collapse back. |
| `GET /api/fs/ls` fails (repo browser) | Show error in browser modal. User can navigate up or type a different path. |
| `POST /api/sessions` fails (new session) | Show error via `onNotice` callback (existing toast pattern). Do NOT close the sidebar. |
| `DELETE /api/repos` fails (remove repo) | Show error via `onNotice`. Repo remains in list. |
| Repo expanded, then server becomes unreachable | Stale data shown. Next refresh attempt will fail — show subtle "offline" indicator in repo header. |
| Session list is empty for a repo | Show "No sessions" message + "New Session" button inline. |
| File system browser: permission denied path | API returns 403 → show "Access denied" in browser, allow navigating to a different path. |

### Expand/Collapse State Machine (per repo)

```
COLLAPSED ──click──→ LOADING ──success──→ EXPANDED
                        │                    │
                        │ fail               │ click
                        ↓                    ↓
                     ERROR              COLLAPSED
                        │
                        │ retry
                        ↓
                     LOADING

EXPANDED:
  - Sessions in memory, DOM visible
  - refresh() re-fetches and updates rows
  - Click header → COLLAPSED (data kept in memory)

COLLAPSED:
  - DOM hidden (display: none on .repo-sessions)
  - Data retained in memory for fast re-expand
  - refresh() is no-op
  - Click header → EXPANDED (use cached data, skip LOADING)
  - If data stale (> polling interval), background refresh
```

## Impact Analysis

### Files to Modify
- `src/session-runtime.ts` — Add `removeRepo()` method, modify `listRepos()` to return `ApiRepoEntry[]` with `lastActivity` and sort by recency
- `src/server.ts` — Add `DELETE /api/repos` route, add `GET /api/fs/ls` route
- `src/types.ts` — Add `FsEntry`, `FsListResponse`, `ApiRepoEntry` types
- `public/app/main.js` — Update sidebar import path (`./ui/sidebar` → `./ui/sidebar/index.js`), update wiring if `SidebarApi` changes
- `public/index.html` — Minor: update sidebar DOM to add active-session slot
- `public/styles.css` — Add styles for repo groups, active session pin, repo browser modal

### New Files
- `public/app/ui/sidebar/index.js` — Orchestrator (~150 lines)
- `public/app/ui/sidebar/active-session.js` — Active session display (~60 lines)
- `public/app/ui/sidebar/repo-group.js` — Repo with expand/collapse + session list (~120 lines)
- `public/app/ui/sidebar/session-row.js` — Session row rendering (~50 lines)
- `public/app/ui/sidebar/repo-browser.js` — File system tree modal (~130 lines)

### Files to Delete
- `public/app/ui/sidebar.js` — Replaced by the `sidebar/` directory

### Dependencies
- No new npm dependencies
- No version changes to existing dependencies

### Breaking Changes
- None. All existing API endpoints remain unchanged. New endpoints are additive.
- Frontend: `createSidebar()` function signature changes (DOM structure differs), but it's only called from `main.js` which we control.

### Migration Needed
- None. No persisted state migration required.

## Security Considerations

### File System Browsing (`GET /api/fs/ls`)

**Path Traversal Risk**: The endpoint must validate that the requested path is within allowed boundaries.

**Allowed paths**:
1. User's home directory (`~`)
2. Any currently registered repo path
3. Any path that is a parent of a registered repo

**Implementation**:
```typescript
function isPathAllowed(requestedPath: string, homeDir: string, repos: string[]): boolean {
  const resolved = path.resolve(requestedPath);
  // Must be under home dir
  if (!resolved.startsWith(homeDir)) return false;
  // Block hidden directories (optional, configurable)
  // Block /etc, /proc, /sys, etc.
  return true;
}
```

**Additional measures**:
- Symlink resolution: Use `fs.realpath()` before checking boundaries
- Rate limiting: Consider per-client rate limit on fs/ls calls
- No write operations: The endpoint is read-only (list only)

### Remove Repo (`DELETE /api/repos`)

**No data destruction**: Only removes from `repos.json`. Session files and disk contents are untouched. This is explicitly a "hide from list" operation.

**Auth**: Existing Bearer token auth applies (all `/api/*` routes already check auth).

## Testing Strategy

### Unit Tests (Bun Test)

**Backend**:
- `removeRepo()`: Add a repo, remove it, verify repos.json no longer contains it, verify session files still exist
- `GET /api/fs/ls`: Test with valid path, invalid path, path outside home dir, symlink
- Path validation: Test traversal attempts (`../../etc/passwd`, `/proc/self`, etc.)

**Frontend** (pure function tests — DOM factories return elements):
- `createSessionRow({ session: dirtyData })`: Verify rendering with missing fields, very long firstMessage, special characters
- `createRepoGroup()`: Verify expand/collapse state transitions
- `createRepoBrowser()`: Verify path assembly, directory navigation

### Integration Tests (Playwright E2E)

**Critical paths**:
1. Open sidebar → see repos → expand one → see sessions → click session → content loads
2. Open sidebar → expand repo → create new session → auto-switches to new session
3. Open sidebar → Add Repo → browse file system → select directory → repo appears in list
4. Open sidebar → expand repo → remove repo → repo disappears, sessions untouched
5. Active session list shows ALL running sessions at top, with the viewed one highlighted
6. Expand repo A → expand repo B → only B's sessions fetched (verify network requests)
7. Repo sort order: most recently active repo appears first

**Verification**: Use Playwright to count API calls per action, confirming lazy loading (no over-fetching).

### Manual Testing Checklist
- [ ] Sidebar opens/closes smoothly on mobile (slide animation preserved)
- [ ] Expanding repo with 50+ sessions renders without lag
- [ ] Collapsing and re-expanding same repo is instant (cached)
- [ ] File system browser handles deep paths (>10 levels)
- [ ] File system browser handles permission-denied directories
- [ ] Remove Repo works when repos.json has only one entry
- [ ] Active session updates correctly during streaming (isRunning badge)

## Implementation Phases

### Phase 1: Backend Foundation
- Add `DELETE /api/repos` endpoint
- Add `GET /api/fs/ls` endpoint with path validation
- Add corresponding types to `types.ts`
- Unit tests for both endpoints

### Phase 2: Frontend Modules
- Create `sidebar/` directory with all sub-components
- Implement `session-row.js`, `repo-group.js`, `active-session.js`
- Implement orchestrator `index.js`
- Remove old `sidebar.js`
- Update `main.js` wiring
- Update `index.html` DOM structure
- Update `styles.css` for new structure

### Phase 3: File System Browser
- Implement `repo-browser.js`
- Add modal overlay to `index.html`
- Add browser styles to `styles.css`
- Wire into orchestrator

### Phase 4: Polish & Testing
- E2E tests for all critical paths
- Verify mobile experience
- Verify polling + active session updates
- Performance testing with many repos/sessions

## Open Questions

### Resolved Decisions

1. **Multiple running sessions → Show all pinned at top**. If multiple sessions are running, display all of them in the pinned section as a list. The session the user is currently viewing gets a visual highlight (`.active` class). The active session section is not a single-item slot — it's a scrollable list capped at ~5 items.

2. **Stale cache → Show immediately + background refresh**. When a collapsed repo is re-expanded and has cached data older than 30s, render the cached data immediately for perceived performance, then trigger a background fetch and silently update the DOM when fresh data arrives. A subtle spinner or timestamp can indicate "refreshing…".

3. **Repo sort → Recent activity**. Repos are sorted by most recent session activity (newest `modified` timestamp among their sessions), not alphabetically. This puts the user's most active repos at the top. Repos with no sessions sort to the bottom. Sort is re-evaluated after each data fetch.

### Deferred Decisions

4. **Max directory entries for file browser**: Should `GET /api/fs/ls` cap the number of entries returned (e.g., 500) to prevent rendering lag in large directories? Recommendation: Yes, cap at 500 with a "too many entries" indicator.

5. **Expand/collapse animation**: Should expanding a repo group have a slide-down animation, or instant? Recommendation: Instant for now — CSS animations can be added later without architecture changes.

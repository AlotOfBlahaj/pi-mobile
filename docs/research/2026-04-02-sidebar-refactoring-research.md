---
date: 2026-04-02T03:41:18+00:00
researcher: claude
git_commit: 93ea2ce
branch: main
topic: "Sidebar Refactoring Research — Current Architecture & Open Questions"
tags: [research, codebase, sidebar, session, repo-management, architecture, frontend, backend]
status: complete
---

# Research: Sidebar Refactoring — Current Architecture & Open Questions

**Date**: 2026-04-02T03:41:18+00:00
**Git Commit**: 93ea2ce
**Branch**: main

## Research Question

Research the current sidebar implementation to answer open questions for the sidebar refactoring project (migrating from three-mode navigation to a flat, lazy-loaded, superset.sh-style sidebar). Specifically:

1. Where is session metadata (first prompt, timestamps, status) stored?
2. What is the session file format?
3. Where is the current three-mode rendering logic?
4. How is "Active Session" running status determined?
5. Does the tech stack have file system access APIs for Add Repo tree browsing?

## Summary

### Key Findings

1. **Session files are JSONL format** — each line is a JSON entry (header, messages, model changes, etc.). Stored at `~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<sessionId>.jsonl`.

2. **First prompt is NOT a stored field** — it's computed dynamically by `computeFirstMessage()` which scans messages for the first `role="user"` entry (`src/session-runtime.ts:53-62`). This computation happens at list time, meaning lazy-loading session metadata for a single repo still requires parsing messages.

3. **Session running status is runtime-only** — `isRunning` is determined by checking `PiWebRuntime.runningById` Map in memory, NOT stored on disk (`src/session-runtime.ts:168`). Sessions that are in the running Map are "running"; everything else loaded from disk is "stopped".

4. **The current sidebar is a three-MODE system** (not three-layer): `active` | `repos` | `repoSessions`. Each mode shows a different list in the same `<div id="sessions-list">`. Mode switching replaces the entire content area (`public/app/ui/sidebar.js:61-89`).

5. **No file system browsing capability exists**. The current Add Repo flow uses `window.prompt()` for the user to type an absolute path (`public/app/ui/sidebar.js:193-202`). File System Access API is not used. A new backend endpoint would be needed to serve directory tree data.

6. **No Remove Repo API exists** — only `addRepo()` and `listRepos()` are implemented on the backend (`src/session-runtime.ts:190-222`).

7. **The sidebar component has clear boundaries** — it's a self-contained factory function (`createSidebar`) in `public/app/ui/sidebar.js` (304 lines) with dependency injection and a defined public API of 6 methods.

## Detailed Findings

### 1. Session File Format

**Format**: JSON Lines (JSONL) — one JSON object per line
**Current Version**: `CURRENT_SESSION_VERSION = 3`
**Naming**: `<timestamp>_<sessionId>.jsonl` (colons/dots in timestamp replaced with hyphens)
**Location**: `~/.pi/agent/sessions/--<encoded-cwd>--/`

Each session file contains sequential entries:

| Entry Type | Purpose |
|------------|---------|
| `session` (header) | ID, timestamp, cwd, version, parentSession |
| `message` | User/assistant messages with content |
| `session_info` | User-defined session name |
| `model_change` | Model switches during session |
| `thinking_level_change` | Thinking level adjustments |
| `compaction` | Context compaction snapshots |

**Key types** (`node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts`):

```typescript
interface SessionHeader {
    type: "session";
    version?: number;
    id: string;
    timestamp: string;  // ISO 8601
    cwd: string;
    parentSession?: string;
}

interface SessionEntryBase {
    type: string;
    id: string;
    parentId: string | null;
    timestamp: string;  // ISO 8601
}
```

### 2. Session Metadata: How It's Extracted

**First Prompt** (`src/session-runtime.ts:53-62`):
- Computed at runtime by `computeFirstMessage()`
- Iterates all messages, finds first `role="user"` message with non-empty text
- Returns trimmed text or `"(no messages)"`
- **Cost**: Requires full message scan, but `SessionManager.buildSessionInfo()` already does this when building `SessionInfo` objects

**Timestamps**:
- `created`: From session header `timestamp` field (ISO 8601)
- `modified`: Computed by `getSessionModifiedDate()` — priority: last message timestamp → header timestamp → file mtime
- Both exposed as ISO strings in `ApiSessionSummary` (`src/types.ts:42-43`)

**Running Status**:
- Determined by `PiWebRuntime.runningById.has(sessionId)` — purely in-memory
- Saved sessions: `isRunning = this.runningByPath.has(entry.path)` (`src/session-runtime.ts:245`)
- Active sessions: always `isRunning: true` (`src/session-runtime.ts:225`)

**Message Count**:
- Part of `SessionInfo` from `SessionManager.buildSessionInfo()`
- Exposed as `messageCount` in `ApiSessionSummary` (`src/types.ts:41`)

### 3. Current Sidebar Rendering Logic

**File**: `public/app/ui/sidebar.js` (304 lines)

**Architecture**: Factory function `createSidebar()` with closure-based state

**State variables** (lines 61-63):
```javascript
let isOpen = false;
let mode = "active"; // active | repos | repoSessions
let selectedRepoCwd = null;
```

**Three modes**:

| Mode | Header Label | Content Source | API Call |
|------|-------------|---------------|----------|
| `active` | "Active Sessions" | `renderSessions()` | `GET /api/active-sessions` |
| `repos` | "Repos" | `renderRepos()` | `GET /api/repos` |
| `repoSessions` | "Repo Sessions" | `renderSessions()` | `GET /api/sessions?cwd=...` |

**Mode switching** (line 80-89):
```javascript
function setMode(nextMode, repoCwd = null) {
    mode = nextMode;
    selectedRepoCwd = repoCwd;
    updateHeader();
    void refresh();
}
```

**Content rendering** (`refresh()`, lines 231-280):
- Each mode fetches data from different API endpoints
- Content rendered by `renderSessions()` or `renderRepos()`
- Each row is a `.si` div with `.si-name` (name/first message) and `.si-meta` (time + cwd + running badge)

**Header buttons** change per mode (`updateHeader()`, lines 90-118):
- `active`: Left=New Session, Right=Repos list
- `repos`: Left=Back to active, Right=Add repo
- `repoSessions`: Left=Back to repos, Right=New session

**Component public API** (lines 294-302):
```javascript
return {
    setOpen,              // open/close sidebar
    toggleOpen,           // toggle
    setMode,              // switch mode
    updateHeader,         // refresh header
    refresh,              // reload content
    highlightSessionRow,  // mark active session
};
```

**Code boundaries are clean** — the sidebar is self-contained with:
- All DOM dependencies injected via constructor
- 6-method public API
- No direct imports from other app modules
- Wired into `main.js` (lines 247-262) via callbacks

### 4. Active Session State Management

**No global state store** — the app uses closure-based factory functions.

**Frontend**: `public/app/session/controller.js`
- `activeSessionId` tracked as module-level variable (line 15)
- Set when: selecting a session (line 217), resuming from disk (line 230), opening by ID (line 283)
- Exposed via `getActiveSessionId()` callback

**Backend**: `src/session-runtime.ts`
- `PiWebRuntime` class maintains `runningById: Map<string, RunningSession>` (line 168)
- `RunningSession` contains: `session`, `cwd`, `sessionFile`, timestamps, `controllerClientId`, `clients` Map
- `listActiveSessions()` (line 221): iterates `runningById`, all with `isRunning: true`
- `listSessions()` (line 240): merges disk + running, marks running status per-session

**Real-time updates**: Server-Sent Events (SSE), NOT WebSocket
- Endpoint: `GET /api/sessions/{id}/events?clientId=xxx`
- Events: `init`, `agent_event`, `state_patch`, `controller_changed`, `released`
- `isStreaming` tracked separately from `isRunning` — `isStreaming` means agent is actively generating

### 5. Repo Management

**Storage**: `~/.pi/agent/pi-web/repos.json` — JSON array of absolute path strings

**Backend APIs** (`src/server.ts`):

| Method | Path | Implementation |
|--------|------|----------------|
| GET | `/api/repos` | `PiWebRuntime.listRepos()` — merges repos.json + SessionManager.listAll() + running sessions |
| POST | `/api/repos` | `PiWebRuntime.addRepo(rawCwd)` — validates dir exists, adds to repos.json |

**Missing APIs**:
- **Remove Repo**: Not implemented. No `DELETE /api/repos` or `removeRepo()` method exists.
- **File System Tree**: Not implemented. No directory browsing endpoint or UI component exists.

**Add Repo flow** (`public/app/ui/sidebar.js:193-202`):
```javascript
async function promptAddRepo() {
    const cwd = window.prompt("Repo path (absolute)", "");  // native browser prompt
    // ... validates, posts to API
}
```

**List Repos merging logic** (`src/session-runtime.ts:190-208`):
1. Load from `repos.json` on disk
2. Merge CWDs from `SessionManager.listAll()` (all sessions across all repos)
3. Merge CWDs from currently running sessions
4. Deduplicate and sort alphabetically

### 6. Tech Stack Overview

| Layer | Technology |
|-------|-----------|
| Runtime | Bun (not Node.js) |
| Server | `Bun.serve()` — no Express/Fastify |
| Backend Language | TypeScript |
| Frontend | Vanilla JavaScript (ES modules) |
| UI | Plain HTML + CSS, no framework |
| State Management | Closure-based factory functions |
| Real-time | Server-Sent Events (SSE) |
| API | REST (JSON over HTTP) |
| Testing | Bun test (unit) + Playwright (E2E) |
| SDK | `@mariozechner/pi-coding-agent ~0.53.0` |

**Not**: React Native, Capacitor, Electron, or any mobile-native framework. This is a pure web app optimized for mobile browsers.

## Code References

### Backend (Source of Truth)
- `src/session-runtime.ts:53-62` — `computeFirstMessage()` — first prompt extraction
- `src/session-runtime.ts:168` — `runningById` Map — running session tracking
- `src/session-runtime.ts:190-208` — `listRepos()` — repo list merging
- `src/session-runtime.ts:211-222` — `addRepo()` — add repo with validation
- `src/session-runtime.ts:221-239` — `listActiveSessions()` — running session list
- `src/session-runtime.ts:240-298` — `listSessions()` — full session list with running status
- `src/server.ts:305-312` — Session listing endpoint with `?cwd=` filter
- `src/server.ts:344-365` — Active sessions + repos endpoints
- `src/server.ts:388-424` — SSE endpoint for session events
- `src/types.ts:35-44` — `ApiSessionSummary` interface (id, firstMessage, isRunning, etc.)
- `src/types.ts:83` — `ApiSessionState.isStreaming`

### Frontend (UI Layer)
- `public/app/ui/sidebar.js:43` — `createSidebar()` factory function
- `public/app/ui/sidebar.js:61-63` — Sidebar state (isOpen, mode, selectedRepoCwd)
- `public/app/ui/sidebar.js:80-89` — `setMode()` — mode switching logic
- `public/app/ui/sidebar.js:90-118` — `updateHeader()` — dynamic header buttons
- `public/app/ui/sidebar.js:120-165` — `renderSessions()` — session row rendering
- `public/app/ui/sidebar.js:166-188` — `renderRepos()` — repo row rendering
- `public/app/ui/sidebar.js:193-202` — `promptAddRepo()` — uses `window.prompt()`
- `public/app/ui/sidebar.js:231-280` — `refresh()` — data fetching per mode
- `public/app/ui/sidebar.js:294-302` — Public API (6 methods)
- `public/app/main.js:247-262` — Sidebar creation with dependency injection
- `public/app/session/controller.js:15` — `activeSessionId` state variable
- `public/app/session/controller.js:33-47` — `connectEvents()` — SSE connection setup
- `public/app/session/controller.js:283-284` — `openSessionId()` — set active session

### Session SDK (Upstream)
- `node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts:9-15` — `SessionHeader` type
- `node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts:17-21` — `SessionEntryBase` type
- `node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.d.ts:85-101` — `SessionInfo` type
- `node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.js:12` — `CURRENT_SESSION_VERSION = 3`
- `node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.js:399-432` — `buildSessionInfo()` — metadata extraction
- `node_modules/@mariozechner/pi-coding-agent/dist/core/session-manager.js:1048-1092` — `list()` and `listAll()` methods

### Supporting Files
- `public/index.html:51-61` — Sidebar DOM structure (overlay + nav)
- `public/styles.css:147-161` — Desktop sidebar layout
- `public/styles.css:263-273` — Mobile overlay styling
- `public/styles.css:328-338` — Mobile sidebar slide animation
- `public/app/core/api.js` — HTTP client (getJson, postJson)

## Architecture Insights

### Data Flow: Session Listing
```
SessionManager.listAll()     ← scans ~/.pi/agent/sessions/ (all .jsonl files)
        ↓
PiWebRuntime.listSessions()  ← merges disk sessions + running sessions, computes isRunning
        ↓
GET /api/sessions?cwd=X      ← server.ts filters by cwd
        ↓
sidebar.js refresh()         ← fetches and renders
```

### Data Flow: Session Metadata Extraction
```
.jsonl file on disk
    ↓ SessionManager reads entries
    ↓ buildSessionInfo() parses messages
    ↓ extractTextContent() on first user message → firstMessage
    ↓ getSessionModifiedDate() → modified timestamp
    ↓ message count from entry scan → messageCount
    ↓
ApiSessionSummary (JSON)
    ↓
sidebar.js renderSessions() → DOM rows
```

### Current Navigation Pattern (Three-Mode)
```
User opens sidebar
  → Mode: "active" (shows running sessions)
  → Clicks "Repos" button
    → Mode: "repos" (shows repo list)
    → Clicks a repo
      → Mode: "repoSessions" (shows sessions for that repo)
      → Clicks "Back" button
        → Mode: "repos"
```

### Target Navigation Pattern (Flat)
```
User opens sidebar
  → Active Session pinned to top (read-only)
  → All repos listed below (collapsed/expanded inline)
  → Click repo to expand → shows sessions inline
  → Click session → loads full content
```

## Open Questions — Answered

### Q1: Where is session metadata (first prompt, time, status) stored?
**Answer**: First prompt is **computed** (not stored) by scanning messages for the first `role="user"` entry. Timestamps come from the session header and message entries. Running status is **runtime memory only** — `PiWebRuntime.runningById` Map. All three are bundled into `ApiSessionSummary` by the backend and served via REST API.

### Q2: What is the session file format?
**Answer**: JSONL (JSON Lines). Each line is a typed entry (session header, message, model_change, etc.). Files stored at `~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<sessionId>.jsonl`.

### Q3: Where is the current three-mode rendering logic?
**Answer**: `public/app/ui/sidebar.js` — the `createSidebar()` factory function. The mode variable (line 62) and `setMode()` (line 80) control which API is called and how content is rendered. The `refresh()` function (line 231) branches on mode. Code boundaries are clean — sidebar is 304 self-contained lines with explicit DI.

### Q4: How is "Active Session" running status determined?
**Answer**: Backend checks `PiWebRuntime.runningById` Map. If a session ID exists in this Map, `isRunning = true`. This is purely in-memory state — a running session that crashes will appear as "stopped" on restart. The frontend also tracks `isStreaming` separately via SSE events (`agent_start`/`agent_end`).

### Q5: Does the tech stack have file system access for Add Repo tree browsing?
**Answer**: **No.** There is no file system browsing capability anywhere in the codebase. The current Add Repo uses `window.prompt()` for manual path input. The frontend is a pure web app (not Electron/Node.js), so it cannot directly access the file system. A file system tree browser would require:
- **Backend**: New endpoint (e.g., `GET /api/fs/ls?path=...`) to list directory contents
- **Frontend**: New UI component for directory tree navigation
- No existing code to build upon — this would be greenfield development

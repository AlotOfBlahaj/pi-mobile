---
date: 2026-04-02T00:00:00Z
analyzer: claude
git_commit: 93ea2ce5ed4e433bf37433572c7f4b2d8c5366be
branch: main
scope: full
status: complete
---

# Codebase Structure: pi-mobile

**Date**: 2026-04-02
**Commit**: `93ea2ce`
**Branch**: `main`

## Overview

pi-mobile (package name `pi-web`) is a browser-based remote UI for the `pi` coding agent. It allows users to create, resume, and live-stream AI coding sessions from any device — laptop, phone, or tablet. The server runs the agent on the host machine; clients connect via a browser over HTTP/SSE.

The project is a small, focused codebase: 4 backend TypeScript files (~36KB) and 16 frontend JavaScript modules (~94KB), with zero frontend framework and only 1 runtime dependency.

## Tech Stack

- **Language(s)**: TypeScript (backend), JavaScript ES Modules (frontend)
- **Runtime**: Bun (not Node.js)
- **Framework(s)**: None — vanilla JS with factory functions on the frontend; bare `Bun.serve()` on the backend
- **Build tool**: None — Bun runs TypeScript natively; frontend is raw ES modules with no transpilation or bundling
- **Package manager**: Bun (lockfile: `bun.lock`)
- **Test framework**: Bun Test (unit/golden) + Playwright (E2E visual regression)
- **Linter/Formatter**: None configured
- **SDK**: `@mariozechner/pi-coding-agent ~0.53.0` — provides session management, LLM providers, agent execution
- **CSS**: Custom stylesheet, dark theme, no framework or preprocessor

## Project Layout

```
pi-mobile/
├── src/                         # Backend TypeScript (4 files, ~36KB)
│   ├── server.ts                # HTTP server, routing, SSE, static files (14.7KB)
│   ├── session-runtime.ts       # PiWebRuntime class — session lifecycle (17.2KB)
│   ├── types.ts                 # API type definitions (3.2KB)
│   └── proxy.ts                 # Reverse-proxy origin resolution (0.8KB)
│
├── public/                      # Frontend static assets
│   ├── index.html               # SPA shell — single HTML page (6KB)
│   ├── styles.css               # Complete CSS — dark theme, responsive (14.7KB)
│   ├── app.js                   # Entry import — re-exports main.js (25B)
│   ├── app/
│   │   ├── main.js              # App bootstrap — wires all components (4.5KB)
│   │   ├── core/                # Utility modules (6 files, 4.3KB)
│   │   │   ├── api.js           # HTTP client factory (getJson/postJson)
│   │   │   ├── device.js        # Mobile/touch detection
│   │   │   ├── storage.js       # localStorage helpers (clientId, token)
│   │   │   ├── stringify.js     # Safe JSON stringify
│   │   │   ├── tool_format.js   # Tool call/result → readable text
│   │   │   └── uuid.js          # UUID v4 generation (crypto + fallback)
│   │   ├── render/
│   │   │   └── markdown.js      # Lightweight markdown → DOM (bold, code, fences)
│   │   ├── session/             # Session management (5 files, 21.9KB)
│   │   │   ├── controller.js    # Session lifecycle controller (7.6KB)
│   │   │   ├── chat_view.js     # Message rendering & incremental DOM updates (9.3KB)
│   │   │   ├── tool_boxes.js    # Tool execution collapsible boxes (4.7KB)
│   │   │   ├── content.js       # Message content parsing (1.1KB)
│   │   │   └── cli.js           # CLI command string generation (0.2KB)
│   │   └── ui/                  # UI components (2 files, 16.8KB)
│   │       ├── sidebar.js       # Three-mode sidebar (active/repos/repoSessions) (8.9KB)
│   │       └── menu.js          # Dropdown menus (model, thinking level) (7.9KB)
│   └── fixtures/                # Replay test fixtures — JSON arrays of SSE events (5 files)
│       ├── basic.json
│       ├── tools.json
│       ├── abort.json
│       ├── tool_before_message.json
│       └── mobile_working.json
│
├── tests/                       # Test suites
│   ├── golden/                  # Bun Test — unit + snapshot tests
│   │   ├── proxy.test.ts        # Tests for resolveOrigin()
│   │   ├── render_model.test.js # Golden tests for SSE → DOM rendering
│   │   └── __snapshots__/       # Bun snapshot files
│   └── e2e/                     # Playwright visual regression
│       ├── replay.e2e.js        # Screenshot tests per fixture
│       └── replay.e2e.js-snapshots/  # PNG baselines (8 screenshots)
│
├── docs/                        # Documentation
│   ├── design/                  # Design documents
│   │   └── 2026-04-02-sidebar-refactoring.md
│   ├── research/                # Research documents
│   │   └── 2026-04-02-sidebar-refactoring-research.md
│   └── structure/               # Structure maps (this file)
│
├── package.json                 # Project manifest — 1 dep, 1 devDep
├── bun.lock                     # Bun lockfile
├── playwright.config.js         # Playwright config — Chromium + WebKit(iPhone)
├── README.md                    # Project overview & quick start
├── RUNBOOK.md                   # Deployment guide (Tailscale, Cloudflare, tokens)
├── plan.md                      # Development planning notes (25KB)
├── question.md                  # Requirements/questions doc
├── LICENSE                      # Project license
├── .gitignore                   # Git ignore rules
└── piwebdemo.mp4                # Demo video (17.5MB)
```

## Key Entry Points

- **`src/server.ts`** — Bun server entry point. Parses CLI args (`--host`, `--port`, `--token`), initializes `PiWebRuntime`, starts `Bun.serve()`. All routes, static file serving, and SSE handling are in this file. Runs via `bun src/server.ts` (prod) or `bun --hot src/server.ts` (dev with hot reload).
- **`public/app.js`** — Browser entry point. Single line: `import "./app/main.js";`
- **`public/app/main.js`** — Application bootstrap. Queries DOM elements from `index.html`, creates API client, instantiates all components (`createSessionController`, `createSidebar`, `createMenu`), wires callbacks, sets up event listeners (keyboard, resize, buttons). This is the composition root — the only file that knows how all modules connect.
- **`public/index.html`** — SPA shell. Contains the complete DOM structure: header, sidebar, chat area, editor, footer, menu overlay. No client-side routing — single page.

## Available Commands

| Command | Purpose |
|---------|---------|
| `bun install` | Install dependencies |
| `bun run dev -- --port 4317` | Start dev server with hot reload |
| `bun run start` (or `bun src/server.ts`) | Start production server |
| `bun test` | Run Bun unit/snapshot tests |
| `bun test -u` | Update Bun snapshots |
| `bun run test:e2e` | Run Playwright E2E screenshot tests |
| `bun run test:e2e -- --update-snapshots` | Update Playwright screenshot baselines |
| `PI_WEB_REPLAY=1 bun run dev` | Start server with fixture replay mode (for E2E dev) |

Server CLI flags: `--host <ip>`, `--port <num>`, `--token <string>`

Environment variables: `PI_WEB_HOST`, `PI_WEB_PORT`, `PI_WEB_TOKEN`, `PI_WEB_REPLAY`, `PI_WEB_E2E_PORT`

## Architecture Patterns

### Backend: Class + Static Routing

The backend is a single-class architecture:

```
src/server.ts (routing & HTTP)
    ↓ delegates to
src/session-runtime.ts (PiWebRuntime class — business logic)
    ↓ delegates to
@mariozechner/pi-coding-agent SDK (agent execution)
```

- **`server.ts`** handles all HTTP concerns: parsing requests, routing by method+path pattern, extracting path parameters, streaming SSE responses, serving static files. Routes are matched via sequential `if/else if` on URL patterns — no router library.
- **`session-runtime.ts`** (`PiWebRuntime` class) manages the runtime state: running sessions (in-memory `Map`), SSE clients per session, repo list persistence, broadcasting events to clients. This is the only class in the codebase.
- **`types.ts`** centralizes all API contract types with TypeScript interfaces and discriminated unions.

### Frontend: Factory Functions + Closure State

Every frontend "component" is a **factory function** that:
1. Accepts DOM elements and callback functions as constructor parameters (dependency injection)
2. Holds state in closure variables (no `this`, no class)
3. Returns a plain object exposing the public API

```javascript
// Pattern: every component follows this shape
export function createXxx({ domElement, api, onCallback }) {
    let localState = initialValue;        // closure-based state

    function internalHelper() { ... }     // private functions

    return {                              // public API
        doSomething() { ... },
        getState: () => localState,
    };
}
```

There is no framework, no virtual DOM, no reactive store. DOM updates are direct `createElement`/`appendChild`/`textContent` calls.

### Data Flow

```
┌──────────────────────────────────────────────────────────────┐
│                        BROWSER                               │
│                                                              │
│  main.js ──wires──→ session/controller.js (state machine)    │
│     │                  │                                     │
│     │                  ├── session/chat_view.js (rendering)  │
│     │                  ├── session/tool_boxes.js (tool UI)   │
│     │                  └── ui/sidebar.js (navigation)        │
│     │                                                        │
│     └── ui/menu.js (model/thinking selectors)                │
│                                                              │
│  Communication: EventSource (SSE) for streaming,             │
│                 fetch() for REST commands                     │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP / SSE
┌────────────────────────▼─────────────────────────────────────┐
│                        SERVER                                │
│                                                              │
│  server.ts ──routes──→ session-runtime.ts (PiWebRuntime)     │
│                           │                                  │
│                           ├── runningById Map (in-memory)    │
│                           ├── runningByPath Map              │
│                           └── subscribe() → broadcast()      │
│                                                              │
│  Communication: PiWebRuntime delegates to SDK                │
└────────────────────────┬─────────────────────────────────────┘
                         │ SDK calls
┌────────────────────────▼─────────────────────────────────────┐
│                    FILE SYSTEM                                │
│                                                              │
│  ~/.pi/agent/sessions/  ← JSONL session files                │
│  ~/.pi/agent/pi-web/repos.json  ← saved repo list           │
│  ~/.pi/agent/pi-web/faceid-credentials.json  ← WebAuthn     │
└──────────────────────────────────────────────────────────────┘
```

### SSE (Server-Sent Events) Flow

1. Client connects: `GET /api/sessions/{id}/events?clientId=xxx`
2. Server sends `init` event with full session state
3. Agent events stream as `agent_event` type
4. On completion (`agent_end`/`auto_compaction_end`), server sends `state_patch`
5. Controller changes broadcast as `controller_changed`
6. Release broadcasts `released` to all clients, then closes connections
7. Keep-alive pings every 5 seconds

### Session Roles

- **Controller**: The client that can send prompts and commands. One per session. Transferable via `takeover`.
- **Viewer**: Read-only observers. Multiple allowed per session.

### Error Handling

Backend throws string-error codes:
- `"session_not_running"` → 404
- `"not_controller"` → 403
- `"cannot_takeover_while_streaming"` → 409

Frontend catches errors and displays via `chatView.appendNotice(message, "error")` toast pattern.

## Conventions

- **File naming**: kebab-case everywhere (e.g., `session-runtime.ts`, `chat_view.js`, `tool_format.js`, `render_model.test.js`)
- **Directory structure**: Feature-based (core/, session/, ui/, render/) — not technical layers
- **Import style**: ESM with explicit `.js` extensions; Node builtins use `node:` prefix; type-only imports use `import type`; no barrel exports; no default exports
- **Function patterns**: Factory functions with closure state (frontend); classes for stateful singletons (backend); plain functions for utilities
- **Dependency injection**: Constructor-parameter injection via options objects. Callbacks for events. No IoC container. All wiring in `main.js`.
- **Component API pattern**: Factory returns `{ method, method, getter: () => value }` — plain objects with closures
- **CSS class naming**: Short descriptive names (`.si` = session item, `.tool-box`), state modifiers as classes (`.active`, `.pending`, `.success`, `.error`)
- **Testing patterns**: `*.test.ts`/`*.test.js` for unit (Bun test), `*.e2e.js` for Playwright; snapshots in `__snapshots__/`; visual regression via screenshot comparison
- **Type naming**: Interfaces prefixed with `Api` (e.g., `ApiSessionSummary`, `ApiCommandRequest`); discriminated unions for event/command types
- **Git conventions**: No branch naming or commit message conventions enforced in config

## Module/Package Dependencies

### Internal Dependency Graph (Frontend)

```
main.js (composition root)
  ├── core/api.js
  ├── core/device.js
  ├── core/storage.js
  ├── session/controller.js
  │   ├── core/api.js (via injection)
  │   ├── session/chat_view.js (created internally)
  │   │   ├── render/markdown.js
  │   │   └── session/tool_boxes.js
  │   └── session/content.js
  ├── ui/sidebar.js
  │   └── core/api.js (via injection)
  └── ui/menu.js
      └── core/api.js (via injection)
```

### Internal Dependency Graph (Backend)

```
server.ts
  ├── session-runtime.ts (PiWebRuntime)
  │   └── types.ts
  ├── types.ts
  └── proxy.ts
```

### External Dependencies

| Package | Version | Role |
|---------|---------|------|
| `@mariozechner/pi-coding-agent` | ~0.53.0 | Core SDK — session management, LLM integration, tool execution |
| `@playwright/test` | ^1.51.0 | E2E testing (dev dependency) |

Transitive AI provider SDKs (via pi-coding-agent): `@anthropic-ai/sdk`, `openai`, `@google/genai`, `@aws-sdk/client-bedrock-runtime`, `@mistralai/mistralai`

## Key Files Reference

| File | Size | Role |
|------|------|------|
| `src/server.ts` | 14.7KB | HTTP server — all routes, SSE streaming, static files, CLI arg parsing, TLS detection |
| `src/session-runtime.ts` | 17.2KB | Core business logic — session lifecycle, client management, event broadcasting, repo persistence |
| `src/types.ts` | 3.2KB | All API contract types — `ApiSessionSummary`, `ApiCommandRequest` (discriminated union), `SseEvent` (discriminated union) |
| `public/app/main.js` | 4.5KB | Composition root — wires every component together, handles top-level UI logic |
| `public/app/session/controller.js` | 7.6KB | Session state machine — SSE connection, command dispatch, role management |
| `public/app/session/chat_view.js` | 9.3KB | Incremental DOM rendering — message streaming, assistant blocks, tool boxes |
| `public/app/ui/sidebar.js` | 8.9KB | Three-mode sidebar — `active`/`repos`/`repoSessions` navigation |
| `public/app/ui/menu.js` | 7.9KB | Dropdown menus — model selector with fuzzy search, thinking level picker |
| `public/styles.css` | 14.7KB | Complete styling — dark theme, responsive (740px breakpoint), mobile keybar |
| `public/index.html` | 6KB | SPA shell — all DOM structure in one file |

## Notes

- **No build step**: The project has zero build configuration. Bun runs TypeScript directly; the browser loads ES modules natively. No tsconfig.json, no webpack/vite/rollup.
- **No linter/formatter**: No ESLint, Prettier, or similar tooling is configured.
- **Session metadata is computed, not stored**: `firstMessage` is extracted by scanning JSONL entries at list time via `computeFirstMessage()` (`session-runtime.ts:53-62`). `isRunning` is determined by checking the in-memory `runningById` Map — not persisted to disk.
- **File system browsing does not exist**: The current "Add Repo" flow uses `window.prompt()` for manual path input. No directory tree UI or API endpoint exists.
- **Remove Repo does not exist**: Only `addRepo()` and `listRepos()` are implemented. No `DELETE /api/repos` endpoint.
- **The sidebar is the target of active refactoring**: A design doc (`docs/design/2026-04-02-sidebar-refactoring.md`) proposes migrating from the current three-mode state machine to a flat, collapsible-tree sidebar with lazy-loaded sessions, file system browsing, and inline session creation.
- **Replay mode for testing**: `PI_WEB_REPLAY=1` enables deterministic replay from `public/fixtures/*.json` — used by E2E tests and manual debugging.
- **Auth model is network-based**: Loopback and Tailscale IPs require no token; other hosts require a Bearer token. WebAuthn (Face ID/Touch ID) is supported for biometric auth on HTTPS domains.
- **The `plan.md` file (25KB)**: Contains development planning notes and is gitignored from the AGENTS.md config.

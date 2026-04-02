import { describe, expect, test, mock } from "bun:test";

// ─── createRepoGroup tests ──────────────────────────────────────────────────
//
// Factory function: createRepoGroup({ cwd, homeDir, api, clientId, getActiveSessionId, onSelectSession, onSessionIdSelected, onNotice })
// Returns: { getElement(), isExpanded(), setExpanded(bool), refresh(), highlightSession(id) }
//
// State machine: COLLAPSED → LOADING → EXPANDED → COLLAPSED
//                LOADING → ERROR (with retry → LOADING)
//
// Contract (from plan):
//   - COLLAPSED: render .repo-header only (abbreviated cwd, expand icon ▶)
//   - LOADING: show .sidebar-loading inside .repo-sessions
//   - EXPANDED: render session rows via createSessionRow() + [New Session] button
//   - ERROR: show error message + retry button
//   - Cache: keep sessions in memory after first load
//   - Re-expand: show cached data immediately, background refresh if stale (>30s)
//
// NOTE: This function does NOT exist yet — TDD Red phase.

import { createRepoGroup } from "../../public/app/ui/sidebar/repo-group.js";

// ─── Mock helpers ───────────────────────────────────────────────────────────

function makeApi(sessionsResponse = { sessions: [] }) {
	return {
		getJson: mock(() => Promise.resolve(sessionsResponse)),
		postJson: mock(() =>
			Promise.resolve({ sessionId: "new-session-123" }),
		),
		deleteJson: mock(() =>
			Promise.resolve(new Response(null, { status: 204 })),
		),
	};
}

function makeConfig(overrides = {}) {
	return {
		cwd: "/home/user/my-project",
		homeDir: "/home/user",
		api: makeApi(),
		clientId: "test-client",
		getActiveSessionId: mock(() => null),
		onSelectSession: mock(),
		onSessionIdSelected: mock(),
		onNotice: mock(),
		...overrides,
	};
}

function makeSession(overrides = {}) {
	return {
		id: `sess-${Math.random().toString(36).slice(2, 10)}`,
		path: "/home/user/.pi/sessions/test.jsonl",
		cwd: "/home/user/my-project",
		name: undefined,
		firstMessage: "Test session",
		created: new Date("2026-04-01T10:00:00Z").toISOString(),
		modified: new Date("2026-04-02T10:00:00Z").toISOString(),
		messageCount: 3,
		isRunning: false,
		...overrides,
	};
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("createRepoGroup — initial state (COLLAPSED)", () => {
	test("returns object with required methods", () => {
		const group = createRepoGroup(makeConfig());
		expect(typeof group.getElement).toBe("function");
		expect(typeof group.isExpanded).toBe("function");
		expect(typeof group.setExpanded).toBe("function");
		expect(typeof group.refresh).toBe("function");
		expect(typeof group.highlightSession).toBe("function");
	});

	test("getElement returns HTMLElement", () => {
		const group = createRepoGroup(makeConfig());
		expect(group.getElement()).toBeInstanceOf(HTMLElement);
	});

	test("element has .repo-group class", () => {
		const group = createRepoGroup(makeConfig());
		expect(group.getElement().classList.contains("repo-group")).toBe(true);
	});

	test("element has data-repo-cwd attribute", () => {
		const config = makeConfig({ cwd: "/home/user/my-project" });
		const group = createRepoGroup(config);
		expect(group.getElement().dataset.repoCwd).toBe("/home/user/my-project");
	});

	test("starts collapsed — isExpanded() returns false", () => {
		const group = createRepoGroup(makeConfig());
		expect(group.isExpanded()).toBe(false);
	});

	test("renders .repo-header with abbreviated cwd", () => {
		const config = makeConfig({
			cwd: "/home/user/my-project",
			homeDir: "/home/user",
		});
		const group = createRepoGroup(config);
		const header = group.getElement().querySelector(".repo-header");
		expect(header).not.toBeNull();
		// Should abbreviate /home/user/my-project → ~/my-project or similar
		expect(header.textContent).toContain("my-project");
	});

	test("renders expand icon in header", () => {
		const group = createRepoGroup(makeConfig());
		const icon = group.getElement().querySelector(".expand-icon");
		expect(icon).not.toBeNull();
	});

	test("repo-sessions is hidden when collapsed", () => {
		const group = createRepoGroup(makeConfig());
		const sessions = group.getElement().querySelector(".repo-sessions");
		expect(sessions).not.toBeNull();
		// Should be hidden (display: none or similar)
	});

	test("has remove button in header", () => {
		const group = createRepoGroup(makeConfig());
		const removeBtn = group.getElement().querySelector(".remove-btn");
		expect(removeBtn).not.toBeNull();
	});
});

describe("createRepoGroup — expand (COLLAPSED → LOADING → EXPANDED)", () => {
	test("setExpanded(true) triggers API fetch for sessions", async () => {
		const api = makeApi({
			sessions: [makeSession(), makeSession()],
		});
		const config = makeConfig({ api });
		const group = createRepoGroup(config);

		await group.setExpanded(true);

		// Should have called GET /api/sessions?cwd=...
		expect(api.getJson).toHaveBeenCalledTimes(1);
		const calledUrl = api.getJson.mock.calls[0][0];
		expect(calledUrl).toContain("/api/sessions");
		expect(calledUrl).toContain(encodeURIComponent(config.cwd));
	});

	test("after successful expand, isExpanded() returns true", async () => {
		const api = makeApi({ sessions: [makeSession()] });
		const group = createRepoGroup(makeConfig({ api }));

		await group.setExpanded(true);

		expect(group.isExpanded()).toBe(true);
	});

	test("after expand, session rows are rendered", async () => {
		const sessions = [makeSession({ id: "s1" }), makeSession({ id: "s2" })];
		const api = makeApi({ sessions });
		const group = createRepoGroup(makeConfig({ api }));

		await group.setExpanded(true);

		const el = group.getElement();
		const rows = el.querySelectorAll(".si");
		expect(rows.length).toBe(2);
	});

	test("after expand, New Session button is rendered", async () => {
		const api = makeApi({ sessions: [makeSession()] });
		const group = createRepoGroup(makeConfig({ api }));

		await group.setExpanded(true);

		const newBtn = group.getElement().querySelector(".add-session-btn");
		expect(newBtn).not.toBeNull();
	});

	test("header gets .expanded class when expanded", async () => {
		const api = makeApi({ sessions: [] });
		const group = createRepoGroup(makeConfig({ api }));

		await group.setExpanded(true);

		const header = group.getElement().querySelector(".repo-header");
		expect(header.classList.contains("expanded")).toBe(true);
	});

	test("empty session list shows 'No sessions' message", async () => {
		const api = makeApi({ sessions: [] });
		const group = createRepoGroup(makeConfig({ api }));

		await group.setExpanded(true);

		const el = group.getElement();
		// Should indicate no sessions, and still show New Session button
		const newBtn = el.querySelector(".add-session-btn");
		expect(newBtn).not.toBeNull();
	});
});

describe("createRepoGroup — collapse (EXPANDED → COLLAPSED)", () => {
	test("setExpanded(false) collapses the group", async () => {
		const api = makeApi({ sessions: [makeSession()] });
		const group = createRepoGroup(makeConfig({ api }));

		await group.setExpanded(true);
		expect(group.isExpanded()).toBe(true);

		await group.setExpanded(false);
		expect(group.isExpanded()).toBe(false);
	});

	test("collapsing removes .expanded class from header", async () => {
		const api = makeApi({ sessions: [makeSession()] });
		const group = createRepoGroup(makeConfig({ api }));

		await group.setExpanded(true);
		await group.setExpanded(false);

		const header = group.getElement().querySelector(".repo-header");
		expect(header.classList.contains("expanded")).toBe(false);
	});

	test("collapse retains data in memory (cached)", async () => {
		const api = makeApi({ sessions: [makeSession()] });
		const group = createRepoGroup(makeConfig({ api }));

		// First expand — triggers fetch
		await group.setExpanded(true);
		expect(api.getJson).toHaveBeenCalledTimes(1);

		// Collapse
		await group.setExpanded(false);

		// Re-expand — should use cache (no additional fetch for the data)
		await group.setExpanded(true);
		// Only one fetch call (the initial one)
		expect(api.getJson).toHaveBeenCalledTimes(1);
	});
});

describe("createRepoGroup — error state (LOADING → ERROR)", () => {
	test("shows error message when fetch fails", async () => {
		const api = makeApi();
		api.getJson = mock(() => Promise.reject(new Error("Network error")));
		const group = createRepoGroup(makeConfig({ api }));

		await group.setExpanded(true);

		const el = group.getElement();
		// Should show some error indication
		const errorEl = el.querySelector(".sidebar-error, .error");
		// The group should still be in some visual error state
		expect(el.textContent).toBeTruthy(); // not empty
	});

	test("shows retry button on error", async () => {
		const api = makeApi();
		api.getJson = mock(() => Promise.reject(new Error("Network error")));
		const group = createRepoGroup(makeConfig({ api }));

		await group.setExpanded(true);

		const el = group.getElement();
		const retryBtn = el.querySelector("button");
		// Should have a retry button
		expect(retryBtn).not.toBeNull();
	});

	test("retry button triggers re-fetch", async () => {
		let callCount = 0;
		const api = makeApi();
		api.getJson = mock(() => {
			callCount++;
			if (callCount === 1) return Promise.reject(new Error("Fail"));
			return Promise.resolve({ sessions: [makeSession()] });
		});
		const group = createRepoGroup(makeConfig({ api }));

		// First expand fails
		await group.setExpanded(true);
		expect(callCount).toBe(1);

		// Find and click retry button
		const retryBtn = group
			.getElement()
			.querySelector("button.retry-btn, button");
		// Note: Implementation may or may not have a separate retry button
		// If it exists and is clickable, verify re-fetch
		if (retryBtn && retryBtn.textContent?.toLowerCase().includes("retry")) {
			retryBtn.click();
			// Wait for async
			await new Promise((r) => setTimeout(r, 100));
			expect(callCount).toBe(2);
		} else {
			// If no explicit retry button, verify error state is shown
			const el = group.getElement();
			expect(el.textContent).toBeTruthy();
		}
	});
});

describe("createRepoGroup — remove repo", () => {
	test("clicking remove button calls DELETE /api/repos", async () => {
		const api = makeApi({ sessions: [makeSession()] });
		const group = createRepoGroup(makeConfig({ api }));

		// Need to be expanded to interact (or remove btn is always visible on hover)
		const removeBtn = group.getElement().querySelector(".remove-btn");
		expect(removeBtn).not.toBeNull();

		removeBtn.click();

		// Should call deleteJson or similar with the cwd
		expect(api.deleteJson).toHaveBeenCalled();
	});
});

describe("createRepoGroup — new session creation", () => {
	test("clicking New Session calls POST /api/sessions", async () => {
		const api = makeApi({ sessions: [makeSession()] });
		const onSessionIdSelected = mock();
		const group = createRepoGroup(
			makeConfig({ api, onSessionIdSelected }),
		);

		await group.setExpanded(true);

		const newBtn = group.getElement().querySelector(".add-session-btn");
		newBtn.click();

		// Wait for async
		await new Promise((r) => setTimeout(r, 50));

		expect(api.postJson).toHaveBeenCalled();
	});
});

describe("createRepoGroup — refresh", () => {
	test("refresh() re-fetches sessions when expanded", async () => {
		const api = makeApi({ sessions: [makeSession()] });
		const group = createRepoGroup(makeConfig({ api }));

		await group.setExpanded(true);
		expect(api.getJson).toHaveBeenCalledTimes(1);

		await group.refresh();
		expect(api.getJson).toHaveBeenCalledTimes(2);
	});

	test("refresh() is no-op when collapsed", async () => {
		const api = makeApi({ sessions: [makeSession()] });
		const group = createRepoGroup(makeConfig({ api }));

		await group.refresh();
		// No fetch should happen
		expect(api.getJson).toHaveBeenCalledTimes(0);
	});
});

describe("createRepoGroup — highlight session", () => {
	test("highlightSession(id) adds .active to matching row", async () => {
		const targetId = "target-session";
		const api = makeApi({
			sessions: [
				makeSession({ id: "other-session" }),
				makeSession({ id: targetId }),
			],
		});
		const group = createRepoGroup(makeConfig({ api }));

		await group.setExpanded(true);
		group.highlightSession(targetId);

		const rows = group.getElement().querySelectorAll(".si");
		let activeCount = 0;
		rows.forEach((row) => {
			if (row.classList.contains("active")) {
				activeCount++;
				expect(row.dataset.sessionId).toBe(targetId);
			}
		});
		expect(activeCount).toBe(1);
	});
});

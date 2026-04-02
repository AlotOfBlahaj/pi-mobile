import { describe, expect, test, mock } from "bun:test";

// ─── createActiveSession tests ──────────────────────────────────────────────
//
// Factory function: createActiveSession({ container, api, getActiveSessionId, onSelectSession })
// Returns: { update(), getElement() }
//
// Contract (from plan):
//   - Fetches GET /api/active-sessions
//   - Renders ALL running sessions as compact .si rows
//   - The session matching getActiveSessionId() gets .active class
//   - Shows "ACTIVE" label above the list
//   - If no active sessions: show nothing (hidden section)
//
// NOTE: This function does NOT exist yet — TDD Red phase.

import { createActiveSession } from "../../public/app/ui/sidebar/active-session.js";

// ─── Mock helpers ───────────────────────────────────────────────────────────

function makeContainer() {
	const div = document.createElement("div");
	document.body.appendChild(div);
	return div;
}

function makeApi(sessions = []) {
	return {
		getJson: mock(() =>
			Promise.resolve({ sessions }),
		),
		postJson: mock(),
		deleteJson: mock(),
	};
}

function makeRunningSession(overrides = {}) {
	return {
		id: `running-${Math.random().toString(36).slice(2, 8)}`,
		path: "/home/user/.pi/sessions/test.jsonl",
		cwd: "/home/user/project",
		name: undefined,
		firstMessage: "Running task",
		created: new Date("2026-04-01T10:00:00Z").toISOString(),
		modified: new Date("2026-04-02T10:00:00Z").toISOString(),
		messageCount: 10,
		isRunning: true,
		...overrides,
	};
}

function makeConfig(overrides = {}) {
	return {
		container: makeContainer(),
		api: makeApi(),
		getActiveSessionId: mock(() => null),
		onSelectSession: mock(),
		...overrides,
	};
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("createActiveSession — interface", () => {
	test("returns object with update and getElement methods", () => {
		const activeSession = createActiveSession(makeConfig());
		expect(typeof activeSession.update).toBe("function");
		expect(typeof activeSession.getElement).toBe("function");
	});

	test("getElement returns HTMLElement", () => {
		const activeSession = createActiveSession(makeConfig());
		expect(activeSession.getElement()).toBeInstanceOf(HTMLElement);
	});
});

describe("createActiveSession — with running sessions", () => {
	test("update() fetches GET /api/active-sessions", async () => {
		const api = makeApi([makeRunningSession()]);
		const activeSession = createActiveSession(makeConfig({ api }));

		await activeSession.update();

		expect(api.getJson).toHaveBeenCalledTimes(1);
		expect(api.getJson.mock.calls[0][0]).toContain("/api/active-sessions");
	});

	test("renders running sessions as .si rows", async () => {
		const sessions = [
			makeRunningSession({ id: "run-1" }),
			makeRunningSession({ id: "run-2" }),
		];
		const api = makeApi(sessions);
		const activeSession = createActiveSession(makeConfig({ api }));

		await activeSession.update();

		const el = activeSession.getElement();
		const rows = el.querySelectorAll(".si");
		expect(rows.length).toBe(2);
	});

	test("renders ALL running sessions (not just one)", async () => {
		const sessions = [
			makeRunningSession({ id: "run-1" }),
			makeRunningSession({ id: "run-2" }),
			makeRunningSession({ id: "run-3" }),
		];
		const api = makeApi(sessions);
		const activeSession = createActiveSession(makeConfig({ api }));

		await activeSession.update();

		const rows = activeSession.getElement().querySelectorAll(".si");
		expect(rows.length).toBe(3);
	});

	test("shows ACTIVE label above the list", async () => {
		const api = makeApi([makeRunningSession()]);
		const activeSession = createActiveSession(makeConfig({ api }));

		await activeSession.update();

		const el = activeSession.getElement();
		const label = el.querySelector(".active-zone-label");
		expect(label).not.toBeNull();
		expect(label.textContent).toContain("ACTIVE");
	});

	test("highlights the viewed session with .active class", async () => {
		const viewedId = "viewed-session";
		const sessions = [
			makeRunningSession({ id: viewedId }),
			makeRunningSession({ id: "other-session" }),
		];
		const api = makeApi(sessions);
		const getActiveSessionId = mock(() => viewedId);
		const activeSession = createActiveSession(
			makeConfig({ api, getActiveSessionId }),
		);

		await activeSession.update();

		const rows = activeSession.getElement().querySelectorAll(".si");
		let activeCount = 0;
		rows.forEach((row) => {
			if (row.classList.contains("active")) {
				activeCount++;
				expect(row.dataset.sessionId).toBe(viewedId);
			}
		});
		expect(activeCount).toBe(1);
	});

	test("does not highlight any session when getActiveSessionId returns null", async () => {
		const sessions = [makeRunningSession({ id: "run-1" })];
		const api = makeApi(sessions);
		const activeSession = createActiveSession(
			makeConfig({ api, getActiveSessionId: mock(() => null) }),
		);

		await activeSession.update();

		const rows = activeSession.getElement().querySelectorAll(".si");
		rows.forEach((row) => {
			expect(row.classList.contains("active")).toBe(false);
		});
	});

	test("renders running dot for active sessions", async () => {
		const sessions = [makeRunningSession()];
		const api = makeApi(sessions);
		const activeSession = createActiveSession(makeConfig({ api }));

		await activeSession.update();

		const dots = activeSession
			.getElement()
			.querySelectorAll(".si-run-dot");
		expect(dots.length).toBeGreaterThan(0);
	});
});

describe("createActiveSession — with no running sessions", () => {
	test("hides the section when no active sessions", async () => {
		const api = makeApi([]); // no sessions
		const activeSession = createActiveSession(makeConfig({ api }));

		await activeSession.update();

		const el = activeSession.getElement();
		// Section should be hidden or empty
		const rows = el.querySelectorAll(".si");
		expect(rows.length).toBe(0);
	});
});

describe("createActiveSession — click handling", () => {
	test("clicking a session row calls onSelectSession", async () => {
		const session = makeRunningSession({ id: "clickable-session" });
		const api = makeApi([session]);
		const onSelectSession = mock();
		const activeSession = createActiveSession(
			makeConfig({ api, onSelectSession }),
		);

		await activeSession.update();

		const row = activeSession
			.getElement()
			.querySelector(".si");
		expect(row).not.toBeNull();
		row.click();

		expect(onSelectSession).toHaveBeenCalledTimes(1);
		expect(onSelectSession).toHaveBeenCalledWith(
			expect.objectContaining({ id: "clickable-session" }),
		);
	});
});

describe("createActiveSession — refresh behavior", () => {
	test("update() replaces previous sessions with fresh data", async () => {
		const firstBatch = [makeRunningSession({ id: "old-1" })];
		const secondBatch = [
			makeRunningSession({ id: "new-1" }),
			makeRunningSession({ id: "new-2" }),
		];

		let callCount = 0;
		const api = {
			getJson: mock(() => {
				callCount++;
				return Promise.resolve({
					sessions: callCount === 1 ? firstBatch : secondBatch,
				});
			}),
			postJson: mock(),
			deleteJson: mock(),
		};

		const activeSession = createActiveSession(makeConfig({ api }));

		// First update
		await activeSession.update();
		expect(
			activeSession.getElement().querySelectorAll(".si").length,
		).toBe(1);

		// Second update — should replace, not append
		await activeSession.update();
		const rows = activeSession.getElement().querySelectorAll(".si");
		expect(rows.length).toBe(2);
	});
});

import { describe, expect, test, mock } from "bun:test";

// ─── createSessionRow tests ─────────────────────────────────────────────────
//
// Factory function: createSessionRow({ session, isActive, onSelect })
// Returns: { getElement(), update(session) }
//
// Contract (from plan):
//   - Creates .si div with data-session-id
//   - .si-name: session.name || session.firstMessage || session.id.slice(0, 8)
//   - .si-meta: relativeTime(session.modified) + (isRunning ? " · running" : "")
//   - If isRunning: prepend <span class="si-run-dot"></span> before .si-name
//   - If isActive: add .active class
//   - Click handler: onSelect(session)
//   - Return { getElement(), update(session) }
//
// NOTE: This function does NOT exist yet — TDD Red phase.

import { createSessionRow } from "../../public/app/ui/sidebar/session-row.js";

function makeSession(overrides = {}) {
	return {
		id: "sess-abc123def456",
		path: "/home/user/.pi/sessions/sess-abc123def456.jsonl",
		cwd: "/home/user/project",
		name: undefined,
		firstMessage: "Hello world",
		created: new Date("2026-04-01T10:00:00Z").toISOString(),
		modified: new Date("2026-04-02T10:00:00Z").toISOString(),
		messageCount: 5,
		isRunning: false,
		...overrides,
	};
}

describe("createSessionRow — happy path", () => {
	test("returns object with getElement and update methods", () => {
		const row = createSessionRow({
			session: makeSession(),
			isActive: false,
			onSelect: () => {},
		});
		expect(typeof row.getElement).toBe("function");
		expect(typeof row.update).toBe("function");
	});

	test("getElement returns an HTMLElement", () => {
		const row = createSessionRow({
			session: makeSession(),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		expect(el).toBeInstanceOf(HTMLElement);
	});

	test("element has .si class", () => {
		const row = createSessionRow({
			session: makeSession(),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		expect(el.classList.contains("si")).toBe(true);
	});

	test("element has data-session-id attribute", () => {
		const session = makeSession();
		const row = createSessionRow({
			session,
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		expect(el.dataset.sessionId).toBe(session.id);
	});

	test("renders firstMessage as name when no session.name", () => {
		const row = createSessionRow({
			session: makeSession({ firstMessage: "Build the feature" }),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const nameEl = el.querySelector(".si-name");
		expect(nameEl).not.toBeNull();
		expect(nameEl.textContent).toContain("Build the feature");
	});

	test("renders session.name over firstMessage when both present", () => {
		const row = createSessionRow({
			session: makeSession({
				name: "My Custom Name",
				firstMessage: "Ignored text",
			}),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const nameEl = el.querySelector(".si-name");
		expect(nameEl.textContent).toContain("My Custom Name");
	});

	test("falls back to session.id prefix when no name and no firstMessage", () => {
		const row = createSessionRow({
			session: makeSession({ name: undefined, firstMessage: "" }),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const nameEl = el.querySelector(".si-name");
		expect(nameEl.textContent).toContain("sess-abc");
	});

	test("renders .si-meta with relative time", () => {
		const row = createSessionRow({
			session: makeSession(),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const metaEl = el.querySelector(".si-meta");
		expect(metaEl).not.toBeNull();
		// Should contain some time-related text (exact format is flexible)
		expect(metaEl.textContent.length).toBeGreaterThan(0);
	});

	test("renders running indicator in meta when isRunning", () => {
		const row = createSessionRow({
			session: makeSession({ isRunning: true }),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const metaEl = el.querySelector(".si-meta");
		expect(metaEl.textContent).toContain("running");
	});
});

describe("createSessionRow — active & running state", () => {
	test("adds .active class when isActive is true", () => {
		const row = createSessionRow({
			session: makeSession(),
			isActive: true,
			onSelect: () => {},
		});
		const el = row.getElement();
		expect(el.classList.contains("active")).toBe(true);
	});

	test("does not add .active class when isActive is false", () => {
		const row = createSessionRow({
			session: makeSession(),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		expect(el.classList.contains("active")).toBe(false);
	});

	test("renders .si-run-dot when isRunning is true", () => {
		const row = createSessionRow({
			session: makeSession({ isRunning: true }),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const dot = el.querySelector(".si-run-dot");
		expect(dot).not.toBeNull();
	});

	test("does not render .si-run-dot when isRunning is false", () => {
		const row = createSessionRow({
			session: makeSession({ isRunning: false }),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const dot = el.querySelector(".si-run-dot");
		expect(dot).toBeNull();
	});
});

describe("createSessionRow — click handling", () => {
	test("calls onSelect with session on click", () => {
		const session = makeSession();
		const onSelect = mock();
		const row = createSessionRow({
			session,
			isActive: false,
			onSelect,
		});
		const el = row.getElement();
		el.click();
		expect(onSelect).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledWith(session);
	});
});

describe("createSessionRow — dirty data (edge cases)", () => {
	test("handles missing firstMessage gracefully", () => {
		const row = createSessionRow({
			session: makeSession({
				name: undefined,
				firstMessage: undefined,
			}),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		// Should not throw, should show something (fallback to id)
		const nameEl = el.querySelector(".si-name");
		expect(nameEl).not.toBeNull();
		expect(nameEl.textContent.length).toBeGreaterThan(0);
	});

	test("handles null firstMessage gracefully", () => {
		const row = createSessionRow({
			session: makeSession({
				name: undefined,
				firstMessage: null,
			}),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const nameEl = el.querySelector(".si-name");
		expect(nameEl).not.toBeNull();
	});

	test("escapes HTML in firstMessage to prevent XSS", () => {
		const row = createSessionRow({
			session: makeSession({
				firstMessage: '<script>alert("xss")</script>',
			}),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const nameEl = el.querySelector(".si-name");
		// The script tag should NOT be in the DOM as an actual element
		const scriptInDom = nameEl.querySelector("script");
		expect(scriptInDom).toBeNull();
		// The text should be escaped or set as textContent
		expect(nameEl.innerHTML).not.toContain("<script>");
	});

	test("escapes HTML entities in firstMessage", () => {
		const row = createSessionRow({
			session: makeSession({
				firstMessage: 'Test <img src=x onerror=alert(1)>',
			}),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const nameEl = el.querySelector(".si-name");
		const imgInDom = nameEl.querySelector("img");
		expect(imgInDom).toBeNull();
	});

	test("truncates very long firstMessage", () => {
		const longMessage = "A".repeat(500);
		const row = createSessionRow({
			session: makeSession({ firstMessage: longMessage }),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const nameEl = el.querySelector(".si-name");
		// Should be truncated, not the full 500 chars
		expect(nameEl.textContent.length).toBeLessThan(500);
	});

	test("handles special Unicode characters", () => {
		const row = createSessionRow({
			session: makeSession({
				firstMessage: "日本語テスト 🎉 émoji",
			}),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const nameEl = el.querySelector(".si-name");
		expect(nameEl.textContent).toContain("日本語テスト");
	});

	test("handles very long session id gracefully in fallback", () => {
		const row = createSessionRow({
			session: makeSession({
				id: "a".repeat(200),
				name: undefined,
				firstMessage: "",
			}),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		const nameEl = el.querySelector(".si-name");
		// Should show a prefix of the id, not the whole thing
		expect(nameEl.textContent.length).toBeLessThan(200);
	});
});

describe("createSessionRow — update method", () => {
	test("update(session) changes the displayed name", () => {
		const row = createSessionRow({
			session: makeSession({ firstMessage: "Original" }),
			isActive: false,
			onSelect: () => {},
		});
		const el = row.getElement();
		expect(el.querySelector(".si-name").textContent).toContain("Original");

		row.update(makeSession({ firstMessage: "Updated message" }));
		expect(el.querySelector(".si-name").textContent).toContain(
			"Updated message",
		);
	});

	test("update(session) updates running state", () => {
		const row = createSessionRow({
			session: makeSession({ isRunning: false }),
			isActive: false,
			onSelect: () => {},
		});
		expect(row.getElement().querySelector(".si-run-dot")).toBeNull();

		row.update(makeSession({ isRunning: true }));
		expect(row.getElement().querySelector(".si-run-dot")).not.toBeNull();
	});
});

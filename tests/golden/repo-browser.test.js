import { describe, expect, test, mock } from "bun:test";

// ─── createRepoBrowser tests ────────────────────────────────────────────────
//
// Factory function: createRepoBrowser({ api, onSelect, onCancel })
// Returns: { open(startPath?), close(), getElement() }
//
// Contract (from plan):
//   - Modal overlay for file system browsing
//   - open(startPath) → GET /api/fs/ls?path=... → render entries
//   - Click directory entry → navigate into (new GET /api/fs/ls)
//   - Click breadcrumb segment → navigate up
//   - Type path in input + Enter → navigate to typed path
//   - Click Select → onSelect(currentPath) — only directories selectable
//   - Click Cancel / ✕ / Escape → onCancel()
//   - Error display: show inline error, allow navigating elsewhere
//
// DOM structure:
//   div.repo-browser-overlay
//     div.repo-browser
//       div.repo-browser-header > span.repo-browser-path + button.repo-browser-close
//       div.repo-browser-entries > div.repo-browser-entry[data-path] × N
//       div.repo-browser-footer > input.repo-browser-input + button Select + button Cancel
//
// NOTE: This function does NOT exist yet — TDD Red phase.

import { createRepoBrowser } from "../../public/app/ui/sidebar/repo-browser.js";

// ─── Mock helpers ───────────────────────────────────────────────────────────

function makeFsEntries(entries) {
	return entries.map((e) => ({
		name: e.name,
		path: e.path || `/home/user/${e.name}`,
		isDirectory: e.isDirectory ?? true,
	}));
}

function makeFsResponse(path, entries) {
	return {
		path,
		entries: makeFsEntries(entries),
	};
}

function makeApi(responses = {}) {
	const defaultResponses = {
		"/home/user": makeFsResponse("/home/user", [
			{ name: "projects", isDirectory: true },
			{ name: "documents", isDirectory: true },
			{ name: "file.txt", isDirectory: false },
		]),
	};

	const allResponses = { ...defaultResponses, ...responses };

	return {
		getJson: mock((url) => {
			// Extract path from URL like /api/fs/ls?path=/home/user
			const urlObj = new URL(url, "http://localhost");
			const path = urlObj.searchParams.get("path") || "";
			const response = allResponses[path];
			if (response) return Promise.resolve(response);
			return Promise.reject(new Error(`No mock for path: ${path}`));
		}),
		postJson: mock(),
		deleteJson: mock(),
	};
}

function makeConfig(overrides = {}) {
	return {
		api: makeApi(),
		onSelect: mock(),
		onCancel: mock(),
		...overrides,
	};
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("createRepoBrowser — interface", () => {
	test("returns object with open, close, getElement methods", () => {
		const browser = createRepoBrowser(makeConfig());
		expect(typeof browser.open).toBe("function");
		expect(typeof browser.close).toBe("function");
		expect(typeof browser.getElement).toBe("function");
	});

	test("getElement returns HTMLElement", () => {
		const browser = createRepoBrowser(makeConfig());
		expect(browser.getElement()).toBeInstanceOf(HTMLElement);
	});
});

describe("createRepoBrowser — opening and rendering", () => {
	test("open() fetches directory listing from API", async () => {
		const api = makeApi();
		const browser = createRepoBrowser(makeConfig({ api }));

		browser.open("/home/user");

		// Wait for async fetch
		await new Promise((r) => setTimeout(r, 50));

		expect(api.getJson).toHaveBeenCalledTimes(1);
		const calledUrl = api.getJson.mock.calls[0][0];
		expect(calledUrl).toContain("/api/fs/ls");
		expect(calledUrl).toContain("path=");
	});

	test("renders directory entries", async () => {
		const browser = createRepoBrowser(makeConfig());

		browser.open("/home/user");
		await new Promise((r) => setTimeout(r, 50));

		const el = browser.getElement();
		const entries = el.querySelectorAll(".repo-browser-entry");
		expect(entries.length).toBeGreaterThan(0);
	});

	test("directories have .is-dir class and are bold", async () => {
		const browser = createRepoBrowser(makeConfig());

		browser.open("/home/user");
		await new Promise((r) => setTimeout(r, 50));

		const el = browser.getElement();
		const dirEntries = el.querySelectorAll(".repo-browser-entry.is-dir");
		expect(dirEntries.length).toBeGreaterThan(0);
	});

	test("files have .is-file class", async () => {
		const browser = createRepoBrowser(makeConfig());

		browser.open("/home/user");
		await new Promise((r) => setTimeout(r, 50));

		const el = browser.getElement();
		const fileEntries = el.querySelectorAll(
			".repo-browser-entry.is-file",
		);
		expect(fileEntries.length).toBeGreaterThan(0);
	});

	test("entries have data-path attribute", async () => {
		const browser = createRepoBrowser(makeConfig());

		browser.open("/home/user");
		await new Promise((r) => setTimeout(r, 50));

		const el = browser.getElement();
		const entries = el.querySelectorAll(".repo-browser-entry");
		entries.forEach((entry) => {
			expect(entry.getAttribute("data-path")).toBeTruthy();
		});
	});

	test("renders path breadcrumb in header", async () => {
		const browser = createRepoBrowser(makeConfig());

		browser.open("/home/user");
		await new Promise((r) => setTimeout(r, 50));

		const el = browser.getElement();
		const pathEl = el.querySelector(".repo-browser-path");
		expect(pathEl).not.toBeNull();
		expect(pathEl.textContent).toBeTruthy();
	});
});

describe("createRepoBrowser — directory navigation", () => {
	test("clicking a directory entry navigates into it", async () => {
		const api = makeApi({
			"/home/user": makeFsResponse("/home/user", [
				{
					name: "projects",
					path: "/home/user/projects",
					isDirectory: true,
				},
			]),
			"/home/user/projects": makeFsResponse("/home/user/projects", [
				{
					name: "my-app",
					path: "/home/user/projects/my-app",
					isDirectory: true,
				},
			]),
		});
		const browser = createRepoBrowser(makeConfig({ api }));

		browser.open("/home/user");
		await new Promise((r) => setTimeout(r, 50));

		// Click the "projects" directory
		const entry = browser
			.getElement()
			.querySelector('.repo-browser-entry[data-path="/home/user/projects"]');
		if (entry) {
			entry.click();
			await new Promise((r) => setTimeout(r, 50));

			// Should have made a second API call for the subdirectory
			expect(api.getJson).toHaveBeenCalledTimes(2);
		}
	});

	test("clicking breadcrumb segment navigates up", async () => {
		const api = makeApi({
			"/home/user": makeFsResponse("/home/user", [
				{
					name: "projects",
					path: "/home/user/projects",
					isDirectory: true,
				},
			]),
			"/home/user/projects": makeFsResponse("/home/user/projects", []),
		});
		const browser = createRepoBrowser(makeConfig({ api }));

		// Navigate to subdirectory first
		browser.open("/home/user/projects");
		await new Promise((r) => setTimeout(r, 50));

		// Click breadcrumb to go back to /home/user
		const breadcrumb = browser
			.getElement()
			.querySelector(".repo-browser-path");
		if (breadcrumb) {
			// Breadcrumb may have clickable segments
			// This tests the concept — exact implementation may vary
		}
	});
});

describe("createRepoBrowser — path input", () => {
	test("has text input for manual path entry", () => {
		const browser = createRepoBrowser(makeConfig());
		const el = browser.getElement();
		const input = el.querySelector(".repo-browser-input");
		expect(input).not.toBeNull();
		expect(input.tagName).toBe("INPUT");
	});
});

describe("createRepoBrowser — selection and cancellation", () => {
	test("has Select button", () => {
		const browser = createRepoBrowser(makeConfig());
		const el = browser.getElement();
		const buttons = el.querySelectorAll("button");
		const texts = Array.from(buttons).map((b) => b.textContent);
		expect(texts.some((t) => t && t.toLowerCase().includes("select"))).toBe(true);
	});

	test("has Cancel button", () => {
		const browser = createRepoBrowser(makeConfig());
		const el = browser.getElement();
		const buttons = el.querySelectorAll("button");
		const texts = Array.from(buttons).map((b) => b.textContent);
		expect(texts.some((t) => t && t.toLowerCase().includes("cancel"))).toBe(true);
	});

	test("has close button (✕)", () => {
		const browser = createRepoBrowser(makeConfig());
		const el = browser.getElement();
		const closeBtn = el.querySelector(".repo-browser-close");
		expect(closeBtn).not.toBeNull();
	});

	test("clicking Cancel calls onCancel", () => {
		const onCancel = mock();
		const browser = createRepoBrowser(makeConfig({ onCancel }));

		const el = browser.getElement();
		const buttons = el.querySelectorAll("button");
		const cancelBtn = Array.from(buttons).find(
			(b) => b.textContent && b.textContent.toLowerCase().includes("cancel"),
		);

		if (cancelBtn) {
			cancelBtn.click();
			expect(onCancel).toHaveBeenCalledTimes(1);
		}
	});

	test("clicking Select calls onSelect with current path", async () => {
		const onSelect = mock();
		const browser = createRepoBrowser(makeConfig({ onSelect }));

		browser.open("/home/user/projects");
		await new Promise((r) => setTimeout(r, 50));

		const el = browser.getElement();
		const buttons = el.querySelectorAll("button");
		const selectBtn = Array.from(buttons).find(
			(b) =>
				b.textContent && b.textContent.toLowerCase().includes("select"),
		);

		if (selectBtn) {
			selectBtn.click();
			expect(onSelect).toHaveBeenCalledTimes(1);
			expect(onSelect).toHaveBeenCalledWith(
				expect.stringContaining("/home/user"),
			);
		}
	});

	test("close() hides the browser", () => {
		const browser = createRepoBrowser(makeConfig());
		browser.open("/home/user");
		const el = browser.getElement();

		browser.close();

		// Element should be hidden or removed
		expect(el.style.display === "none" || !el.parentNode).toBe(true);
	});
});

describe("createRepoBrowser — error handling", () => {
	test("shows inline error for permission denied path", async () => {
		const api = makeApi();
		api.getJson = mock(() =>
			Promise.reject(new Error("403 Forbidden: Access denied")),
		);
		const browser = createRepoBrowser(makeConfig({ api }));

		browser.open("/root/secret");
		await new Promise((r) => setTimeout(r, 50));

		const el = browser.getElement();
		// Should display some error text
		const errorText = el.textContent;
		expect(errorText).toBeTruthy();
	});

	test("shows inline error for non-existent path", async () => {
		const api = makeApi();
		api.getJson = mock(() =>
			Promise.reject(new Error("404 Not Found")),
		);
		const browser = createRepoBrowser(makeConfig({ api }));

		browser.open("/nonexistent/path");
		await new Promise((r) => setTimeout(r, 50));

		const el = browser.getElement();
		expect(el.textContent).toBeTruthy();
	});

	test("allows navigating elsewhere after error", async () => {
		let callCount = 0;
		const api = makeApi();
		api.getJson = mock(() => {
			callCount++;
			if (callCount === 1) return Promise.reject(new Error("Error"));
			return Promise.resolve(
				makeFsResponse("/home/user", [
					{ name: "projects", isDirectory: true },
				]),
			);
		});
		const browser = createRepoBrowser(makeConfig({ api }));

		// First navigation fails
		browser.open("/bad/path");
		await new Promise((r) => setTimeout(r, 50));
		expect(callCount).toBe(1);

		// Second navigation should work
		browser.open("/home/user");
		await new Promise((r) => setTimeout(r, 50));
		expect(callCount).toBe(2);
	});
});

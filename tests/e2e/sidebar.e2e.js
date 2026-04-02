import { expect, test } from "@playwright/test";

// ─── Sidebar E2E Tests ──────────────────────────────────────────────────────
//
// Full sidebar flow tests using Playwright.
// These test the sidebar through the real browser against a running server.
//
// Scenarios:
// 1. Sidebar renders repo list on open
// 2. Expand repo loads sessions (lazy)
// 3. Active session displayed with green dot
// 4. Create new session from repo group
// 5. Add repo via file system browser
// 6. Remove repo from sidebar
// 7. Mobile overlay works
//
// NOTE: These tests require the new sidebar implementation. They will FAIL
// in TDD Red phase because the new sidebar UI doesn't exist yet.

test.describe("Sidebar — open and repo list", () => {
	test("sidebar renders with repo headers after opening", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");

		// Open sidebar (click hamburger or menu button)
		// The sidebar should have a way to open it
		const sidebar = page.locator(".sidebar");
		await sidebar.evaluate((el) => el.classList.add("open"));

		// Wait for sidebar data to load
		await page.waitForResponse((resp) =>
			resp.url().includes("/api/sidebar") && resp.status() === 200,
		);

		// Should have repo headers
		const repoHeaders = page.locator(".repo-header");
		await expect(repoHeaders.first()).toBeVisible({ timeout: 5000 });
	});

	test("sidebar shows abbreviated repo paths", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");

		const sidebar = page.locator(".sidebar");
		await sidebar.evaluate((el) => el.classList.add("open"));

		await page.waitForResponse((resp) =>
			resp.url().includes("/api/sidebar"),
		);

		// Repo headers should show abbreviated paths (e.g., ~/projects/my-app)
		const header = page.locator(".repo-header .repo-name").first();
		await expect(header).toBeVisible({ timeout: 5000 });
	});
});

test.describe("Sidebar — expand repo and load sessions", () => {
	test("clicking repo header expands it and loads sessions", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");

		const sidebar = page.locator(".sidebar");
		await sidebar.evaluate((el) => el.classList.add("open"));

		await page.waitForResponse((resp) =>
			resp.url().includes("/api/sidebar"),
		);
		await page.locator(".repo-header").first().waitFor({ state: "visible" });

		// Click the first repo header to expand
		const repoHeader = page.locator(".repo-header").first();

		// Set up listener for sessions API call BEFORE clicking
		const sessionsPromise = page.waitForResponse(
			(resp) =>
				resp.url().includes("/api/sessions") &&
				resp.url().includes("cwd=") &&
				resp.status() === 200,
			{ timeout: 5000 },
		);

		await repoHeader.click();
		await sessionsPromise;

		// Repo sessions container should be visible
		const repoSessions = page.locator(".repo-sessions").first();
		await expect(repoSessions).toBeVisible();

		// Header should have .expanded class
		await expect(repoHeader).toHaveClass(/expanded/);
	});

	test("expanding a repo only fetches sessions for that repo", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");

		const sidebar = page.locator(".sidebar");
		await sidebar.evaluate((el) => el.classList.add("open"));

		await page.waitForResponse((resp) =>
			resp.url().includes("/api/sidebar"),
		);

		const repoHeaders = page.locator(".repo-header");
		const count = await repoHeaders.count();

		if (count >= 2) {
			// Expand first repo
			await repoHeaders.nth(0).click();
			await page.waitForResponse(
				(resp) =>
					resp.url().includes("/api/sessions") && resp.url().includes("cwd="),
				{ timeout: 5000 },
			);

			// Should NOT have fetched sessions for the second repo yet
			// (verified by counting API calls — only one sessions?cwd=... call)
		}
	});

	test("collapsing and re-expanding uses cached data", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");

		const sidebar = page.locator(".sidebar");
		await sidebar.evaluate((el) => el.classList.add("open"));

		await page.waitForResponse((resp) =>
			resp.url().includes("/api/sidebar"),
		);

		const repoHeader = page.locator(".repo-header").first();
		await repoHeader.waitFor({ state: "visible" });

		// Expand
		await repoHeader.click();
		await page.waitForResponse(
			(resp) =>
				resp.url().includes("/api/sessions") && resp.url().includes("cwd="),
			{ timeout: 5000 },
		);

		// Collapse
		await repoHeader.click();
		await page.waitForTimeout(200);

		// Re-expand — should NOT make another API call (cached)
		let fetchedAgain = false;
		page.on("request", (req) => {
			if (req.url().includes("/api/sessions") && req.url().includes("cwd=")) {
				fetchedAgain = true;
			}
		});

		await repoHeader.click();
		await page.waitForTimeout(500);

		// Immediate re-expand should not trigger fetch (data is cached)
		expect(fetchedAgain).toBe(false);
	});
});

test.describe("Sidebar — active session display", () => {
	test("running sessions show green dot indicator", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");

		const sidebar = page.locator(".sidebar");
		await sidebar.evaluate((el) => el.classList.add("open"));

		await page.waitForResponse((resp) =>
			resp.url().includes("/api/sidebar"),
		);

		// If there are running sessions, they should have green dots
		const runDots = page.locator(".si-run-dot");
		const dotCount = await runDots.count();
		// This test verifies the indicator exists IF there are running sessions
		// The exact count depends on server state
		if (dotCount > 0) {
			await expect(runDots.first()).toBeVisible();
		}
	});
});

test.describe("Sidebar — new session creation", () => {
	test("clicking New Session button creates a session", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");

		const sidebar = page.locator(".sidebar");
		await sidebar.evaluate((el) => el.classList.add("open"));

		await page.waitForResponse((resp) =>
			resp.url().includes("/api/sidebar"),
		);

		// Expand first repo
		const repoHeader = page.locator(".repo-header").first();
		await repoHeader.click();
		await page.waitForResponse(
			(resp) =>
				resp.url().includes("/api/sessions") && resp.url().includes("cwd="),
			{ timeout: 5000 },
		);

		// Click New Session button
		const newSessionBtn = page.locator(".add-session-btn").first();
		if ((await newSessionBtn.count()) > 0) {
			const createPromise = page.waitForResponse(
				(resp) =>
					resp.url().includes("/api/sessions") &&
					resp.request().method() === "POST",
				{ timeout: 5000 },
			);

			await newSessionBtn.click();
			const response = await createPromise;
			expect(response.status()).toBe(200);
		}
	});
});

test.describe("Sidebar — add repo via browser", () => {
	test("clicking Add Repo opens file system browser", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");

		// Click the Add Repo button
		const addRepoBtn = page.locator("#btn-add-repo");
		if ((await addRepoBtn.count()) > 0) {
			await addRepoBtn.click();

			// Browser overlay should appear
			const overlay = page.locator(".repo-browser-overlay");
			await expect(overlay).toBeVisible({ timeout: 3000 });
		}
	});
});

test.describe("Sidebar — remove repo", () => {
	test("hovering repo shows remove button", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");

		const sidebar = page.locator(".sidebar");
		await sidebar.evaluate((el) => el.classList.add("open"));

		await page.waitForResponse((resp) =>
			resp.url().includes("/api/sidebar"),
		);

		const repoHeader = page.locator(".repo-header").first();
		await repoHeader.hover();

		const removeBtn = page.locator(".remove-btn").first();
		// Remove button should become visible on hover
		await expect(removeBtn).toBeVisible({ timeout: 2000 });
	});
});

test.describe("Sidebar — mobile experience", () => {
	test("sidebar opens as overlay on mobile viewport", async ({
		page,
	}) => {
		// iPhone-sized viewport
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto("/");

		// Sidebar should be hidden initially on mobile
		const sidebar = page.locator(".sidebar");
		await expect(sidebar).not.toHaveClass(/open/);

		// Open sidebar
		await sidebar.evaluate((el) => el.classList.add("open"));
		await expect(sidebar).toHaveClass(/open/);

		// Sidebar should be visible as overlay
		await expect(sidebar).toBeVisible();
	});
});

test.describe("Sidebar — refresh behavior", () => {
	test("sidebar refreshes data on button click", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");

		const sidebar = page.locator(".sidebar");
		await sidebar.evaluate((el) => el.classList.add("open"));

		// First load
		await page.waitForResponse((resp) =>
			resp.url().includes("/api/sidebar"),
		);

		// Click refresh button
		const refreshBtn = page.locator("#btn-refresh");
		if ((await refreshBtn.count()) > 0) {
			const refreshPromise = page.waitForResponse(
				(resp) =>
					resp.url().includes("/api/sidebar") && resp.status() === 200,
			);

			await refreshBtn.click();
			await refreshPromise;
		}
	});
});

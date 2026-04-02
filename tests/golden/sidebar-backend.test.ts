import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";

// ─── Pure function tests: isPathAllowed ─────────────────────────────────────
//
// isPathAllowed(resolvedPath: string, homeDir: string) → boolean
//
// Contract (from plan):
//   - Must start with homeDir
//   - Block /proc, /sys, /dev, /etc
//   - After realpath resolution, re-check boundary

describe("isPathAllowed", () => {
	let isPathAllowed: (resolvedPath: string, homeDir: string) => boolean;

	// Dynamic import to capture the "not implemented" error clearly
	async function loadModule() {
		const mod = await import("../../src/session-runtime.ts");
		isPathAllowed = mod.isPathAllowed;
	}

	test("allows path under home directory", async () => {
		await loadModule();
		expect(isPathAllowed(join("/home", "testuser", "projects"), "/home/testuser")).toBe(true);
	});

	test("allows deeply nested path under home directory", async () => {
		await loadModule();
		expect(isPathAllowed("/home/testuser/a/b/c/d", "/home/testuser")).toBe(true);
	});

	test("allows exact home directory path", async () => {
		await loadModule();
		expect(isPathAllowed("/home/testuser", "/home/testuser")).toBe(true);
	});

	test("blocks /etc/passwd", async () => {
		await loadModule();
		expect(isPathAllowed("/etc/passwd", "/home/testuser")).toBe(false);
	});

	test("blocks /etc itself", async () => {
		await loadModule();
		expect(isPathAllowed("/etc", "/home/testuser")).toBe(false);
	});

	test("blocks /proc filesystem", async () => {
		await loadModule();
		expect(isPathAllowed("/proc/self", "/home/testuser")).toBe(false);
	});

	test("blocks /sys filesystem", async () => {
		await loadModule();
		expect(isPathAllowed("/sys/kernel", "/home/testuser")).toBe(false);
	});

	test("blocks /dev", async () => {
		await loadModule();
		expect(isPathAllowed("/dev/null", "/home/testuser")).toBe(false);
	});

	test("blocks path outside home directory (/tmp)", async () => {
		await loadModule();
		expect(isPathAllowed("/tmp/evil", "/home/testuser")).toBe(false);
	});

	test("blocks parent of home directory", async () => {
		await loadModule();
		expect(isPathAllowed("/home", "/home/testuser")).toBe(false);
	});

	test("blocks root directory", async () => {
		await loadModule();
		expect(isPathAllowed("/", "/home/testuser")).toBe(false);
	});

	test("blocks path traversal attempt via resolved path", async () => {
		await loadModule();
		// Even a "resolved" path that escaped home should be blocked
		expect(isPathAllowed("/etc/shadow", "/home/testuser")).toBe(false);
	});

	test("allows home directory with trailing slash", async () => {
		await loadModule();
		expect(isPathAllowed("/home/testuser/", "/home/testuser")).toBe(true);
	});

	test("handles homeDir with trailing slash in parameter", async () => {
		await loadModule();
		expect(isPathAllowed("/home/testuser/projects", "/home/testuser/")).toBe(true);
	});

	test("blocks similarly prefixed but different user", async () => {
		await loadModule();
		// /home/testuser2 should not be allowed for homeDir=/home/testuser
		expect(isPathAllowed("/home/testuser2", "/home/testuser")).toBe(false);
	});
});

// ─── HTTP route integration tests ───────────────────────────────────────────
//
// These tests verify the new API endpoints through real HTTP requests.
// The server is started ONCE for all HTTP tests and killed at the end.
//
// Contracts tested:
//   GET /api/sidebar → { homeDir, repos: ApiRepoEntry[], activeSessions: ApiSessionSummary[] }
//   GET /api/fs/ls?path=... → FsListResponse
//   DELETE /api/repos → 204 No Content
//   GET /api/sessions?cwd=... → { sessions: ApiSessionSummary[] }

import { mkdir, rm } from "node:fs/promises";
import { spawn, Subprocess } from "bun";

const TEST_PORT = 14567;
const BASE = `http://127.0.0.1:${TEST_PORT}`;

// Shared server process for all HTTP tests
let serverProc: Subprocess<"pipe", "pipe", "pipe"> | null = null;

async function startServer(): Promise<void> {
	if (serverProc) return; // Already started

	serverProc = spawn({
		cmd: ["bun", "run", "src/server.ts"],
		env: {
			...process.env,
			PI_WEB_HOST: "127.0.0.1",
			PI_WEB_PORT: String(TEST_PORT),
		},
		stdout: "pipe",
		stderr: "pipe",
	});

	// Wait for server to be ready
	for (let i = 0; i < 30; i++) {
		try {
			const res = await fetch(`${BASE}/health`);
			if (res.ok) return;
		} catch {
			await new Promise((r) => setTimeout(r, 500));
		}
	}
	throw new Error("Server did not start in time");
}

function stopServer(): void {
	if (serverProc) {
		try {
			serverProc.kill();
		} catch {
			// Server might already be dead
		}
		serverProc = null;
	}
}

// ─── HTTP Tests: GET /api/sidebar ───────────────────────────────────────────

describe("GET /api/sidebar", () => {
	beforeAll(async () => {
		await startServer();
	});

	test("returns 200 with correct JSON shape", async () => {
		const res = await fetch(`${BASE}/api/sidebar`);
		expect(res.status).toBe(200);

		const body = await res.json();
		// ApiSidebarResponse shape
		expect(typeof body.homeDir).toBe("string");
		expect(body.homeDir.length).toBeGreaterThan(0);
		expect(Array.isArray(body.repos)).toBe(true);
		expect(Array.isArray(body.activeSessions)).toBe(true);
	});

	test("repos have cwd and lastActivity fields", async () => {
		const res = await fetch(`${BASE}/api/sidebar`);
		expect(res.status).toBe(200);

		const body = await res.json();
		for (const repo of body.repos) {
			expect(typeof repo.cwd).toBe("string");
			expect(repo.cwd.length).toBeGreaterThan(0);
			// lastActivity: string | null
			expect(
				repo.lastActivity === null || typeof repo.lastActivity === "string",
			).toBe(true);
		}
	});

	test("repos are sorted by lastActivity descending, nulls at end", async () => {
		const res = await fetch(`${BASE}/api/sidebar`);
		expect(res.status).toBe(200);

		const body = await res.json();
		const repos = body.repos as Array<{
			cwd: string;
			lastActivity: string | null;
		}>;

		// Find boundary: repos with activity first, then nulls
		let seenNull = false;
		for (const repo of repos) {
			if (repo.lastActivity === null) {
				seenNull = true;
			} else {
				// If we've seen a null, there shouldn't be non-nulls after
				expect(seenNull).toBe(false);
			}
		}
	});

	test("activeSessions have required ApiSessionSummary fields", async () => {
		const res = await fetch(`${BASE}/api/sidebar`);
		expect(res.status).toBe(200);

		const body = await res.json();
		for (const session of body.activeSessions) {
			expect(typeof session.id).toBe("string");
			expect(typeof session.cwd).toBe("string");
			expect(typeof session.firstMessage).toBe("string");
			expect(typeof session.created).toBe("string");
			expect(typeof session.modified).toBe("string");
			expect(typeof session.messageCount).toBe("number");
			expect(typeof session.isRunning).toBe("boolean");
			// isRunning should always be true for active sessions
			expect(session.isRunning).toBe(true);
		}
	});
});

// ─── HTTP Tests: GET /api/fs/ls ─────────────────────────────────────────────

describe("GET /api/fs/ls", () => {
	beforeAll(async () => {
		await startServer();
	});

	test("returns 200 with sorted directory entries for valid home path", async () => {
		const homeDir = process.env.HOME || "/home/ubuntu";
		const res = await fetch(
			`${BASE}/api/fs/ls?path=${encodeURIComponent(homeDir)}`,
		);
		expect(res.status).toBe(200);

		const body = await res.json();
		// FsListResponse shape
		expect(typeof body.path).toBe("string");
		expect(Array.isArray(body.entries)).toBe(true);

		// Verify entries have correct shape
		for (const entry of body.entries) {
			expect(typeof entry.name).toBe("string");
			expect(typeof entry.path).toBe("string");
			expect(typeof entry.isDirectory).toBe("boolean");
		}

		// Verify sorting: directories first, then files
		let seenFile = false;
		for (const entry of body.entries) {
			if (!entry.isDirectory) {
				seenFile = true;
			} else {
				// After seeing a file, shouldn't see any more directories
				expect(seenFile).toBe(false);
			}
		}
	});

	test("returns 400 when path query param is missing", async () => {
		const res = await fetch(`${BASE}/api/fs/ls`);
		expect(res.status).toBe(400);
	});

	test("returns 403 for /etc (disallowed path)", async () => {
		const res = await fetch(
			`${BASE}/api/fs/ls?path=${encodeURIComponent("/etc")}`,
		);
		expect(res.status).toBe(403);
	});

	test("returns 403 for /proc (disallowed path)", async () => {
		const res = await fetch(
			`${BASE}/api/fs/ls?path=${encodeURIComponent("/proc")}`,
		);
		expect(res.status).toBe(403);
	});

	test("returns 404 for non-existent path", async () => {
		const res = await fetch(
			`${BASE}/api/fs/ls?path=${encodeURIComponent("/home/ubuntu/this-path-does-not-exist-xyz-12345")}`,
		);
		expect(res.status).toBe(404);
	});

	test("returns 403 for path traversal attempt", async () => {
		// Relative path that would escape home directory when resolved
		const res = await fetch(
			`${BASE}/api/fs/ls?path=${encodeURIComponent("/etc/passwd")}`,
		);
		// Should be 403 (disallowed) or 404 (not a directory) - both are acceptable rejections
		expect([403, 404]).toContain(res.status);
	});
});

// ─── HTTP Tests: DELETE /api/repos ──────────────────────────────────────────

describe("DELETE /api/repos", () => {
	beforeAll(async () => {
		await startServer();
	});

	test("returns 400 when cwd is missing from body", async () => {
		const res = await fetch(`${BASE}/api/repos`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	test("returns 400 when cwd is empty string", async () => {
		const res = await fetch(`${BASE}/api/repos`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: "" }),
		});
		expect(res.status).toBe(400);
	});

	test("returns 404 for non-existent repo", async () => {
		const res = await fetch(`${BASE}/api/repos`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: "/absolutely/not/a/real/repo/path" }),
		});
		expect(res.status).toBe(404);
	});

	test("returns 204 after successfully removing a repo", async () => {
		// First, add a repo so we can remove it
		const testCwd = "/tmp/pi-sidebar-test-" + Date.now();
		await mkdir(testCwd, { recursive: true });

		// Add the repo
		await fetch(`${BASE}/api/repos`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: testCwd }),
		});

		// Remove the repo
		const res = await fetch(`${BASE}/api/repos`, {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ cwd: testCwd }),
		});
		expect(res.status).toBe(204);

		// Verify: GET /api/repos should not contain the removed cwd
		const listRes = await fetch(`${BASE}/api/repos`);
		const listBody = await listRes.json();
		const cwds = listBody.repos.map((r: string) => r);
		expect(cwds).not.toContain(testCwd);

		// Cleanup
		await rm(testCwd, { recursive: true, force: true });
	});
});

// ─── HTTP Tests: GET /api/sessions?cwd=... ───────────────────────────────────

describe("GET /api/sessions?cwd=...", () => {
	beforeAll(async () => {
		await startServer();
	});

	test("returns sessions filtered by cwd", async () => {
		// Use a cwd that may or may not have sessions
		const testCwd = process.cwd();
		const res = await fetch(
			`${BASE}/api/sessions?cwd=${encodeURIComponent(testCwd)}`,
		);
		expect(res.status).toBe(200);

		const body = await res.json();
		expect(Array.isArray(body.sessions)).toBe(true);

		// All returned sessions should have the correct cwd
		for (const session of body.sessions) {
			expect(typeof session.id).toBe("string");
			expect(typeof session.cwd).toBe("string");
			// Sessions belong to the requested cwd
			expect(session.cwd).toBe(testCwd);
		}
	});
});

// ─── Global cleanup ─────────────────────────────────────────────────────────

afterAll(() => {
	stopServer();
});

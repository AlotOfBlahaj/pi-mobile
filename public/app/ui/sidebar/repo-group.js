import { createSessionRow } from "./session-row.js";
import { escapeHtml } from "../../core/html.js";

const STALE_MS = 30_000; // 30 seconds

function abbreviateCwd(cwd, homeDir) {
	if (cwd.startsWith(homeDir)) {
		const rest = cwd.slice(homeDir.length);
		if (rest === "") return "~";
		if (rest.startsWith("/")) return "~" + rest;
	}
	return cwd;
}

export function createRepoGroup({ cwd, homeDir, api, clientId, getActiveSessionId, onSelectSession, onSessionIdSelected, onNotice }) {
	const el = document.createElement("div");
	el.className = "repo-group";
	el.dataset.repoCwd = cwd;

	// State
	let expanded = false;
	let loading = false;
	let sessions = null;
	let lastFetchTime = 0;
	let error = null;

	// Header
	const header = document.createElement("div");
	header.className = "repo-header";
	header.innerHTML = `
		<span class="expand-icon">▶</span>
		<span class="repo-name" title="${escapeHtml(cwd)}">${escapeHtml(abbreviateCwd(cwd, homeDir))}</span>
		<button class="remove-btn" title="Remove repo">×</button>
	`;
	el.appendChild(header);

	// Sessions container
	const sessionsEl = document.createElement("div");
	sessionsEl.className = "repo-sessions";
	sessionsEl.style.display = "none";
	el.appendChild(sessionsEl);

	// Header click → toggle
	header.addEventListener("click", (e) => {
		if (e.target.classList.contains("remove-btn")) return;
		void setExpanded(!expanded);
	});

	// Remove button
	header.querySelector(".remove-btn").addEventListener("click", async (e) => {
		e.stopPropagation();
		try {
			await api.deleteJson("/api/repos", { cwd });
			// Parent will handle removal via refresh
		} catch (err) {
			onNotice(err instanceof Error ? err.message : String(err), "error");
		}
	});

	async function fetchSessions() {
		loading = true;
		error = null;
		renderLoading();
		try {
			const qs = new URLSearchParams({ cwd });
			const data = await api.getJson(`/api/sessions?${qs.toString()}`);
			sessions = Array.isArray(data.sessions) ? data.sessions : [];
			lastFetchTime = Date.now();
			loading = false;
			renderSessions();
		} catch (err) {
			loading = false;
			error = err instanceof Error ? err.message : String(err);
			renderError();
		}
	}

	function renderLoading() {
		sessionsEl.innerHTML = '<div class="sidebar-loading">Loading…</div>';
	}

	function renderSessions() {
		sessionsEl.innerHTML = "";

		// New Session button at the top
		const newBtn = document.createElement("button");
		newBtn.className = "add-session-btn";
		newBtn.textContent = "+ New session";
		newBtn.title = "New session";
		newBtn.addEventListener("click", async () => {
			try {
				const result = await api.postJson("/api/sessions", { clientId, cwd });
				onSessionIdSelected(result.sessionId);
			} catch (err) {
				onNotice(err instanceof Error ? err.message : String(err), "error");
			}
		});
		sessionsEl.appendChild(newBtn);

		// Session rows
		const activeId = getActiveSessionId();
		for (const session of sessions) {
			const row = createSessionRow({
				session,
				isActive: session.id === activeId,
				onSelect: onSelectSession,
			});
			sessionsEl.appendChild(row.getElement());
		}

		if (sessions.length === 0) {
			newBtn.textContent = "+ Start first session";
			const emptyEl = document.createElement("div");
			emptyEl.className = "sidebar-empty";
			emptyEl.textContent = "No sessions yet";
			sessionsEl.appendChild(emptyEl);
		}
	}

	function renderError() {
		sessionsEl.innerHTML = `
			<div class="sidebar-error">
				<span>${escapeHtml(error || "Error loading sessions")}</span>
				<button class="retry-btn">Retry</button>
			</div>
		`;
		sessionsEl.querySelector(".retry-btn").addEventListener("click", () => {
			void fetchSessions();
		});
	}

	async function setExpanded(val) {
		expanded = val;
		header.classList.toggle("expanded", expanded);
		sessionsEl.style.display = expanded ? "block" : "none";

		if (expanded) {
			const now = Date.now();
			const stale = !sessions || now - lastFetchTime > STALE_MS;
			if (stale) {
				await fetchSessions();
			} else {
				renderSessions();
			}
		}
	}

	function isExpanded() {
		return expanded;
	}

	async function refresh() {
		if (!expanded) return;
		await fetchSessions();
	}

	function highlightSession(sessionId) {
		sessionsEl.querySelectorAll(".si").forEach((row) => {
			row.classList.toggle("active", row.dataset.sessionId === sessionId);
		});
	}

	return { getElement: () => el, isExpanded, setExpanded, refresh, highlightSession };
}

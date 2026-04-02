import { formatRelativeTime } from "../../core/time.js";
import { escapeHtml } from "../../core/html.js";
import { createSessionRow } from "./session-row.js";
import { createActiveSession } from "./active-session.js";
import { createRepoGroup } from "./repo-group.js";
import { createRepoBrowser } from "./repo-browser.js";

function shouldShowSessionInLists(s) {
	if (!s || typeof s !== "object") return false;
	if (s.isRunning) return true;
	const name = typeof s.name === "string" ? s.name.trim() : "";
	if (name) return true;
	const first = typeof s.firstMessage === "string" ? s.firstMessage.trim() : "";
	return first && first !== "(no messages)";
}

function abbreviateCwd(cwd, homeDir) {
	if (cwd.startsWith(homeDir)) {
		const rest = cwd.slice(homeDir.length);
		if (rest === "") return "~";
		if (rest.startsWith("/")) return "~" + rest;
	}
	return cwd;
}

export function createSidebar({
	sessionsList,
	sidebar,
	sidebarOverlay,
	btnNew,
	btnAddRepo,
	btnRefresh,
	api,
	clientId,
	onNotice,
	getActiveSessionId,
	onSelectSession,
	onSessionIdSelected,
}) {
	let isOpen = false;
	let homeDir = "";
	let sidebarRepos = [];
	let expandedRepos = new Set();
	let repoGroups = new Map();
	let activeSessionComponent = null;
	let repoBrowser = null;

	function setOpen(open) {
		if (!sidebar) return;
		isOpen = Boolean(open);
		if (isOpen) {
			sidebar.classList.add("open");
			if (sidebarOverlay) sidebarOverlay.classList.add("open");
		} else {
			sidebar.classList.remove("open");
			if (sidebarOverlay) sidebarOverlay.classList.remove("open");
		}
	}

	function toggleOpen() {
		setOpen(!isOpen);
	}

	async function refresh() {
		try {
			const data = await api.getJson("/api/sidebar");
			homeDir = data.homeDir || "";
			sidebarRepos = Array.isArray(data.repos) ? data.repos : [];

			// Clear and re-render
			const scrollTop = sessionsList.scrollTop;
			sessionsList.innerHTML = "";

			// Active sessions zone (if any)
			if (!activeSessionComponent) {
				activeSessionComponent = createActiveSession({
					container: sessionsList,
					api,
					getActiveSessionId,
					onSelectSession,
				});
			}
			await activeSessionComponent.update();
			if (activeSessionComponent.getElement().parentNode !== sessionsList) {
				sessionsList.appendChild(activeSessionComponent.getElement());
			}

			// Repo groups
			const currentCwds = new Set(sidebarRepos.map((r) => r.cwd));
			const activeId = getActiveSessionId();

			// Remove stale repo groups
			for (const [cwd, group] of repoGroups) {
				if (!currentCwds.has(cwd)) {
					group.getElement().remove();
					repoGroups.delete(cwd);
				}
			}

			// Render repo groups
			for (const repo of sidebarRepos) {
				let group = repoGroups.get(repo.cwd);
				if (!group) {
					group = createRepoGroup({
						cwd: repo.cwd,
						homeDir,
						api,
						clientId,
						getActiveSessionId,
						onSelectSession,
						onSessionIdSelected,
						onNotice,
					});
					repoGroups.set(repo.cwd, group);
				}

				if (group.getElement().parentNode !== sessionsList) {
					sessionsList.appendChild(group.getElement());
				}

				// Re-expand if was expanded
				if (expandedRepos.has(repo.cwd)) {
					await group.setExpanded(true);
				}
			}

			// Restore scroll position
			sessionsList.scrollTop = scrollTop;
		} catch (error) {
			sessionsList.innerHTML = "";
			const row = document.createElement("div");
			row.className = "si";
			const name = document.createElement("div");
			name.className = "si-name";
			name.textContent = "Failed to load sidebar";
			const meta = document.createElement("div");
			meta.className = "si-meta";
			meta.textContent = error instanceof Error ? error.message : String(error);
			row.appendChild(name);
			row.appendChild(meta);
			sessionsList.appendChild(row);
		}
	}

	function highlightSessionRow(sessionId) {
		if (activeSessionComponent) {
			activeSessionComponent.highlightSession(sessionId);
		}
		for (const group of repoGroups.values()) {
			group.highlightSession(sessionId);
		}
	}

	// Button handlers
	if (btnNew) {
		btnNew.addEventListener("click", async () => {
			if (sidebarRepos.length === 0) {
				onNotice("Add a repo first", "info");
				return;
			}
			if (sidebarRepos.length === 1) {
				await createSession(sidebarRepos[0].cwd);
			} else {
				// Show repo picker
				showRepoPicker();
			}
		});
	}

	if (btnAddRepo) {
		btnAddRepo.addEventListener("click", () => {
			if (!repoBrowser) {
				repoBrowser = createRepoBrowser({
					api,
					onSelect: async (cwd) => {
						try {
							await api.postJson("/api/repos", { cwd });
							void refresh();
						} catch (err) {
							onNotice(err instanceof Error ? err.message : String(err), "error");
						}
					},
					onCancel: () => {
						if (repoBrowser) repoBrowser.close();
					},
				});
				document.body.appendChild(repoBrowser.getElement());
			}
			repoBrowser.open(homeDir || process.env.HOME || "/home");
		});
	}

	if (btnRefresh) {
		btnRefresh.addEventListener("click", () => void refresh());
	}

	async function createSession(cwd) {
		try {
			const result = await api.postJson("/api/sessions", { clientId, cwd });
			onSessionIdSelected(result.sessionId);
			setOpen(false);
		} catch (err) {
			onNotice(err instanceof Error ? err.message : String(err), "error");
		}
	}

	function showRepoPicker() {
		// Create a simple repo picker overlay
		const picker = document.createElement("div");
		picker.className = "repo-picker";
		picker.innerHTML = `
			<div class="repo-picker-header">Select repo for new session</div>
			<div class="repo-picker-list"></div>
		`;
		const list = picker.querySelector(".repo-picker-list");
		for (const repo of sidebarRepos) {
			const item = document.createElement("div");
			item.className = "repo-picker-item";
			item.textContent = abbreviateCwd(repo.cwd, homeDir);
			item.title = repo.cwd;
			item.addEventListener("click", async () => {
				picker.remove();
				await createSession(repo.cwd);
			});
			list.appendChild(item);
		}
		sessionsList.insertBefore(picker, sessionsList.firstChild);

		// Close on click outside
		setTimeout(() => {
			const handler = (e) => {
				if (!picker.contains(e.target)) {
					picker.remove();
					document.removeEventListener("click", handler);
				}
			};
			document.addEventListener("click", handler);
		}, 0);
	}

	// Sidebar overlay click
	if (sidebarOverlay) {
		sidebarOverlay.addEventListener("click", () => setOpen(false));
	}

	return {
		setOpen,
		toggleOpen,
		refresh,
		highlightSessionRow,
	};
}

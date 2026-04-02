import { createSessionRow } from "./session-row.js";

export function createActiveSession({ container, api, getActiveSessionId, onSelectSession }) {
	const el = document.createElement("div");
	el.className = "active-zone";
	el.style.display = "none"; // hidden until we have sessions

	const labelEl = document.createElement("div");
	labelEl.className = "active-zone-label";
	labelEl.textContent = "ACTIVE";
	el.appendChild(labelEl);

	const sessionsEl = document.createElement("div");
	sessionsEl.className = "active-sessions-list";
	el.appendChild(sessionsEl);

	let currentSessions = [];

	async function update() {
		try {
			const data = await api.getJson("/api/active-sessions");
			const sessions = Array.isArray(data.sessions) ? data.sessions : [];
			currentSessions = sessions;

			// Clear and re-render
			sessionsEl.innerHTML = "";

			if (sessions.length === 0) {
				el.style.display = "none";
				return;
			}

			el.style.display = "block";

			const activeId = getActiveSessionId();
			for (const session of sessions) {
				const row = createSessionRow({
					session,
					isActive: session.id === activeId,
					onSelect: onSelectSession,
				});
				sessionsEl.appendChild(row.getElement());
			}
		} catch (error) {
			el.style.display = "none";
		}
	}

	function highlightSession(sessionId) {
		sessionsEl.querySelectorAll(".si").forEach((row) => {
			row.classList.toggle("active", row.dataset.sessionId === sessionId);
		});
	}

	return { update, getElement: () => el, highlightSession };
}

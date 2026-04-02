import { formatRelativeTime } from "../../core/time.js";
import { escapeHtml } from "../../core/html.js";

const MAX_NAME_LENGTH = 100;

export function createSessionRow({ session, isActive, onSelect }) {
	const el = document.createElement("div");
	el.className = `si${isActive ? " active" : ""}`;
	el.dataset.sessionId = session.id;

	// Running dot (if isRunning)
	let runDot = null;
	if (session.isRunning) {
		runDot = document.createElement("span");
		runDot.className = "si-run-dot";
	}

	// Name
	const nameEl = document.createElement("div");
	nameEl.className = "si-name";
	const rawLabel =
		(typeof session.name === "string" && session.name.trim()) ||
		(typeof session.firstMessage === "string" && session.firstMessage.trim()) ||
		session.id.slice(0, 8);
	let label = String(rawLabel).replace(/\s+/g, " ").trim();
	if (label.length > MAX_NAME_LENGTH) {
		label = label.slice(0, MAX_NAME_LENGTH) + "…";
	}
	nameEl.textContent = label;
	nameEl.title = label;

	// Meta
	const metaEl = document.createElement("div");
	metaEl.className = "si-meta";
	const rel = formatRelativeTime(session.modified);
	const runningText = session.isRunning ? ` · <span class="si-run">running</span>` : "";
	metaEl.innerHTML = `${rel} · ${escapeHtml(session.cwd)}${runningText}`;

	// Assemble
	if (runDot) el.appendChild(runDot);
	el.appendChild(nameEl);
	el.appendChild(metaEl);

	// Click handler
	el.addEventListener("click", () => {
		onSelect(session);
	});

	function update(newSession) {
		// Update name
		const newLabel =
			(typeof newSession.name === "string" && newSession.name.trim()) ||
			(typeof newSession.firstMessage === "string" && newSession.firstMessage.trim()) ||
			newSession.id.slice(0, 8);
		let label = String(newLabel).replace(/\s+/g, " ").trim();
		if (label.length > MAX_NAME_LENGTH) {
			label = label.slice(0, MAX_NAME_LENGTH) + "…";
		}
		nameEl.textContent = label;
		nameEl.title = label;

		// Update meta
		const rel = formatRelativeTime(newSession.modified);
		const runningText = newSession.isRunning ? ` · <span class="si-run">running</span>` : "";
		metaEl.innerHTML = `${rel} · ${escapeHtml(newSession.cwd)}${runningText}`;

		// Update running dot
		if (newSession.isRunning && !runDot) {
			runDot = document.createElement("span");
			runDot.className = "si-run-dot";
			el.insertBefore(runDot, nameEl);
		} else if (!newSession.isRunning && runDot) {
			runDot.remove();
			runDot = null;
		}

		// Update active state
		el.classList.toggle("active", isActive);
	}

	return { getElement: () => el, update };
}

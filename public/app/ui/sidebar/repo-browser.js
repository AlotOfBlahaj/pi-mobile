import { escapeHtml } from "../../core/html.js";

export function createRepoBrowser({ api, onSelect, onCancel }) {
	const el = document.createElement("div");
	el.className = "repo-browser-overlay";
	el.style.display = "none";

	let currentPath = null;
	let isLoading = false;

	el.innerHTML = `
		<div class="repo-browser">
			<div class="repo-browser-header">
				<span class="repo-browser-path"></span>
				<button class="repo-browser-close" title="Close">✕</button>
			</div>
			<div class="repo-browser-entries"></div>
			<div class="repo-browser-footer">
				<input class="repo-browser-input" type="text" placeholder="Path..." />
				<button class="repo-browser-select">Select</button>
				<button class="repo-browser-cancel">Cancel</button>
			</div>
		</div>
	`;

	const pathEl = el.querySelector(".repo-browser-path");
	const entriesEl = el.querySelector(".repo-browser-entries");
	const inputEl = el.querySelector(".repo-browser-input");
	const selectBtn = el.querySelector(".repo-browser-select");
	const cancelBtn = el.querySelector(".repo-browser-cancel");
	const closeBtn = el.querySelector(".repo-browser-close");

	// Event handlers
	closeBtn.addEventListener("click", () => close());
	cancelBtn.addEventListener("click", () => onCancel());
	selectBtn.addEventListener("click", () => {
		if (currentPath) {
			onSelect(currentPath);
			close();
		}
	});

	inputEl.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			const path = inputEl.value.trim();
			if (path) void navigateTo(path);
		}
	});

	el.addEventListener("click", (e) => {
		if (e.target === el) {
			onCancel();
		}
	});

	// Escape key
	function handleKeydown(e) {
		if (e.key === "Escape" && el.style.display !== "none") {
			onCancel();
		}
	}
	document.addEventListener("keydown", handleKeydown);

	async function navigateTo(path) {
		currentPath = path;
		inputEl.value = path;
		isLoading = true;
		entriesEl.innerHTML = '<div class="sidebar-loading">Loading…</div>';

		// Update breadcrumb
		renderBreadcrumb(path);

		try {
			const qs = new URLSearchParams({ path });
			const data = await api.getJson(`/api/fs/ls?${qs.toString()}`);
			isLoading = false;
			renderEntries(data.entries);
		} catch (err) {
			isLoading = false;
			const message = err instanceof Error ? err.message : String(err);
			entriesEl.innerHTML = `<div class="sidebar-error">${escapeHtml(message)}</div>`;
		}
	}

	function renderBreadcrumb(path) {
		const parts = path.split("/").filter(Boolean);
		const tokens = [];
		let acc = "";
		for (const part of parts) {
			acc += "/" + part;
			tokens.push({ name: part, path: acc });
		}
		pathEl.innerHTML = tokens
			.map((t, i) => `<span class="breadcrumb-segment" data-path="${escapeHtml(t.path)}">${escapeHtml(t.name)}</span>`)
			.join(" <span class=\"breadcrumb-sep\">/</span> ");

		// Make breadcrumb segments clickable
		pathEl.querySelectorAll(".breadcrumb-segment").forEach((seg) => {
			seg.style.cursor = "pointer";
			seg.addEventListener("click", () => {
				void navigateTo(seg.dataset.path);
			});
		});
	}

	function renderEntries(entries) {
		entriesEl.innerHTML = "";
		// Only show directories (repos can only be directories)
		const dirs = entries.filter((e) => e.isDirectory);
		for (const entry of dirs) {
			const entryEl = document.createElement("div");
			entryEl.className = "repo-browser-entry is-dir";
			entryEl.dataset.path = entry.path;
			entryEl.innerHTML = `
				<span class="entry-icon">📁</span>
				<span class="entry-name">${escapeHtml(entry.name)}</span>
			`;

			entryEl.addEventListener("click", () => {
				void navigateTo(entry.path);
			});

			entriesEl.appendChild(entryEl);
		}

		if (dirs.length === 0) {
			entriesEl.innerHTML = '<div class="sidebar-empty">No directories</div>';
		}
	}

	function open(startPath) {
		currentPath = startPath || null;
		el.style.display = "flex";
		if (startPath) {
			void navigateTo(startPath);
		} else {
			// Start at home directory — use sidebar's homeDir or empty string
			// The caller should pass a valid startPath
			void navigateTo(startPath || "/home");
		}
	}

	function close() {
		el.style.display = "none";
	}

	return { open, close, getElement: () => el };
}

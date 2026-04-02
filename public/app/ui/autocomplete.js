/**
 * Slash command autocomplete component.
 *
 * Triggers when user types "/" at the start of the input.
 * Shows a filtered list of prompt templates and skills.
 * Keyboard (Up/Down/Enter/Tab/Esc) and touch navigation.
 */
export function createAutocomplete({ inputEl, getCommands, onSelect }) {
	let container = null;
	let listEl = null;
	let visible = false;
	let selectedIndex = -1;
	let filteredItems = [];
	let prefix = "";

	function ensureContainer() {
		if (container) return;

		container = document.createElement("div");
		container.className = "autocomplete";
		container.setAttribute("role", "listbox");

		listEl = document.createElement("div");
		listEl.className = "autocomplete-list";

		container.appendChild(listEl);

		// Position relative to editor-wrap
		const editorWrap = inputEl.closest(".editor-wrap");
		if (editorWrap) {
			editorWrap.style.position = "relative";
			editorWrap.appendChild(container);
		} else {
			inputEl.parentElement.appendChild(container);
		}
	}

	function show(items, filterPrefix) {
		ensureContainer();
		filteredItems = items;
		prefix = filterPrefix;
		selectedIndex = -1;
		visible = true;

		render();
		container.classList.add("open");
	}

	function hide() {
		if (!visible) return;
		visible = false;
		selectedIndex = -1;
		filteredItems = [];
		prefix = "";
		if (container) {
			container.classList.remove("open");
		}
	}

	function isOpen() {
		return visible;
	}

	function commandText(item) {
		if (item.source === "skill") return `/skill:${item.name} `;
		return `/${item.name} `;
	}

	function filterCommands(commands, text) {
		// Extract the filter part after "/"
		const slashIndex = text.indexOf("/");
		if (slashIndex === -1) return { items: [], prefix: "" };

		const afterSlash = text.slice(slashIndex + 1);
		const query = afterSlash.toLowerCase();

		const filtered = commands.filter((cmd) => {
			const full = cmd.source === "skill" ? `skill:${cmd.name}` : cmd.name;
			return full.toLowerCase().includes(query);
		});

		// Sort: prompt commands first, then skills. Within each group, alphabetical.
		filtered.sort((a, b) => {
			if (a.source !== b.source) return a.source === "prompt" ? -1 : 1;
			return a.name.localeCompare(b.name);
		});

		return { items: filtered, prefix: afterSlash };
	}

	function render() {
		if (!listEl) return;
		listEl.innerHTML = "";

		if (filteredItems.length === 0) {
			hide();
			return;
		}

		filteredItems.forEach((item, index) => {
			const el = document.createElement("div");
			el.className = "autocomplete-item";
			el.setAttribute("role", "option");

			if (index === selectedIndex) {
				el.classList.add("selected");
			}

			const nameEl = document.createElement("span");
			nameEl.className = "autocomplete-name";
			nameEl.textContent = item.source === "skill" ? `/skill:${item.name}` : `/${item.name}`;

			const descEl = document.createElement("span");
			descEl.className = "autocomplete-desc";
			descEl.textContent = item.description || "";

			const badge = document.createElement("span");
			badge.className = `autocomplete-badge ${item.source}`;
			badge.textContent = item.source === "skill" ? "skill" : "prompt";

			el.appendChild(nameEl);
			el.appendChild(badge);
			if (item.description) el.appendChild(descEl);

			el.addEventListener("mousedown", (e) => {
				e.preventDefault(); // prevent blur
				selectItem(index);
			});

			el.addEventListener("touchstart", (e) => {
				e.preventDefault();
				selectItem(index);
			}, { passive: false });

			listEl.appendChild(el);
		});
	}

	function selectItem(index) {
		if (index < 0 || index >= filteredItems.length) return;
		const item = filteredItems[index];
		const text = commandText(item);
		onSelect(text);
		hide();
	}

	function navigate(direction) {
		if (!visible || filteredItems.length === 0) return;
		if (direction === "down") {
			selectedIndex = (selectedIndex + 1) % filteredItems.length;
		} else if (direction === "up") {
			selectedIndex = selectedIndex <= 0 ? filteredItems.length - 1 : selectedIndex - 1;
		}
		render();
	}

	function confirm() {
		if (!visible) return false;
		if (selectedIndex >= 0) {
			selectItem(selectedIndex);
			return true;
		}
		// If only one item matches, auto-select
		if (filteredItems.length === 1) {
			selectItem(0);
			return true;
		}
		return false;
	}

	/**
	 * Check if the current input should trigger autocomplete.
	 * Returns true if autocomplete is now open.
	 */
	function update(text) {
		if (!text || !text.startsWith("/")) {
			hide();
			return false;
		}

		const commands = getCommands();
		if (!commands || commands.length === 0) {
			hide();
			return false;
		}

		const { items, prefix: filterPrefix } = filterCommands(commands, text);
		if (items.length === 0) {
			hide();
			return false;
		}

		// Don't show if user has already completed a command (has space after the command)
		const afterSlash = text.slice(1);
		if (afterSlash.includes(" ")) {
			hide();
			return false;
		}

		show(items, filterPrefix);
		return true;
	}

	return { update, hide, isOpen, navigate, confirm };
}

export function formatRelativeTime(iso) {
	const ms = Date.now() - Date.parse(iso);
	if (!Number.isFinite(ms) || ms < 0) return "just now";
	const s = Math.floor(ms / 1000);
	if (s < 10) return "just now";
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d === 1) return "yesterday";
	return `${d}d ago`;
}

/**
 * Reverse-proxy origin resolution.
 *
 * When running behind a TLS-terminating proxy (e.g. Cloudflare Tunnel), Bun
 * receives plain HTTP while the browser uses HTTPS.  Reconstruct the external
 * protocol from the standard `X-Forwarded-Proto` header.
 */

/**
 * Reconstruct the browser-visible origin from the incoming request.
 *
 * @param forwardedProto - value of the `X-Forwarded-Proto` header (may be null)
 * @param url            - parsed URL built from the raw request line
 * @returns the origin the browser used (e.g. `https://example.com`)
 */
export function resolveOrigin(forwardedProto: string | null, url: URL): string {
	if (forwardedProto === "https" && url.protocol === "http:") {
		return `https://${url.host}`;
	}
	return url.origin;
}

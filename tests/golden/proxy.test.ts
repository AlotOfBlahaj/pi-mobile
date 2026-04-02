import { describe, expect, test } from "bun:test";
import { resolveOrigin } from "../../src/proxy.ts";

describe("resolveOrigin", () => {
	test("returns url.origin when no X-Forwarded-Proto header is present", () => {
		const url = new URL("http://localhost:4317/api/sessions");
		expect(resolveOrigin(null, url)).toBe("http://localhost:4317");
	});

	test("returns https origin when X-Forwarded-Proto is https and url is http (Cloudflare Tunnel)", () => {
		const url = new URL("http://my-app.trycloudflare.com/api/sessions");
		expect(resolveOrigin("https", url)).toBe("https://my-app.trycloudflare.com");
	});

	test("returns https origin with port when X-Forwarded-Proto is https", () => {
		const url = new URL("http://my-app.trycloudflare.com:8080/api/sessions");
		expect(resolveOrigin("https", url)).toBe("https://my-app.trycloudflare.com:8080");
	});

	test("does not rewrite when protocol is already https", () => {
		const url = new URL("https://my-app.example.com/api/sessions");
		expect(resolveOrigin("https", url)).toBe("https://my-app.example.com");
	});

	test("ignores non-https forwarded proto values", () => {
		const url = new URL("http://localhost:4317/api/sessions");
		expect(resolveOrigin("http", url)).toBe("http://localhost:4317");
	});

	test("handles IPv6 loopback with forwarded proto", () => {
		const url = new URL("http://[::1]:4317/api/sessions");
		expect(resolveOrigin("https", url)).toBe("https://[::1]:4317");
	});
});

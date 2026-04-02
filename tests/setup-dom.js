// Happy DOM global setup for Bun tests
import { GlobalWindow } from "happy-dom";

const window = new GlobalWindow();
globalThis.document = window.document;
globalThis.window = window;
globalThis.HTMLElement = window.HTMLElement;
globalThis.customElements = window.customElements;

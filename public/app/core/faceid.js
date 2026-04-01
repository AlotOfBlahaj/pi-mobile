let simpleWebAuthnPromise = null;

function loadSimpleWebAuthn() {
        if (!simpleWebAuthnPromise) {
                simpleWebAuthnPromise = import("/vendor/simplewebauthn/browser/esm/index.js");
        }
        return simpleWebAuthnPromise;
}

function createOverlay() {
        const overlay = document.createElement("div");
        overlay.className = "faceid-overlay";
        overlay.innerHTML = `
                <div class="faceid-card">
                        <div class="faceid-title">Face ID Required</div>
                        <div class="faceid-subtitle" id="faceid-subtitle">Verifying your presence…</div>
                        <button class="faceid-button" id="faceid-button" type="button" hidden>Try again</button>
                </div>
        `;
        document.body.appendChild(overlay);
        return {
                overlay,
                subtitle: overlay.querySelector("#faceid-subtitle"),
                button: overlay.querySelector("#faceid-button"),
        };
}

function normalizeErrorMessage(error) {
        if (!error) return "Face ID verification failed.";
        if (typeof error.message === "string" && error.message.length > 0) return error.message;
        return String(error);
}

export function installFaceIdGuard({ api }) {
        const ui = createOverlay();
        let locked = true;
        let inFlight = false;
        let prompting = false;
        /** Once verified, stays true for the entire page lifecycle.
         *  No blur / visibility / focus event will ever re-lock. */
        let verified = false;

        function setLocked(value) {
                locked = value;
                document.body.classList.toggle("faceid-locked", value);
                ui.overlay.classList.toggle("open", value);
        }

        function setStatus(text, { showRetry = false } = {}) {
                if (ui.subtitle) ui.subtitle.textContent = text;
                if (ui.button) ui.button.hidden = !showRetry;
        }

        async function createChallenge(kind) {
                return api.postJson("/api/faceid/challenge", { kind });
        }

        async function verifyChallenge(challengeId, credential) {
                return api.postJson("/api/faceid/verify", { challengeId, credential });
        }

        async function runRegistration() {
                const challenge = await createChallenge("register");
                const { startRegistration } = await loadSimpleWebAuthn();
                prompting = true;
                try {
                        const credential = await startRegistration({ optionsJSON: challenge.options });
                        await verifyChallenge(challenge.challengeId, credential);
                } finally {
                        prompting = false;
                }
        }

        async function runAuthentication() {
                const challenge = await createChallenge("authenticate");
                const { startAuthentication } = await loadSimpleWebAuthn();
                prompting = true;
                try {
                        const assertion = await startAuthentication({ optionsJSON: challenge.options });
                        await verifyChallenge(challenge.challengeId, assertion);
                } finally {
                        prompting = false;
                }
        }

        async function ensureUnlocked() {
                if (verified || !locked || inFlight) return;
                inFlight = true;
                setStatus("Prompting Face ID…");
                try {
                        if (!window.isSecureContext) {
                                throw new Error("Face ID requires a secure origin (HTTPS or localhost).");
                        }
                        if (!window.PublicKeyCredential || !navigator.credentials) {
                                throw new Error("WebAuthn is not supported in this browser.");
                        }
                        const status = await api.getJson("/api/faceid/status");
                        if (!status.enrolled) {
                                setStatus("First-time setup: approve Face ID to enroll this browser.");
                                await runRegistration();
                        }
                        setStatus("Confirm with Face ID to unlock.");
                        await runAuthentication();
                        verified = true;
                        setLocked(false);
                } catch (error) {
                        setLocked(true);
                        setStatus(normalizeErrorMessage(error), { showRetry: true });
                } finally {
                        inFlight = false;
                }
        }

        function bindVisibilityHooks() {
                // After successful verification, no event ever re-locks.
                // These hooks only serve to retry when the initial prompt failed.

                document.addEventListener("visibilitychange", () => {
                        if (verified) return;
                        if (document.visibilityState === "hidden") return;
                        if (locked && !inFlight) void ensureUnlocked();
                });

                window.addEventListener("focus", () => {
                        if (verified || prompting || inFlight) return;
                        if (locked) void ensureUnlocked();
                });

                window.addEventListener("pageshow", () => {
                        if (verified) return;
                        if (locked && !inFlight) void ensureUnlocked();
                });

                if (ui.button) {
                        ui.button.addEventListener("click", () => {
                                if (verified) return;
                                locked = true;
                                setStatus("Prompting Face ID…");
                                void ensureUnlocked();
                        });
                }
        }

        return {
                async start() {
                        bindVisibilityHooks();
                        void ensureUnlocked();
                },
        };
}

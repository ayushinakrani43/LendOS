
const AuthService = {

    // ── Register new NBFC (JSON — no logo file) ────────────────────────────────
    async register(formData) {
        const res = await apiCall("/api/nbfc/register", "POST", formData);
        if (res.ok) {
            localStorage.setItem(CONFIG.TOKEN_KEY,     res.data.access_token || "");
            localStorage.setItem(CONFIG.NBFC_ID_KEY,   res.data.nbfc_id      || "");
            localStorage.setItem(CONFIG.NBFC_NAME_KEY, res.data.company_name || "");
        }
        return res;
    },

    // ── Register with logo file (multipart FormData) ───────────────────────────
    async registerWithLogo(formData) {
        /*
         * formData is a FormData object (built in register.html submitRegister()).
         * We do NOT set Content-Type here — browser sets it automatically with
         * the correct multipart boundary when body is FormData.
         */
        const token = localStorage.getItem(CONFIG.TOKEN_KEY);
        const headers = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        try {
            const res  = await fetch(`${CONFIG.BASE_URL}/api/nbfc/register`, {
                method:  "POST",
                headers,
                body:    formData,    // FormData — NOT JSON.stringify
            });
            const data = await res.json();

            if (res.ok) {
                localStorage.setItem(CONFIG.TOKEN_KEY,     data.access_token || "");
                localStorage.setItem(CONFIG.NBFC_ID_KEY,   data.nbfc_id      || "");
                localStorage.setItem(CONFIG.NBFC_NAME_KEY, data.company_name || "");
            }

            return { ok: res.ok, status: res.status, data };

        } catch (err) {
            console.error("Register error:", err);
            return { ok: false, status: 0, data: { detail: "Cannot connect to server. Make sure backend is running." } };
        }
    },

    // ── Login NBFC ─────────────────────────────────────────────────────────────
    async login(email, password) {
        const res = await apiCall("/api/nbfc/login", "POST", { email, password });

        if (res.ok) {
            localStorage.setItem(CONFIG.TOKEN_KEY,     res.data.access_token);
            localStorage.setItem(CONFIG.NBFC_ID_KEY,   res.data.nbfc_id);
            localStorage.setItem(CONFIG.NBFC_NAME_KEY, res.data.company_name);
        }

        return res;
    },

    // ── Logout ─────────────────────────────────────────────────────────────────
    logout() {
        localStorage.removeItem(CONFIG.TOKEN_KEY);
        localStorage.removeItem(CONFIG.NBFC_ID_KEY);
        localStorage.removeItem(CONFIG.NBFC_NAME_KEY);
        window.location.href = "/nbfc/register";
    },

    // ── Check if logged in ─────────────────────────────────────────────────────
    isLoggedIn() {
        return !!localStorage.getItem(CONFIG.TOKEN_KEY);
    },

    // ── Redirect if not logged in (call on protected pages) ───────────────────
    requireLogin() {
        if (!this.isLoggedIn()) {
            window.location.href = "/nbfc/register";
        }
    },

    // ── Redirect if already logged in (call on login/register pages) ──────────
    redirectIfLoggedIn() {
        if (this.isLoggedIn()) {
            window.location.href = "/nbfc/dashboard";
        }
    },

    // ── Get current session info ───────────────────────────────────────────────
    getSession() {
        return {
            token:   localStorage.getItem(CONFIG.TOKEN_KEY),
            nbfc_id: localStorage.getItem(CONFIG.NBFC_ID_KEY),
            name:    localStorage.getItem(CONFIG.NBFC_NAME_KEY),
        };
    },
};

// ─── API Configuration ────────────────────────────────────────────────────────
const CONFIG = {
//    BASE_URL: "http://localhost:8000",   // Change to your deployed URL in production
        BASE_URL: window.location.origin,
    // NBFC session keys
    TOKEN_KEY:     "nbfc_token",
    NBFC_ID_KEY:   "nbfc_id",
    NBFC_NAME_KEY: "nbfc_name",

    // Borrower session keys
    BORROWER_TOKEN_KEY: "borrower_token",
    BORROWER_ID_KEY:    "borrower_id",
    BORROWER_NAME_KEY:  "borrower_name",

    // Super Admin keys
    ADMIN_TOKEN_KEY: "admin_token",
};
window.API_BASE = CONFIG.BASE_URL;
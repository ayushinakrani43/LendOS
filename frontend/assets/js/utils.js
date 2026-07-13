// ─── Utility Functions ────────────────────────────────────────────────────────
// Shared helpers used across borrower, NBFC, and super admin pages

const Utils = {

    // ── Show / hide alert box ──────────────────────────────────────────────────
    showAlert(elementId, message, type = "error") {
        // type: "error" | "success" | "warning"
        const box = document.getElementById(elementId);
        if (!box) return;
        box.textContent = message;
        box.className = `alert ${type} show`;
        setTimeout(() => box.classList.remove("show"), 5000);
    },

    hideAlert(elementId) {
        const box = document.getElementById(elementId);
        if (box) box.classList.remove("show");
    },


    // ── Form validation helpers ────────────────────────────────────────────────
    setError(inputId, errorId, show) {
        const input = document.getElementById(inputId);
        const error = document.getElementById(errorId);
        if (input) input.classList.toggle("input-error", show);
        if (error) error.classList.toggle("show", show);
    },

    clearAllErrors(errorIds) {
        errorIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove("show");
            // Also clear input error styling
            const inputId = id.replace("err_", "");
            const input = document.getElementById(inputId);
            if (input) input.classList.remove("input-error");
        });
    },

    isValidEmail(email) {
        return /^\S+@\S+\.\S+$/.test(email);
    },

    isValidMobile(mobile) {
        return /^\d{10}$/.test(mobile);
    },

    isValidAadhaar(aadhaar) {
        return /^\d{12}$/.test(aadhaar);
    },

    isValidPAN(pan) {
        return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan.toUpperCase());
    },


    // ── Button loading state ───────────────────────────────────────────────────
    setButtonLoading(buttonId, loading, originalText = "Submit") {
        const btn = document.getElementById(buttonId);
        if (!btn) return;
        btn.disabled = loading;
        btn.innerHTML = loading
            ? `<span class="spinner"></span>Please wait...`
            : originalText;
    },


    // ── Password toggle ────────────────────────────────────────────────────────
    togglePassword(inputId, toggleBtnId) {
        const input = document.getElementById(inputId);
        const btn   = document.getElementById(toggleBtnId);
        if (!input) return;
        if (input.type === "password") {
            input.type = "text";
            if (btn) btn.textContent = "🙈";
        } else {
            input.type = "password";
            if (btn) btn.textContent = "👁";
        }
    },


    // ── Format currency (INR) ─────────────────────────────────────────────────
    formatINR(amount) {
        return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            maximumFractionDigits: 0,
        }).format(amount);
    },


    // ── Format date ───────────────────────────────────────────────────────────
    formatDate(dateStr) {
        if (!dateStr) return "—";
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-IN", {
            day: "2-digit", month: "short", year: "numeric"
        });
    },


    // ── Calculate EMI formula ─────────────────────────────────────────────────
    // P = principal, r = monthly rate (annual% / 12 / 100), n = tenure months
    calculateEMI(principal, annualRatePercent, tenureMonths) {
        const r = annualRatePercent / 12 / 100;
        if (r === 0) return Math.round(principal / tenureMonths);
        const emi = principal * r * Math.pow(1 + r, tenureMonths)
                    / (Math.pow(1 + r, tenureMonths) - 1);
        return Math.round(emi);
    },


    // ── Credit score color ─────────────────────────────────────────────────────
    scoreColor(score) {
        if (score >= 750) return "#10b981";  // green  — Excellent
        if (score >= 650) return "#3b82f6";  // blue   — Good
        if (score >= 550) return "#f59e0b";  // yellow — Fair
        return "#ef4444";                     // red    — Poor
    },

    scoreLabel(score) {
        if (score >= 750) return "Excellent";
        if (score >= 650) return "Good";
        if (score >= 550) return "Fair";
        return "Poor";
    },


    // ── Razorpay payment launcher ─────────────────────────────────────────────
    openRazorpay({ orderId, amount, name, description, prefillName, prefillEmail, prefillContact, onSuccess, onFailure }) {
        const options = {
            key: "rzp_test_XXXXXXXXXXXXXXXX",   // ← Replace with your Razorpay test key
            amount: amount * 100,                // Razorpay expects paise
            currency: "INR",
            name: name || "LendOS",
            description: description || "Payment",
            order_id: orderId,
            prefill: {
                name:    prefillName    || "",
                email:   prefillEmail   || "",
                contact: prefillContact || "",
            },
            theme: { color: "#3b82f6" },
            handler: function (response) {
                if (onSuccess) onSuccess(response);
            },
            modal: {
                ondismiss: function () {
                    if (onFailure) onFailure("Payment cancelled.");
                }
            }
        };

        const rzp = new Razorpay(options);
        rzp.open();
    },


    // ── Copy text to clipboard ─────────────────────────────────────────────────
    async copyToClipboard(text, feedbackElementId) {
        try {
            await navigator.clipboard.writeText(text);
            if (feedbackElementId) {
                const el = document.getElementById(feedbackElementId);
                if (el) {
                    const original = el.textContent;
                    el.textContent = "Copied!";
                    setTimeout(() => el.textContent = original, 2000);
                }
            }
        } catch (err) {
            console.error("Copy failed:", err);
        }
    },


    // ── Debounce (for search inputs) ──────────────────────────────────────────
    debounce(fn, delay = 400) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },
};
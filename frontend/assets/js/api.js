

async function apiCall(endpoint, method = "GET", body = null, requiresAuth = false) {
    const headers = { "Content-Type": "application/json" };

    // Attach token if required
    if (requiresAuth) {
        const token = localStorage.getItem(CONFIG.TOKEN_KEY);
        if (!token) {
            window.location.href = "/nbfc/register";
            return;
        }
        headers["Authorization"] = `Bearer ${token}`;
    }

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
        const res = await fetch(`${CONFIG.BASE_URL}${endpoint}`, options);
        const data = await res.json();

        // Token expired or invalid
        if (res.status === 401 && requiresAuth) {
            AuthService.logout();
            return null;
        }

        return { ok: res.ok, status: res.status, data };

    } catch (err) {
        console.error("API Error:", err);
        return { ok: false, status: 0, data: { detail: "Cannot connect to server. Make sure backend is running." } };
    }
}
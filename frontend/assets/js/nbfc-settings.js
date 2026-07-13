// ═══════════════════════════════════════════════════════════════
//  nbfc-settings.js  —  LendOS NBFC Settings Page
// ═══════════════════════════════════════════════════════════════

const API = window.API_BASE || window.location.origin;

// ── Session ──────────────────────────────────────────────────────
function getSession() {
    const token = localStorage.getItem('nbfc_token');
    if (!token) return null;
    return {
        access_token: token,
        nbfc_id:      parseInt(localStorage.getItem('nbfc_id')),
        nbfc_name:    localStorage.getItem('nbfc_name') || '',
    };
}

// ── On load ───────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    const session = getSession();
    if (!session) { window.location.href = '/nbfc/register '; return; }
    document.body.style.visibility = 'hidden';
    // ADD THIS after body hide line
try {
    const verify = await fetch(`${API}/api/nbfc/dashboard/profile/${session.nbfc_id}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    if (!verify.ok) {
        ['nbfc_token','nbfc_id','nbfc_name','nbfc_email']
            .forEach(k => localStorage.removeItem(k));
        window.location.href = '/nbfc/register';
        return;
    }
    const profile = await verify.json();
    const logoBox = document.getElementById('topLogoIcon');
    if (logoBox && profile.logo_url) {
        logoBox.innerHTML = `<img src="${profile.logo_url}" alt="${profile.company_name}"
            style="width:100%;height:100%;object-fit:contain;padding:3px;border-radius:6px;"/>`;
    }
} catch (e) {
    window.location.href = '/nbfc/register';
    return;
}
document.body.style.visibility = 'visible';

    // Fill topbar + sidebar
    const name = session.nbfc_name || 'NBFC';
    document.getElementById('topNbfcName').textContent     = name;
    document.getElementById('companyAvatar').textContent   = name.charAt(0).toUpperCase();
    document.getElementById('sidebarAvatar').textContent   = name.charAt(0).toUpperCase();
    document.getElementById('sidebarNbfcName').textContent = name;

    // Restore sidebar state
    if (localStorage.getItem('nbfc_sidebar_collapsed') === '1' && window.innerWidth > 768) {
        document.getElementById('sidebar')?.classList.add('collapsed');
    }

    await loadSettings(session);
});

// ── Load settings from backend ────────────────────────────────────
async function loadSettings(session) {
    try {
        const res = await fetch(
            `${API}/api/nbfc/dashboard/profile/${session.nbfc_id}`,
            { headers: { 'Authorization': `Bearer ${session.access_token}` } }
        );
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        prefillForm(data);

    } catch (e) {
        document.getElementById('loadingState').innerHTML =
            `<i class="ti ti-alert-triangle" style="color:var(--error);font-size:20px;"></i>
             <span style="color:var(--error);">Could not load settings. Please refresh.</span>`;
        return;
    }

    // Show form
    document.getElementById('loadingState').style.display  = 'none';
    document.getElementById('settingsForm').style.display  = 'block';
}

// ── Prefill all form fields ───────────────────────────────────────
function prefillForm(data) {
    document.getElementById('s-min-loan').value   = data.min_loan_amount   || 10000;
    document.getElementById('s-max-loan').value   = data.max_loan_amount   || 500000;
    document.getElementById('s-min-tenure').value = data.min_tenure_months || 3;
    document.getElementById('s-max-tenure').value = data.max_tenure_months || 36;
    document.getElementById('s-interest').value   = data.interest_rate     || 12;
    document.getElementById('s-proc-fee').value   = data.processing_fee    || 2;
    document.getElementById('s-min-score').value  = data.min_credit_score  || 600;
    document.getElementById('s-foir').value       = data.max_foir_percent  || 50;
    document.getElementById('s-grace').value      = data.grace_period_days || 3;
    document.getElementById('s-penalty').value    = data.late_penalty_flat || 500;
document.getElementById('s-upi').value        = data.upi_id          || '';
document.getElementById('s-bank-name').value  = data.bank_name       || '';
document.getElementById('s-bank-acc').value   = data.bank_account_no || '';
document.getElementById('s-bank-ifsc').value  = data.bank_ifsc       || '';
    updateEmiPreview();
    updateScoreBand();
}

// ── EMI preview (live update) ─────────────────────────────────────
function updateEmiPreview() {
    const rate = parseFloat(document.getElementById('s-interest').value) || 0;
    document.getElementById('previewRate').textContent = rate;

    if (rate <= 0) {
        document.getElementById('previewEmi').textContent = '—';
        return;
    }
    // EMI for ₹1,00,000, 12 months, given rate
    const r   = rate / 1200;
    const n   = 12;
    const emi = (100000 * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    document.getElementById('previewEmi').textContent =
        '₹' + Math.round(emi).toLocaleString('en-IN') + '/mo';
}

// ── Score band indicator (live update) ───────────────────────────
function updateScoreBand() {
    const score = parseInt(document.getElementById('s-min-score').value) || 300;
    const pct   = Math.max(0, Math.min(100, ((score - 300) / 600) * 100));
    document.getElementById('scoreBandVal').textContent      = score;
    document.getElementById('scoreBandFill').style.width     = pct + '%';
}

// ── Wire live listeners ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('s-interest')?.addEventListener('input', updateEmiPreview);
    document.getElementById('s-min-score')?.addEventListener('input', updateScoreBand);
});

// ── Save settings ─────────────────────────────────────────────────
async function saveSettings(event) {
    event.preventDefault();

    const session = getSession();
    if (!session) { window.location.href = '/nbfc/login'; return; }

    const btn = document.getElementById('saveBtn');
    btn.disabled  = true;
    btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Saving…';

    // Hide old alerts
    document.getElementById('alert-ok').style.display  = 'none';
    document.getElementById('alert-err').style.display = 'none';

    const body = {
        interest_rate:     parseFloat(document.getElementById('s-interest').value),
        min_loan_amount:   parseInt(document.getElementById('s-min-loan').value),
        max_loan_amount:   parseInt(document.getElementById('s-max-loan').value),
        min_tenure_months: parseInt(document.getElementById('s-min-tenure').value),
        max_tenure_months: parseInt(document.getElementById('s-max-tenure').value),
        processing_fee:    parseFloat(document.getElementById('s-proc-fee').value),
        min_credit_score:  parseInt(document.getElementById('s-min-score').value),
        grace_period_days: parseInt(document.getElementById('s-grace').value),
        late_penalty_flat: parseInt(document.getElementById('s-penalty').value),
        max_foir_percent:  parseFloat(document.getElementById('s-foir').value),
        upi_id:            document.getElementById('s-upi').value.trim()        || null,
    bank_name:         document.getElementById('s-bank-name').value.trim()  || null,
    bank_account_no:   document.getElementById('s-bank-acc').value.trim()   || null,
    bank_ifsc:         document.getElementById('s-bank-ifsc').value.trim().toUpperCase() || null,
    };

    try {
        const res  = await fetch(
            `${API}/api/nbfc/dashboard/settings/${session.nbfc_id}`,
            {
                method:  'PUT',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify(body),
            }
        );
        const data = await res.json();

        if (!res.ok) {
            document.getElementById('alert-err-text').textContent =
                data.detail || 'Failed to save settings.';
            document.getElementById('alert-err').style.display = 'flex';
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        document.getElementById('alert-ok').style.display = 'flex';
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (e) {
        document.getElementById('alert-err-text').textContent = 'Cannot connect to server.';
        document.getElementById('alert-err').style.display    = 'flex';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="ti ti-device-floppy"></i> Save Settings';
    }
}


// ── Change password ─────────────────────────────────────────────
async function changePassword() {
    const session = getSession();
    const currentPw = document.getElementById('s-current-pw').value;
    const newPw     = document.getElementById('s-new-pw').value;

    document.getElementById('pw-alert-ok').style.display  = 'none';
    document.getElementById('pw-alert-err').style.display = 'none';

    if (!currentPw || !newPw) {
        document.getElementById('pw-alert-err-text').textContent = 'Both fields are required.';
        document.getElementById('pw-alert-err').style.display = 'flex';
        return;
    }
    if (newPw.length < 8) {
        document.getElementById('pw-alert-err-text').textContent = 'New password must be at least 8 characters.';
        document.getElementById('pw-alert-err').style.display = 'flex';
        return;
    }

    try {
        const res = await fetch(`${API}/api/nbfc/dashboard/change-password/${session.nbfc_id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to update password.');

        document.getElementById('pw-alert-ok').style.display = 'flex';
        document.getElementById('s-current-pw').value = '';
        document.getElementById('s-new-pw').value = '';
    } catch (e) {
        document.getElementById('pw-alert-err-text').textContent = e.message;
        document.getElementById('pw-alert-err').style.display = 'flex';
    }
}

// ── Delete account ──────────────────────────────────────────────
async function deleteAccount() {
    const confirmed = confirm(
        'Are you sure you want to delete your account? This cannot be undone and will deactivate your NBFC profile.'
    );
    if (!confirmed) return;

    const session = getSession();
    try {
        const res = await fetch(`${API}/api/nbfc/dashboard/account/${session.nbfc_id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to delete account.');

        handleLogout();
    } catch (e) {
        alert(e.message);
    }
}
// ── Sidebar toggle ────────────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
        overlay.classList.toggle('show');
    } else {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('nbfc_sidebar_collapsed',
            sidebar.classList.contains('collapsed') ? '1' : '0');
    }
}

// ── Logout ────────────────────────────────────────────────────────
function handleLogout() {
    ['nbfc_token', 'nbfc_id', 'nbfc_name', 'nbfc_email']
        .forEach(k => localStorage.removeItem(k));
    window.location.href = '/nbfc/register';
}
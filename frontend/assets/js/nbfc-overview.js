//// ═══════════════════════════════════════════════════════════════
////  nbfc-overview.js  —  LendOS NBFC Overview Page
//// ═══════════════════════════════════════════════════════════════
//
//const API = window.API_BASE || window.location.origin;
//
//// ── Session ──────────────────────────────────────────────────────
//function getSession() {
//    const token = localStorage.getItem('nbfc_token');
//    if (!token) return null;
//    return {
//        access_token: token,
//        nbfc_id:  parseInt(localStorage.getItem('nbfc_id')),
//        nbfc_name: localStorage.getItem('nbfc_name') || '',
//    };
//}
//
//// ── Helpers ───────────────────────────────────────────────────────
//function fmtINR(n) {
//    if (!n && n !== 0) return '—';
//    if (n >= 10000000) return '₹' + (n/10000000).toFixed(1) + 'Cr';
//    if (n >= 100000)   return '₹' + (n/100000).toFixed(1) + 'L';
//    if (n >= 1000)     return '₹' + (n/1000).toFixed(1) + 'K';
//    return '₹' + Math.round(n).toLocaleString('en-IN');
//}
//
//function fmtDate(iso) {
//    if (!iso) return '—';
//    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
//}
//
//function statusBadge(status) {
//    const map = {
//        pending:   ['badge-pending',  'Clock',        'Pending'],
//        applied:   ['badge-applied',  'FileInvoice',  'Applied'],
//        approved:  ['badge-approved', 'CircleCheck',  'Approved'],
//        active:    ['badge-active',   'Rocket',       'Active'],
//        rejected:  ['badge-rejected', 'X',            'Rejected'],
//        closed:    ['badge-closed',   'Lock',         'Closed'],
//    };
//    const [cls, , label] = map[status] || ['badge-pending', 'Clock', status];
//    return `<span class="badge ${cls}">${label}</span>`;
//}
//
//// ── On load ───────────────────────────────────────────────────────
//window.addEventListener('DOMContentLoaded', async () => {
//    // Hide everything until token verified
//    document.body.style.visibility = 'hidden';
//
//    const session = getSession();
//    if (!session) {
//        window.location.href = '/nbfc/register';
//        return;
//    }
//
//    // ── Verify token is valid with backend ──
//    try {
//        const verify = await fetch(`${API}/api/nbfc/dashboard/profile/${session.nbfc_id}`, {
//            headers: { 'Authorization': `Bearer ${session.access_token}` }
//        });
//        if (!verify.ok) {
//            ['nbfc_token','nbfc_id','nbfc_name','nbfc_email']
//                .forEach(k => localStorage.removeItem(k));
//            window.location.href = '/nbfc/register';
//            return;
//        }
//        // ── Apply NBFC logo to topbar ──
//const profile  = await verify.json();
//const logoBox  = document.getElementById('topLogoIcon');
//if (profile.logo_url && logoBox) {
//    logoBox.innerHTML = `<img src="${profile.logo_url}" alt="${profile.company_name}"
//        style="width:100%;height:100%;object-fit:contain;padding:3px;border-radius:6px;"/>`;
//}
//    } catch (e) {
//        // Server unreachable — still redirect to register
//        window.location.href = '/nbfc/register';
//        return;
//    }
//
//    // Token valid — show page
//    document.body.style.visibility = 'visible';
//
//    // Fill topbar
//    const name = session.nbfc_name || 'NBFC';
//    document.getElementById('topNbfcName').textContent  = name;
//    document.getElementById('companyAvatar').textContent = name.charAt(0).toUpperCase();
//    document.getElementById('sidebarAvatar').textContent = name.charAt(0).toUpperCase();
//    document.getElementById('sidebarNbfcName').textContent = name;
//    document.getElementById('welcomeTitle').textContent = `Welcome back, ${name.split(' ')[0]}!`;
//
//    // Portal link
//    const portalUrl = `${window.location.origin}/borrower/login`;
//    document.getElementById('portalLinkText').textContent = portalUrl;
//
//    // Fetch data in parallel
//    await Promise.all([
//        loadStats(session),
//        loadRecentApplications(session),
//        loadRulesStatus(session),
//    ]);
//});
//
//// ── Load stats ────────────────────────────────────────────────────
//async function loadStats(session) {
//    try {
//       const res = await fetch(`${API}/api/nbfc/dashboard/stats/${session.nbfc_id}`, {
//    headers: { 'Authorization': `Bearer ${session.access_token}` }
//});
//        if (!res.ok) return;
//        const d = await res.json();
//
//        document.getElementById('stat-borrowers').textContent = d.total_borrowers ?? '—';
//        document.getElementById('stat-active').textContent    = d.active_loans ?? '—';
//        document.getElementById('stat-disbursed').textContent = fmtINR(d.total_disbursed);
//document.getElementById('stat-pending').textContent   = d.pending_loans ?? '—';    // was pending_applications
//document.getElementById('stat-emi-due').textContent   = fmtINR(d.emi_due_month);   // was emi_due_this_month, also wrap in fmtINR
//        document.getElementById('stat-overdue').textContent   = d.overdue_emis ?? '—';
//
//        // Sidebar badges
//        if (d.pending_applications > 0)
//            document.getElementById('badge-loans').textContent = d.pending_applications;
//        if (d.overdue_emis > 0)
//            document.getElementById('badge-emis').textContent = d.overdue_emis;
//
//    } catch (e) { console.error('Stats error:', e); }
//}
//
//// ── Load recent applications ──────────────────────────────────────
//async function loadRecentApplications(session) {
//    const tbody = document.getElementById('recentBody');
//    try {
//const res = await fetch(`${API}/api/nbfc/dashboard/recent/${session.nbfc_id}`, {
//            headers: { 'Authorization': `Bearer ${session.access_token}` }
//        });
//        if (!res.ok) { tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Could not load applications.</td></tr>`; return; }
//        const data = await res.json();
//
//        const apps = data.recent || [];
//if (!apps.length) {
//            tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No applications yet. Share your portal link to get started.</td></tr>`;
//            return;
//        }
//
//        tbody.innerHTML = apps.map(a => `
//            <tr>
//                <td><strong>${a.borrower_name}</strong><br><span style="font-size:11px;color:var(--text-muted);">${a.mobile || ''}</span></td>
//                <td style="font-family:var(--font-mono);font-weight:700;">₹${Math.round(a.amount).toLocaleString('en-IN')}</td>
//                <td>${a.tenure_months} mo</td>
//                <td><span style="font-family:var(--font-mono);font-weight:700;color:var(--teal-600);">${a.credit_score ?? '—'}</span></td>
//                <td>${statusBadge(a.status)}</td>
//                <td style="font-size:12px;color:var(--text-muted);">${fmtDate(a.applied_at)}</td>
//                <td><a class="tbl-btn" href="/nbfc/applications/${a.id}"><i class="ti ti-eye"></i> Review</a></td>
//            </tr>
//        `).join('');
//
//    } catch (e) {
//        tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Could not load applications.</td></tr>`;
//    }
//}
//
//// ── Load rules status ─────────────────────────────────────────────
//async function loadRulesStatus(session) {
//    const card = document.getElementById('rulesStatusCard');
//    try {
//        const res = await fetch(`${API}/api/nbfc/dashboard/profile/${session.nbfc_id}`, {
//            headers: { 'Authorization': `Bearer ${session.access_token}` }
//        });
//        if (!res.ok) { card.innerHTML = `<p style="font-size:13px;color:var(--text-muted);">Could not load rules.</p>`; return; }
//        const d = await res.json();
//
//        if (!d.min_loan_amount) {
//            card.innerHTML = `
//                <p style="font-size:13px;color:var(--warning);margin-bottom:12px;">
//                    <i class="ti ti-alert-triangle"></i> Loan rules not configured yet.
//                </p>
//                <a href="/nbfc/settings" class="btn-primary" style="font-size:12.5px;padding:8px 16px;">
//                    <i class="ti ti-settings"></i> Configure Now
//                </a>`;
//            return;
//        }
//
//        card.innerHTML = `
//            <div class="rules-row"><span class="rules-row-label">Loan Range</span><span class="rules-row-val">₹${(d.min_loan_amount/1000).toFixed(0)}K – ₹${(d.max_loan_amount/100000).toFixed(0)}L</span></div>
//            <div class="rules-row"><span class="rules-row-label">Interest Rate</span><span class="rules-row-val">${d.interest_rate}% p.a.</span></div>
//            <div class="rules-row"><span class="rules-row-label">Processing Fee</span><span class="rules-row-val">${d.processing_fee}%</span></div>
//            <div class="rules-row"><span class="rules-row-label">Tenure Range</span><span class="rules-row-val">${d.min_tenure_months} – ${d.max_tenure_months} months</span></div>
//            <div class="rules-row"><span class="rules-row-label">Max FOIR</span><span class="rules-row-val">${d.max_foir_percent}%</span></div>
//            <div class="rules-row"><span class="rules-row-label">Min Credit Score</span><span class="rules-row-val">${d.min_credit_score}</span></div>`;
//
//    } catch (e) {
//        card.innerHTML = `<p style="font-size:13px;color:var(--text-muted);">Could not load rules.</p>`;
//    }
//}
//
//// ── Portal sharing ────────────────────────────────────────────────
//function copyPortalLink() {
//    const url = `${window.location.origin}/borrower/login`;
//    navigator.clipboard.writeText(url).then(() => {
//        const fb = document.getElementById('copy-feedback');
//        fb.style.display = 'block';
//        setTimeout(() => fb.style.display = 'none', 2500);
//    });
//}
//
//function shareWhatsApp() {
//    const url = `${window.location.origin}/borrower/login`;
//    const text = `Apply for a loan through our portal: ${url}`;
//    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
//}
//
//// ── Sidebar toggle ────────────────────────────────────────────────
//function toggleSidebar() {
//    const sidebar = document.getElementById('sidebar');
//    const overlay = document.getElementById('sidebarOverlay');
//    if (window.innerWidth <= 768) {
//        sidebar.classList.toggle('mobile-open');
//        overlay.classList.toggle('show');
//    } else {
//        sidebar.classList.toggle('collapsed');
//        localStorage.setItem('nbfc_sidebar_collapsed',
//            sidebar.classList.contains('collapsed') ? '1' : '0');
//    }
//}
//
//// Restore sidebar state
//(function() {
//    if (localStorage.getItem('nbfc_sidebar_collapsed') === '1' && window.innerWidth > 768) {
//        const s = document.getElementById('sidebar');
//        if (s) { s.classList.add('collapsed'); }
//    }
//})();
//
//// ── Logout ────────────────────────────────────────────────────────
//function handleLogout() {
//    ['nbfc_token','nbfc_id','nbfc_name','nbfc_email'].forEach(k => localStorage.removeItem(k));
//    window.location.href = '/';
//}

// ═══════════════════════════════════════════════════════════════
//  nbfc-overview.js  —  LendOS NBFC Overview Page
// ═══════════════════════════════════════════════════════════════

const API = window.API_BASE || window.location.origin;

// ── Session ──────────────────────────────────────────────────────
function getSession() {
    const token = localStorage.getItem('nbfc_token');
    if (!token) return null;
    return {
        access_token: token,
        nbfc_id:  parseInt(localStorage.getItem('nbfc_id')),
        nbfc_name: localStorage.getItem('nbfc_name') || '',
    };
}

// ── Helpers ───────────────────────────────────────────────────────
function fmtINR(n) {
    if (!n && n !== 0) return '—';
    if (n >= 10000000) return '₹' + (n/10000000).toFixed(1) + 'Cr';
    if (n >= 100000)   return '₹' + (n/100000).toFixed(1) + 'L';
    if (n >= 1000)     return '₹' + (n/1000).toFixed(1) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusBadge(status) {
    const map = {
        pending:   ['badge-pending',  'Clock',        'Pending'],
        applied:   ['badge-applied',  'FileInvoice',  'Applied'],
        approved:  ['badge-approved', 'CircleCheck',  'Approved'],
        active:    ['badge-active',   'Rocket',       'Active'],
        rejected:  ['badge-rejected', 'X',            'Rejected'],
        closed:    ['badge-closed',   'Lock',         'Closed'],
    };
    const [cls, , label] = map[status] || ['badge-pending', 'Clock', status];
    return `<span class="badge ${cls}">${label}</span>`;
}

// ── On load ───────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    // Hide everything until token verified
    document.body.style.visibility = 'hidden';

    const session = getSession();
    if (!session) {
        window.location.href = '/nbfc/register';
        return;
    }

    // ── Verify token is valid with backend ──
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
        // ── Apply NBFC logo to topbar ──
        const profile  = await verify.json();
        const logoBox  = document.getElementById('topLogoIcon');
        if (profile.logo_url && logoBox) {
            logoBox.innerHTML = `<img src="${profile.logo_url}" alt="${profile.company_name}"
                style="width:100%;height:100%;object-fit:contain;padding:3px;border-radius:6px;"/>`;
        }
    } catch (e) {
        // Server unreachable — still redirect to register
        window.location.href = '/nbfc/register';
        return;
    }

    // Token valid — show page
    document.body.style.visibility = 'visible';

    // Fill topbar
    const name = session.nbfc_name || 'NBFC';
    document.getElementById('topNbfcName').textContent  = name;
    document.getElementById('companyAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('sidebarAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('sidebarNbfcName').textContent = name;
    document.getElementById('welcomeTitle').textContent = `Welcome back, ${name.split(' ')[0]}!`;

    // Fetch data in parallel
    await Promise.all([
        loadStats(session),
        loadRecentApplications(session),
        loadRulesStatus(session),
    ]);
});

// ── Load stats ────────────────────────────────────────────────────
async function loadStats(session) {
    try {
        const res = await fetch(`${API}/api/nbfc/dashboard/stats/${session.nbfc_id}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) return;
        const d = await res.json();

        document.getElementById('stat-borrowers').textContent = d.total_borrowers ?? '—';
        document.getElementById('stat-active').textContent    = d.active_loans ?? '—';
        document.getElementById('stat-disbursed').textContent = fmtINR(d.total_disbursed);
        document.getElementById('stat-pending').textContent   = d.pending_loans ?? '—';
        document.getElementById('stat-emi-due').textContent   = fmtINR(d.emi_due_month);
        document.getElementById('stat-overdue').textContent   = d.overdue_emis ?? '—';

        // Sidebar badges
        if (d.pending_applications > 0)
            document.getElementById('badge-loans').textContent = d.pending_applications;
        if (d.overdue_emis > 0)
            document.getElementById('badge-emis').textContent = d.overdue_emis;

    } catch (e) { console.error('Stats error:', e); }
}

// ── Load recent applications ──────────────────────────────────────
async function loadRecentApplications(session) {
    const tbody = document.getElementById('recentBody');
    try {
        const res = await fetch(`${API}/api/nbfc/dashboard/recent/${session.nbfc_id}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) { tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Could not load applications.</td></tr>`; return; }
        const data = await res.json();

        const apps = data.recent || [];
        if (!apps.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No applications yet.</td></tr>`;
            return;
        }

        tbody.innerHTML = apps.map(a => `
            <tr>
                <td><strong>${a.borrower_name}</strong><br><span style="font-size:11px;color:var(--text-muted);">${a.mobile || ''}</span></td>
                <td style="font-family:var(--font-mono);font-weight:700;">₹${Math.round(a.amount).toLocaleString('en-IN')}</td>
                <td>${a.tenure_months} mo</td>
                <td><span style="font-family:var(--font-mono);font-weight:700;color:var(--teal-600);">${a.credit_score ?? '—'}</span></td>
                <td>${statusBadge(a.status)}</td>
                <td style="font-size:12px;color:var(--text-muted);">${fmtDate(a.applied_at)}</td>
                <td><a class="tbl-btn" href="/nbfc/applications/${a.id}"><i class="ti ti-eye"></i> Review</a></td>
            </tr>
        `).join('');

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Could not load applications.</td></tr>`;
    }
}

// ── Load rules status ─────────────────────────────────────────────
async function loadRulesStatus(session) {
    const card = document.getElementById('rulesStatusCard');
    try {
        const res = await fetch(`${API}/api/nbfc/dashboard/profile/${session.nbfc_id}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) { card.innerHTML = `<p style="font-size:13px;color:var(--text-muted);">Could not load rules.</p>`; return; }
        const d = await res.json();

        if (!d.min_loan_amount) {
            card.innerHTML = `
                <p style="font-size:13px;color:var(--warning);margin-bottom:12px;">
                    <i class="ti ti-alert-triangle"></i> Loan rules not configured yet.
                </p>
                <a href="/nbfc/settings" class="btn-primary" style="font-size:12.5px;padding:8px 16px;">
                    <i class="ti ti-settings"></i> Configure Now
                </a>`;
            return;
        }

        card.innerHTML = `
            <div class="rules-status-grid">
                <div class="rules-cell">
                    <div class="rules-cell-label">Loan Range</div>
                    <div class="rules-cell-val">₹${(d.min_loan_amount/1000).toFixed(0)}K – ₹${(d.max_loan_amount/100000).toFixed(0)}L</div>
                </div>
                <div class="rules-cell">
                    <div class="rules-cell-label">Interest Rate</div>
                    <div class="rules-cell-val">${d.interest_rate}% p.a.</div>
                </div>
                <div class="rules-cell">
                    <div class="rules-cell-label">Processing Fee</div>
                    <div class="rules-cell-val">${d.processing_fee}%</div>
                </div>
                <div class="rules-cell">
                    <div class="rules-cell-label">Tenure Range</div>
                    <div class="rules-cell-val">${d.min_tenure_months} – ${d.max_tenure_months} mo</div>
                </div>
                <div class="rules-cell">
                    <div class="rules-cell-label">Max FOIR</div>
                    <div class="rules-cell-val">${d.max_foir_percent}%</div>
                </div>
                <div class="rules-cell">
                    <div class="rules-cell-label">Min Credit Score</div>
                    <div class="rules-cell-val">${d.min_credit_score}</div>
                </div>
            </div>`;

    } catch (e) {
        card.innerHTML = `<p style="font-size:13px;color:var(--text-muted);">Could not load rules.</p>`;
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

// Restore sidebar state
(function() {
    if (localStorage.getItem('nbfc_sidebar_collapsed') === '1' && window.innerWidth > 768) {
        const s = document.getElementById('sidebar');
        if (s) { s.classList.add('collapsed'); }
    }
})();

// ── Logout ────────────────────────────────────────────────────────
function handleLogout() {
    ['nbfc_token','nbfc_id','nbfc_name','nbfc_email'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/';
}
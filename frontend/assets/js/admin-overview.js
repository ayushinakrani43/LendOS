// ═══════════════════════════════════════════════════════════════
//  admin-overview.js — LendOS SuperAdmin Overview
// ═══════════════════════════════════════════════════════════════

const API = window.API_BASE || 'http://localhost:8000';

function getSession() {
    const token = localStorage.getItem('admin_token');
    if (!token) return null;
    return {
        token,
        name: localStorage.getItem('admin_name') || 'Admin',
    };
}

function authHeaders(s) { return { 'Authorization': `Bearer ${s.token}` }; }

function fmtINR(n) {
    if (!n && n !== 0) return '—';
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + 'Cr';
    if (n >= 100000)   return '₹' + (n / 100000).toFixed(2) + 'L';
    if (n >= 1000)     return '₹' + (n / 1000).toFixed(1) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function scoreChip(score) {
    if (!score) return '<span class="score-chip none">—</span>';
    const cls = score >= 750 ? 'excellent' : score >= 700 ? 'good' : score >= 650 ? 'fair' : 'poor';
    return `<span class="score-chip ${cls}">${score}</span>`;
}

function initials(name) {
    return (name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// ── Init ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    const session = getSession();
    if (!session) { window.location.href = '/admin/login'; return; }

    document.getElementById('adminName').textContent    = session.name;
    document.getElementById('adminAvatar').textContent  = session.name.charAt(0).toUpperCase();
    document.getElementById('sidebarAdminName').textContent = session.name;

    // Clock
    setInterval(() => {
        document.getElementById('healthTime').textContent =
            new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }, 1000);

    loadAll();
});

async function loadAll() {
    const session = getSession();
    document.getElementById('lastUpdated').textContent = 'Refreshing…';

    try {
const res  = await fetch(`${API}/api/admin/dashboard/overview`, { headers: authHeaders(session) });
        if (res.status === 401) { window.location.href = '/admin/login'; return; }
        const data = await res.json();

        renderKPIs(data);
        renderNBFCList(data.nbfcs || []);
        renderRecentLoans(data.recent_loans || []);
        renderStatusBreakdown(data.loan_status_counts || {});
        renderRecentBorrowers(data.recent_borrowers || []);

        document.getElementById('lastUpdated').textContent =
            'Last updated ' + new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    } catch(e) {
        document.getElementById('lastUpdated').textContent = 'Failed to load — check backend connection';
        console.error(e);
    }
}

// ── KPIs ──────────────────────────────────────────────────────
function renderKPIs(d) {
    const nbfcActive    = d.nbfc_active    || 0;
    const nbfcSuspended = d.nbfc_suspended || 0;
    const nbfcTotal     = nbfcActive + nbfcSuspended;

    document.getElementById('kpiNbfcs').textContent    = nbfcTotal;
    document.getElementById('subNbfcs').textContent    = `${nbfcActive} active · ${nbfcSuspended} suspended`;
    const chip = document.getElementById('chipNbfc');
    if (nbfcSuspended > 0) {
        chip.textContent = nbfcSuspended + ' suspended';
        chip.className = 'kpi-chip show warn';
    } else {
        chip.textContent = 'All active';
        chip.className = 'kpi-chip show ok';
    }

    document.getElementById('kpiBorrowers').textContent = d.total_borrowers || '—';
    document.getElementById('subBorrowers').textContent = `${d.kyc_submitted || 0} KYC submitted`;

    document.getElementById('kpiLoans').textContent    = d.total_loans || '—';
    document.getElementById('subLoans').textContent    = `${d.active_loans || 0} active · ${d.disbursed_loans || 0} disbursed`;

    document.getElementById('kpiDisbursed').textContent = fmtINR(d.total_disbursed || 0);
    document.getElementById('kpiOverdue').textContent   = d.overdue_emis || 0;
    document.getElementById('kpiCollected').textContent = fmtINR(d.total_collected || 0);
}

// ── NBFC list ─────────────────────────────────────────────────
function renderNBFCList(nbfcs) {
    const el = document.getElementById('nbfcList');
    if (!nbfcs.length) { el.innerHTML = '<div class="list-loading">No NBFCs registered yet</div>'; return; }
    el.innerHTML = nbfcs.slice(0, 7).map(n => `
        <div class="nbfc-row">
            <div class="nbfc-av">${initials(n.company_name)}</div>
            <div class="nbfc-info">
                <div class="nbfc-name">${n.company_name}</div>
                <div class="nbfc-meta">${n.city || '—'}, ${n.state} · ${n.interest_rate}% p.a.</div>
            </div>
            <div class="nbfc-stats">
                <div class="nbfc-loan-count">${n.loan_count || 0} loans</div>
                <span class="s-badge ${n.status}">${n.status}</span>
            </div>
        </div>
    `).join('');
}

// ── Recent loans ──────────────────────────────────────────────
function renderRecentLoans(loans) {
    const el = document.getElementById('recentLoans');
    if (!loans.length) { el.innerHTML = '<div class="list-loading">No loan applications yet</div>'; return; }
    el.innerHTML = loans.slice(0, 7).map(l => `
        <div class="loan-row">
            <div class="loan-av">${initials(l.borrower_name)}</div>
            <div class="loan-info">
                <div class="loan-borrower">${l.borrower_name || '—'}</div>
                <div class="loan-nbfc">${l.nbfc_name || '—'}</div>
            </div>
            <div class="loan-right">
                <div class="loan-amount">${fmtINR(l.amount)}</div>
                <span class="s-badge ${l.status}">${l.status}</span>
            </div>
        </div>
    `).join('');
}

// ── Status breakdown ──────────────────────────────────────────
function renderStatusBreakdown(counts) {
    const el = document.getElementById('statusBreakdown');
    const statuses = ['pending','applied','approved','active','disbursed','declined','rejected','closed'];
    const labels   = { pending:'Pending', applied:'Under Review', approved:'Approved', active:'Active', disbursed:'Disbursed', declined:'Declined', rejected:'Rejected', closed:'Closed' };
    const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;

    el.innerHTML = `<div class="status-bar-list">` + statuses.map(s => {
        const count = counts[s] || 0;
        const pct   = Math.round((count / total) * 100);
        return `
            <div class="sb-row">
                <div class="sb-label">${labels[s]}</div>
                <div class="sb-track"><div class="sb-fill ${s}" style="width:${pct}%;"></div></div>
                <div class="sb-count">${count}</div>
            </div>
        `;
    }).join('') + `</div>`;
}

// ── Recent borrowers ──────────────────────────────────────────
function renderRecentBorrowers(borrowers) {
    const el = document.getElementById('recentBorrowersBody');
    if (!borrowers.length) {
        el.innerHTML = '<tr><td colspan="6" class="tbl-loading">No borrowers yet</td></tr>'; return;
    }
    el.innerHTML = borrowers.slice(0, 8).map(b => `
        <tr>
            <td>
                <div class="b-cell">
                    <div class="b-av-sm">${initials(b.full_name)}</div>
                    <div>
                        <div style="font-weight:600;font-size:12.5px;">${b.full_name}</div>
                        <div class="mono" style="color:var(--text-muted);font-size:11px;">${b.email}</div>
                    </div>
                </div>
            </td>
            <td class="mono">${b.mobile || '—'}</td>
            <td>${scoreChip(b.credit_score)}</td>
            <td><span class="s-badge ${b.kyc_status}">${b.kyc_status}</span></td>
            <td><span class="s-badge ${b.loan_status || 'none'}">${b.loan_status || 'none'}</span></td>
            <td style="color:var(--text-muted);font-size:11.5px;">${fmtDate(b.created_at)}</td>
        </tr>
    `).join('');
}

// ── Sidebar / logout ──────────────────────────────────────────
function toggleSidebar() {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('sidebarOverlay');
    if (window.innerWidth <= 768) {
        s.classList.toggle('mobile-open');
        o.classList.toggle('show');
    } else {
        s.classList.toggle('collapsed');
    }
}

function handleLogout() {
    ['admin_token','admin_name'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/admin/login';
}
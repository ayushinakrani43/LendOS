const API = window.API_BASE || window.location.origin;

function getSession() {
    const token = localStorage.getItem('admin_token');
    if (!token) return null;
    return { access_token: token, admin_name: localStorage.getItem('admin_name') || 'Admin' };
}
function authHeaders(session) {
    return { 'Authorization': `Bearer ${session.access_token}` };
}

let allScores = [];
let currentTab = 'all';
let searchQuery = '';
let searchDebounce;

const GRADE_CLASS = {
    'Excellent': 'excellent',
    'Good':      'good',
    'Fair':      'fair',
    'Poor':      'poor',
    'Very Poor': 'verypoor',
};

window.addEventListener('DOMContentLoaded', async () => {
    const session = getSession();
    if (!session) { window.location.href = '/admin/login'; return; }

    document.getElementById('adminName').textContent = session.admin_name;
    document.getElementById('adminAvatar').textContent = session.admin_name.charAt(0).toUpperCase();
    document.getElementById('sidebarAdminName').textContent = session.admin_name;

    if (localStorage.getItem('admin_sidebar_collapsed') === '1' && window.innerWidth > 768) {
        document.getElementById('sidebar')?.classList.add('collapsed');
    }

    await loadScores();
});

async function loadScores() {
    const session = getSession();
    try {
        const url = new URL(`${API}/api/admin/dashboard/scores`);
        if (searchQuery) url.searchParams.set('search', searchQuery);

        const res = await fetch(url, { headers: authHeaders(session) });
        if (!res.ok) throw new Error('Failed to load scores.');
        allScores = await res.json();

        renderStats();
        renderTable();
    } catch (e) {
        document.getElementById('resultsCount').textContent = 'Error loading data.';
    }
}

function renderStats() {
    const total     = allScores.length;
    const excellent = allScores.filter(s => s.grade === 'Excellent').length;
    const good      = allScores.filter(s => s.grade === 'Good').length;
    const fair      = allScores.filter(s => s.grade === 'Fair').length;
    const poor      = allScores.filter(s => s.grade === 'Poor').length;
    const veryPoor  = allScores.filter(s => s.grade === 'Very Poor').length;

    document.getElementById('statTotal').textContent     = total;
    document.getElementById('statExcellent').textContent = excellent;
    document.getElementById('statGood').textContent      = good;
    document.getElementById('statFair').textContent      = fair;
    document.getElementById('statPoor').textContent      = poor + veryPoor;
}

function renderTable() {
    const filtered = currentTab === 'all'
        ? allScores
        : currentTab === 'poor'
            ? allScores.filter(s => s.grade === 'Poor' || s.grade === 'Very Poor')
            : allScores.filter(s => (GRADE_CLASS[s.grade] || '') === currentTab);

    document.getElementById('resultsCount').textContent =
        `${filtered.length} of ${allScores.length} records`;

    if (filtered.length === 0) {
        document.getElementById('tableBody').innerHTML = '';
        document.getElementById('emptyState').style.display = 'flex';
        document.getElementById('emptyTitle').textContent =
            searchQuery ? 'No matching records' : 'No credit score records found';
        document.getElementById('emptySub').textContent =
            searchQuery ? 'Try a different search term.' : 'Scores will appear here once borrowers complete document upload.';
        return;
    }
    document.getElementById('emptyState').style.display = 'none';

    document.getElementById('tableBody').innerHTML = filtered.map(s => {
        const initials = (s.borrower_name || 'B').charAt(0).toUpperCase();
        const cls = GRADE_CLASS[s.grade] || '';
        return `
            <tr>
                <td>
                    <div class="loan-cell">
                        <div class="loan-av">${initials}</div>
                        <div>
                            <div class="loan-name">${s.borrower_name || '—'}</div>
                            <div class="loan-sub">${s.borrower_mobile || '—'}</div>
                        </div>
                    </div>
                </td>
                <td class="muted">${s.nbfc_name || '—'}</td>
                <td><span class="score-val ${cls}">${s.final_score}</span></td>
                <td><span class="status-badge ${cls}">${s.grade}</span></td>
                <td><span class="action-pill">${(s.nbfc_action || '').replace(/_/g, ' ')}</span></td>
                <td class="muted">${fmtDate(s.created_at)}</td>
                <td><div class="tbl-actions">
                    <button class="btn-view" onclick="openModal(${s.id})"><i class="ti ti-eye"></i> View</button>
                </div></td>
            </tr>
        `;
    }).join('');
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function handleSearch(value) {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        searchQuery = value.trim();
        loadScores();
    }, 350);
}

function switchTab(btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.grade;
    renderTable();
}

// ── Detail modal ─────────────────────────────────────────────
async function openModal(scoreId) {
    document.getElementById('scoreModal').classList.add('open');
    document.getElementById('modalBody').innerHTML = '<div class="modal-loading"><i class="ti ti-loader-2 spin"></i> Loading…</div>';

    const session = getSession();
    try {
        const res = await fetch(`${API}/api/admin/dashboard/scores/${scoreId}`, { headers: authHeaders(session) });
        if (!res.ok) throw new Error('Failed to load score details.');
        const s = await res.json();
        renderModal(s);
    } catch (e) {
        document.getElementById('modalBody').innerHTML = `<div class="modal-loading">Could not load details.</div>`;
    }
}

function num(v, decimals = 0) {
    if (v === null || v === undefined) return '—';
    return Number(v).toLocaleString('en-IN', { maximumFractionDigits: decimals });
}

function renderModal(s) {
    const cls = GRADE_CLASS[s.grade] || '';

    document.getElementById('modalAvatar').textContent = (s.borrower_name || 'B').charAt(0).toUpperCase();
    document.getElementById('modalTitle').textContent = s.borrower_name || '—';
    document.getElementById('modalSub').textContent = `${s.nbfc_name || '—'} · Score record #${s.id}`;

    document.getElementById('modalBody').innerHTML = `
        <div class="score-hero">
            <div class="score-hero-left">
                <div class="score-hero-big score-val ${cls}">${s.final_score}</div>
                <div class="score-hero-sub">Base score: ${s.base_score} / 900</div>
            </div>
            <div class="score-hero-right">
                <span class="status-badge ${cls}" style="font-size:13px; padding:5px 14px;">${s.grade}</span>
                <div style="margin-top:8px;"><span class="action-pill">${(s.nbfc_action || '').replace(/_/g, ' ')}</span></div>
            </div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title"><i class="ti ti-user"></i> Borrower</div>
            <div class="detail-grid">
                <div class="detail-cell"><div class="detail-label">Name</div><div class="detail-val">${s.borrower_name || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Mobile</div><div class="detail-val">${s.borrower_mobile || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Email</div><div class="detail-val">${s.borrower_email || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Scored On</div><div class="detail-val">${fmtDate(s.created_at)}</div></div>
            </div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title"><i class="ti ti-list-check"></i> Score Breakdown — 7 Steps</div>

            <div class="step-row">
                <div class="step-left">
                    <div class="step-name">1. FOIR (Fixed Obligation to Income Ratio)</div>
                    <div class="step-detail">Avg obligations ₹${num(s.step1_avg_obligations)} / Avg income ₹${num(s.step1_avg_income)} → FOIR ${num(s.step1_foir_pct, 1)}%</div>
                </div>
                <div class="step-points ${!s.step1_points ? 'zero' : ''}">+${s.step1_points ?? 0} / 150</div>
            </div>

            <div class="step-row">
                <div class="step-left">
                    <div class="step-name">2. Income Level</div>
                    <div class="step-detail">Avg bank credits ₹${num(s.step2_avg_bank_credits)} / Salary net pay ₹${num(s.step2_salary_net_pay)} → Income ₹${num(s.step2_income)}</div>
                </div>
                <div class="step-points ${!s.step2_points ? 'zero' : ''}">+${s.step2_points ?? 0} / 120</div>
            </div>

            <div class="step-row">
                <div class="step-left">
                    <div class="step-name">3. Income Consistency</div>
                    <div class="step-detail">Avg income ₹${num(s.step3_avg_income)} / Std dev ₹${num(s.step3_std_dev)} → Variation ${num(s.step3_variation_pct, 1)}%</div>
                </div>
                <div class="step-points ${!s.step3_points ? 'zero' : ''}">+${s.step3_points ?? 0} / 100</div>
            </div>

            <div class="step-row">
                <div class="step-left">
                    <div class="step-name">4. Bounce Record</div>
                    <div class="step-detail">Total bounces: ${s.step4_total_bounces ?? 0}</div>
                </div>
                <div class="step-points ${!s.step4_points ? 'zero' : ''}">+${s.step4_points ?? 0} / 100</div>
            </div>

            <div class="step-row">
                <div class="step-left">
                    <div class="step-name">5. Average Balance</div>
                    <div class="step-detail">Avg balance: ₹${num(s.step5_avg_balance)}</div>
                </div>
                <div class="step-points ${!s.step5_points ? 'zero' : ''}">+${s.step5_points ?? 0} / 80</div>
            </div>

            <div class="step-row">
                <div class="step-left">
                    <div class="step-name">6. Loan-to-Income Ratio</div>
                    <div class="step-detail">Annual income ₹${num(s.step6_annual_income)} / Requested loan ₹${num(s.step6_requested_loan)} → LTI ${num(s.step6_lti, 1)}%</div>
                </div>
                <div class="step-points ${!s.step6_points ? 'zero' : ''}">+${s.step6_points ?? 0} / 30</div>
            </div>

            <div class="step-row">
                <div class="step-left">
                    <div class="step-name">7. Employment Type</div>
                    <div class="step-detail">Category: ${s.step7_category || '—'}</div>
                </div>
                <div class="step-points ${!s.step7_points ? 'zero' : ''}">+${s.step7_points ?? 0} / 20</div>
            </div>
        </div>
    `;

    document.getElementById('modalFooter').innerHTML = `<button class="btn-outline" onclick="closeModal()">Close</button>`;
}

function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('scoreModal').classList.remove('open');
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
        overlay.classList.toggle('show');
    } else {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('admin_sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
    }
}
function handleLogout() {
    ['admin_token', 'admin_name'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/admin/login';
}
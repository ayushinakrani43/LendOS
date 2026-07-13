
// ═══════════════════════════════════════════════════════════════
//  admin-borrowers.js — LendOS SuperAdmin Borrowers Page
// ═══════════════════════════════════════════════════════════════

const API = window.API_BASE || window.location.origin;

function getSession() {
    const token = localStorage.getItem('admin_token');
    if (!token) return null;
    return { token, name: localStorage.getItem('admin_name') || 'Admin' };
}
function authHeaders(s) { return { 'Authorization': `Bearer ${s.token}` }; }
function fmtINR(n) {
    if (!n && n !== 0) return '—';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000)   return '₹' + (n / 1000).toFixed(0) + 'K';
    return '₹' + n;
}
function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function initials(name) {
    return (name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function scoreChip(score) {
    if (!score) return '<span class="score-chip none">—</span>';
    const cls = score >= 750 ? 'excellent' : score >= 700 ? 'good' : score >= 650 ? 'fair' : 'poor';
    return `<span class="score-chip ${cls}">${score}</span>`;
}

let allBorrowers = [];
let filtered     = [];
let searchQuery  = '';
const PAGE_SIZE  = 15;
let currentPage  = 1;

// ── Init ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    const session = getSession();
    if (!session) { window.location.href = '/admin/login'; return; }

    document.getElementById('adminName').textContent        = session.name;
    document.getElementById('adminAvatar').textContent      = session.name.charAt(0).toUpperCase();
    document.getElementById('sidebarAdminName').textContent = session.name;

    await loadBorrowers(session);
});

// ── Load ──────────────────────────────────────────────────────
async function loadBorrowers(session) {
    session = session || getSession();
    try {
const res = await fetch(`${API}/api/admin/dashboard/borrowers`, { headers: authHeaders(session) });
        if (res.status === 401) { window.location.href = '/admin/login'; return; }
        const data = await res.json();
        allBorrowers = data.borrowers || [];
        renderStats();
        applyFilter();
    } catch(e) {
        document.getElementById('tableBody').innerHTML =
            `<tr><td colspan="8" class="tbl-loading" style="color:#dc2626;">Failed to load — check backend</td></tr>`;
    }
}

// ── Stats ─────────────────────────────────────────────────────
function renderStats() {
    const total     = allBorrowers.length;
    const submitted = allBorrowers.filter(b => b.kyc_status === 'submitted').length;
    const active    = allBorrowers.filter(b => ['active','disbursed'].includes(b.loan_status)).length;

    document.getElementById('statTotal').textContent     = total;
    document.getElementById('statSubmitted').textContent = submitted;
    document.getElementById('statActive').textContent    = active;
}

// ── Search ─────────────────────────────────────────────────────
function handleSearch(val) {
    searchQuery = val.toLowerCase().trim();
    currentPage = 1;
    applyFilter();
}

// ── Filter + render ────────────────────────────────────────────
function applyFilter() {
    filtered = allBorrowers.filter(b => {
        const matchSearch = !searchQuery ||
            (b.full_name || '').toLowerCase().includes(searchQuery) ||
            (b.mobile    || '').includes(searchQuery) ||
            (b.email     || '').toLowerCase().includes(searchQuery);

        return matchSearch;
    });

    renderTable();
    renderPagination();
}

// ── Table ──────────────────────────────────────────────────────
function renderTable() {
    const tbody = document.getElementById('tableBody');
    const empty = document.getElementById('emptyState');
    const footer= document.getElementById('tableFooter');

    const start = (currentPage - 1) * PAGE_SIZE;
    const page  = filtered.slice(start, start + PAGE_SIZE);

    document.getElementById('resultsCount').textContent =
        `${filtered.length} of ${allBorrowers.length} borrowers`;

    if (!page.length) {
        tbody.innerHTML = '';
        empty.style.display  = 'flex';
        footer.style.display = 'none';
        document.getElementById('emptyTitle').textContent = searchQuery ? 'No results found' : 'No borrowers in this filter';
        document.getElementById('emptySub').textContent   = searchQuery ? 'Try a different search term.' : 'Try another tab.';
        return;
    }

    empty.style.display  = 'none';
    footer.style.display = 'flex';

    tbody.innerHTML = page.map(b => `
        <tr>
            <td>
                <div class="b-cell">
                    <div class="b-av">${initials(b.full_name)}</div>
                    <div>
                        <div class="b-name">${b.full_name}</div>
                        <div class="b-email">${b.email}</div>
                    </div>
                </div>
            </td>
            <td><span class="mono">${b.mobile || '—'}</span></td>
            <td>${scoreChip(b.credit_score)}</td>
            <td style="font-size:12.5px;color:var(--text-secondary);">${b.nbfc_name || '—'}</td>
            <td><span class="s-badge ${b.kyc_status}">${b.kyc_status}</span></td>
            <td><span class="s-badge ${b.loan_status || 'none'}">${b.loan_status || 'none'}</span></td>
            <td style="font-size:12px;color:var(--text-muted);">${fmtDate(b.created_at)}</td>
            <td style="text-align:right;">
                <button class="view-btn" onclick="openModal(${b.id})">
                    <i class="ti ti-eye"></i> View
                </button>
            </td>
        </tr>
    `).join('');

    // Footer info
    const end = Math.min(start + PAGE_SIZE, filtered.length);
    document.getElementById('footerInfo').textContent = `Showing ${start + 1}–${end} of ${filtered.length}`;
}

// ── Pagination ─────────────────────────────────────────────────
function renderPagination() {
    const total = Math.ceil(filtered.length / PAGE_SIZE);
    const pg    = document.getElementById('pagination');
    if (total <= 1) { pg.innerHTML = ''; return; }

    let html = `<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?'disabled':''}>‹</button>`;
    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || Math.abs(i - currentPage) <= 1) {
            html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
        } else if (Math.abs(i - currentPage) === 2) {
            html += `<span style="padding:0 4px;color:var(--text-muted);">…</span>`;
        }
    }
    html += `<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===total?'disabled':''}>›</button>`;
    pg.innerHTML = html;
}

function goPage(p) {
    const total = Math.ceil(filtered.length / PAGE_SIZE);
    if (p < 1 || p > total) return;
    currentPage = p;
    renderTable();
    renderPagination();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Modal ──────────────────────────────────────────────────────
async function openModal(borrowerId) {
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('modalBody').innerHTML =
        '<div class="tbl-loading"><i class="ti ti-loader-2 spin"></i> Loading profile…</div>';
    document.getElementById('modalTitle').textContent = 'Borrower Profile';

    const session = getSession();
    try {
 const res = await fetch(`${API}/api/admin/dashboard/borrowers/${borrowerId}`, { headers: authHeaders(session) });
        const data = await res.json();
        renderModal(data);
    } catch(e) {
        document.getElementById('modalBody').innerHTML =
            '<div class="tbl-loading" style="color:#dc2626;">Failed to load profile.</div>';
    }
}

function renderModal(d) {
    const b = d.borrower || d;
    const loans = d.loans || [];

    document.getElementById('modalTitle').textContent = b.full_name || 'Borrower Profile';

    document.getElementById('modalBody').innerHTML = `
        <!-- Profile top -->
        <div class="modal-section">
            <div class="modal-profile-top">
                <div class="modal-av">${initials(b.full_name)}</div>
                <div>
                    <div class="modal-av-name">${b.full_name}</div>
                    <div class="modal-av-email">${b.email}</div>
                    <div class="modal-av-score">${scoreChip(b.credit_score)}</div>
                </div>
            </div>
        </div>

        <!-- Personal info -->
        <div class="modal-section">
            <div class="modal-section-title">Personal Information</div>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Mobile</div>
                    <div class="info-val mono">${b.mobile || '—'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Date of Birth</div>
                    <div class="info-val">${b.date_of_birth || '—'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Gender</div>
                    <div class="info-val">${b.gender || '—'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Employment Type</div>
                    <div class="info-val">${b.employment_type || '—'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">PAN Number</div>
                    <div class="info-val mono">${b.pan_number || '—'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Aadhaar Number</div>
                    <div class="info-val mono">${b.aadhaar_number ? b.aadhaar_number.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 XXXX') : '—'}</div>
                </div>
                <div class="info-item" style="grid-column:span 2;">
                    <div class="info-label">Address</div>
                    <div class="info-val">${b.address || '—'}</div>
                </div>
            </div>
        </div>

        <!-- Status info -->
        <div class="modal-section">
            <div class="modal-section-title">Platform Status</div>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">KYC Status</div>
                    <div class="info-val"><span class="s-badge ${b.kyc_status}">${b.kyc_status}</span></div>
                </div>
                <div class="info-item">
                    <div class="info-label">Loan Status</div>
                    <div class="info-val"><span class="s-badge ${b.loan_status||'none'}">${b.loan_status||'none'}</span></div>
                </div>
                <div class="info-item">
                    <div class="info-label">Linked NBFC</div>
                    <div class="info-val">${b.nbfc_name || '—'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Joined</div>
                    <div class="info-val">${fmtDate(b.created_at)}</div>
                </div>
            </div>
        </div>

        <!-- Loan history -->
        <div class="modal-section">
            <div class="modal-section-title">Loan History</div>
            ${loans.length === 0
                ? '<div class="no-loans">No loan applications yet</div>'
                : `<table class="loan-hist-table">
                    <thead><tr><th>NBFC</th><th>Amount</th><th>EMI</th><th>Status</th><th>Applied</th></tr></thead>
                    <tbody>
                        ${loans.map(l => `
                            <tr>
                                <td>${l.nbfc_name || '—'}</td>
                                <td><span style="font-family:var(--font-mono);font-weight:600;">${fmtINR(l.amount)}</span></td>
                                <td><span style="font-family:var(--font-mono);">${fmtINR(l.emi_amount)}</span></td>
                                <td><span class="s-badge ${l.status}">${l.status}</span></td>
                                <td style="color:var(--text-muted);font-size:11px;">${fmtDate(l.applied_at)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`
            }
        </div>
    `;
}

function closeModal(e) {
    if (!e || e.target === document.getElementById('modalOverlay')) {
        document.getElementById('modalOverlay').style.display = 'none';
    }
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
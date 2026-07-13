const API = window.API_BASE || 'http://localhost:8000';

function getSession() {
    const token = localStorage.getItem('admin_token');
    if (!token) return null;
    return { access_token: token, admin_name: localStorage.getItem('admin_name') || 'Admin' };
}

function authHeaders(session) {
    return { 'Authorization': `Bearer ${session.access_token}` };
}

let allLoans = [];
let currentTab = 'all';
let searchQuery = '';
let searchDebounce;

window.addEventListener('DOMContentLoaded', async () => {
    const session = getSession();
    if (!session) { window.location.href = '/admin/login'; return; }

    document.getElementById('adminName').textContent = session.admin_name;
    document.getElementById('adminAvatar').textContent = session.admin_name.charAt(0).toUpperCase();
    document.getElementById('sidebarAdminName').textContent = session.admin_name;

    if (localStorage.getItem('admin_sidebar_collapsed') === '1' && window.innerWidth > 768) {
        document.getElementById('sidebar')?.classList.add('collapsed');
    }

    await loadLoans();
});

// ── Load & render ──────────────────────────────────────────────
async function loadLoans() {
    const session = getSession();
    try {
        const url = new URL(`${API}/api/admin/dashboard/loans`);
        if (searchQuery) url.searchParams.set('search', searchQuery);

        const res = await fetch(url, { headers: authHeaders(session) });
        if (!res.ok) throw new Error('Failed to load loans.');
        allLoans = await res.json();

        renderStats();
        renderTable();
    } catch (e) {
        document.getElementById('resultsCount').textContent = 'Error loading data.';
    }
}

function renderStats() {
    const total    = allLoans.length;
    const active   = allLoans.filter(l => l.status === 'active' || l.status === 'disbursed').length;
    const pending  = allLoans.filter(l => l.status === 'pending' || l.status === 'applied').length;
    const declined = allLoans.filter(l => l.status === 'declined').length;
    const closed   = allLoans.filter(l => l.status === 'closed').length;

    document.getElementById('statTotal').textContent   = total;
    document.getElementById('statActive').textContent  = active;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statClosed').textContent  = closed;

    document.getElementById('tab-count-pending').textContent = pending;
    document.getElementById('badgePending').textContent = pending > 0 ? pending : '';
    document.getElementById('badgePending').style.display = pending > 0 ? 'inline-flex' : 'none';
}

function renderTable() {
    const filtered = currentTab === 'all'
        ? allLoans
        : currentTab === 'pending'
            ? allLoans.filter(l => l.status === 'pending' || l.status === 'applied')
            : currentTab === 'active'
                ? allLoans.filter(l => l.status === 'active' || l.status === 'disbursed')
                : allLoans.filter(l => l.status === currentTab);

    document.getElementById('resultsCount').textContent =
        `${filtered.length} of ${allLoans.length} loans`;

    if (filtered.length === 0) {
        document.getElementById('tableBody').innerHTML = '';
        document.getElementById('emptyState').style.display = 'flex';
        document.getElementById('emptyTitle').textContent =
            searchQuery ? 'No matching loans' : 'No loans found';
        document.getElementById('emptySub').textContent =
            searchQuery ? 'Try a different search term.' : 'Loan applications will appear here once borrowers apply.';
        return;
    }
    document.getElementById('emptyState').style.display = 'none';

    document.getElementById('tableBody').innerHTML = filtered.map(l => {
        const initials = (l.borrower_name || 'B').charAt(0).toUpperCase();
        return `
            <tr>
                <td>
                    <div class="loan-cell">
                        <div class="loan-av">${initials}</div>
                        <div>
                            <div class="loan-name">${l.borrower_name || '—'}</div>
                            <div class="loan-sub">${l.borrower_mobile || '—'}</div>
                        </div>
                    </div>
                </td>
                <td class="muted">${l.nbfc_name || '—'}</td>
                <td class="mono">${fmtINR(l.requested_loan_amount)}</td>
                <td class="mono">${l.approved_amount ? fmtINR(l.approved_amount) : '—'}</td>
                <td class="muted">${l.tenure_months ? l.tenure_months + ' mo' : '—'}</td>
                <td class="mono">${l.emi_amount ? fmtINR(l.emi_amount) : '—'}</td>
                <td><span class="status-badge ${l.status}">${l.status}</span></td>
                <td class="muted">${fmtDate(l.applied_at)}</td>
                <td><div class="tbl-actions">
                    <button class="btn-view" onclick="openModal(${l.id})"><i class="ti ti-eye"></i> View</button>
                </div></td>
            </tr>
        `;
    }).join('');
}

function fmtINR(n) {
    if (!n && n !== 0) return '—';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(2).replace(/\.?0+$/, '') + 'L';
    if (n >= 1000)   return '₹' + (n / 1000).toFixed(1).replace(/\.?0+$/, '') + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}
function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Search & tabs ─────────────────────────────────────────────
function handleSearch(value) {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        searchQuery = value.trim();
        loadLoans();
    }, 350);
}

function switchTab(btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.status;
    renderTable();
}

// ── Detail modal ─────────────────────────────────────────────
async function openModal(loanId) {
    document.getElementById('loanModal').classList.add('open');
    document.getElementById('modalBody').innerHTML = '<div class="modal-loading"><i class="ti ti-loader-2 spin"></i> Loading…</div>';

    const session = getSession();
    try {
        const res = await fetch(`${API}/api/admin/dashboard/loans/${loanId}`, { headers: authHeaders(session) });
        if (!res.ok) throw new Error('Failed to load loan details.');
        const data = await res.json();
        renderModal(data);
    } catch (e) {
        document.getElementById('modalBody').innerHTML = `<div class="modal-loading">Could not load details.</div>`;
    }
}

function renderModal(data) {
    const l = data.loan;
    const emis = data.emis || [];

    document.getElementById('modalAvatar').textContent = (l.borrower_name || 'B').charAt(0).toUpperCase();
    document.getElementById('modalTitle').textContent = l.borrower_name || '—';
    document.getElementById('modalSub').textContent = `${l.nbfc_name || '—'} · Loan #${l.id}`;

    const paidEmis = emis.filter(e => e.status === 'paid').length;

    document.getElementById('modalBody').innerHTML = `
        <div class="stat-row-grid">
            <div class="stat-mini"><div class="stat-mini-val teal">${fmtINR(l.amount)}</div><div class="stat-mini-label">Requested</div></div>
            <div class="stat-mini"><div class="stat-mini-val">${l.approved_amount ? fmtINR(l.approved_amount) : '—'}</div><div class="stat-mini-label">Approved</div></div>
            <div class="stat-mini"><div class="stat-mini-val">${l.emi_amount ? fmtINR(l.emi_amount) : '—'}</div><div class="stat-mini-label">EMI Amount</div></div>
            <div class="stat-mini"><div class="stat-mini-val">${paidEmis}/${emis.length}</div><div class="stat-mini-label">EMIs Paid</div></div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title"><i class="ti ti-user"></i> Borrower & Lender</div>
            <div class="detail-grid">
                <div class="detail-cell"><div class="detail-label">Borrower</div><div class="detail-val">${l.borrower_name || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Mobile</div><div class="detail-val mono">${l.borrower_mobile || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Email</div><div class="detail-val">${l.borrower_email || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Credit Score</div><div class="detail-val mono">${l.credit_score || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">NBFC</div><div class="detail-val">${l.nbfc_name || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Status</div><div class="detail-val"><span class="status-badge ${l.status}">${l.status}</span></div></div>
            </div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title"><i class="ti ti-file-invoice"></i> Loan Terms</div>
            <div class="detail-grid">
                <div class="detail-cell"><div class="detail-label">Purpose</div><div class="detail-val">${l.purpose || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Tenure</div><div class="detail-val mono">${l.tenure_months ? l.tenure_months + ' months' : '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Interest Rate</div><div class="detail-val mono">${l.interest_rate ? l.interest_rate + '% p.a.' : '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Processing Fee</div><div class="detail-val mono">${l.processing_fee_amount ? fmtINR(l.processing_fee_amount) : '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Amount Disbursed</div><div class="detail-val mono">${l.amount_disbursed ? fmtINR(l.amount_disbursed) : '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Applied On</div><div class="detail-val">${fmtDate(l.applied_at)}</div></div>
            </div>
        </div>

        ${emis.length ? `
        <div class="modal-section">
            <div class="modal-section-title"><i class="ti ti-calendar-event"></i> EMI Schedule</div>
            <table class="emi-mini-table">
                <thead><tr><th>#</th><th>Due Date</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                    ${emis.map(e => `
                        <tr>
                            <td>${e.instalment_number}</td>
                            <td>${fmtDate(e.due_date)}</td>
                            <td class="mono">${fmtINR(e.amount)}</td>
                            <td><span class="status-badge ${e.status === 'paid' ? 'active' : e.status === 'overdue' ? 'rejected' : 'pending'}">${e.status}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ` : ''}
    `;

    document.getElementById('modalFooter').innerHTML = `<button class="btn-outline" onclick="closeModal()">Close</button>`;
}

function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('loanModal').classList.remove('open');
}

// ── Sidebar + logout ──────────────────────────────────────────
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
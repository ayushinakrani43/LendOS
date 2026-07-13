const API = window.API_BASE || window.location.origin;

function getSession() {
    const token = localStorage.getItem('admin_token');
    if (!token) return null;
    return { access_token: token, admin_name: localStorage.getItem('admin_name') || 'Admin' };
}

function authHeaders(session) {
    return { 'Authorization': `Bearer ${session.access_token}` };
}

let allNbfcs = [];
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

    await loadNbfcs();
});

// ── Load & render ──────────────────────────────────────────────
async function loadNbfcs() {
    const session = getSession();
    try {
        const url = new URL(`${API}/api/admin/dashboard/nbfcs`);
        if (searchQuery) url.searchParams.set('search', searchQuery);

        const res = await fetch(url, { headers: authHeaders(session) });
        if (!res.ok) throw new Error('Failed to load NBFCs.');
        allNbfcs = await res.json();

        renderStats();
        renderTable();
    } catch (e) {
        document.getElementById('resultsCount').textContent = 'Error loading data.';
    }
}

function renderStats() {
    const total     = allNbfcs.length;
    const active    = allNbfcs.filter(n => n.status === 'active').length;
    const pending   = allNbfcs.filter(n => n.status === 'pending').length;
    const suspended = allNbfcs.filter(n => n.status === 'suspended').length;

    document.getElementById('statTotal').textContent     = total;
    document.getElementById('statActive').textContent    = active;
    document.getElementById('statPending').textContent   = pending;
    document.getElementById('statSuspended').textContent = suspended;

    document.getElementById('tab-count-pending').textContent = pending;
    document.getElementById('badgePending').textContent = pending > 0 ? pending : '';
    document.getElementById('badgePending').style.display = pending > 0 ? 'inline-flex' : 'none';
}

function renderTable() {
    const filtered = currentTab === 'all'
        ? allNbfcs
        : allNbfcs.filter(n => n.status === currentTab);

    document.getElementById('resultsCount').textContent =
        `${filtered.length} of ${allNbfcs.length} NBFCs`;

    if (filtered.length === 0) {
        document.getElementById('tableBody').innerHTML = '';
        document.getElementById('emptyState').style.display = 'flex';
        document.getElementById('emptyTitle').textContent =
            searchQuery ? 'No matching NBFCs' : 'No NBFCs found';
        document.getElementById('emptySub').textContent =
            searchQuery ? 'Try a different search term.' : 'NBFCs that register on the platform will appear here.';
        return;
    }
    document.getElementById('emptyState').style.display = 'none';

    document.getElementById('tableBody').innerHTML = filtered.map(n => {
        const initials = (n.company_name || 'N').charAt(0).toUpperCase();
        const logo = n.logo_url
            ? `<div class="nbfc-av"><img src="${n.logo_url}" alt=""/></div>`
            : `<div class="nbfc-av">${initials}</div>`;

        let actions = `<button class="btn-view" onclick="openModal(${n.id})"><i class="ti ti-eye"></i> View</button>`;
        if (n.status === 'pending') {
            actions += `<button class="btn-approve" onclick="quickApprove(${n.id})"><i class="ti ti-check"></i> Approve</button>`;
        } else if (n.status === 'active') {
            actions += `<button class="btn-suspend" onclick="openSuspendModal(${n.id}, '${(n.company_name || '').replace(/'/g, "\\'")}')"><i class="ti ti-ban"></i> Suspend</button>`;
        } else if (n.status === 'suspended') {
            actions += `<button class="btn-activate" onclick="quickApprove(${n.id})"><i class="ti ti-check"></i> Activate</button>`;
        }

        return `
            <tr>
                <td>
                    <div class="nbfc-cell">
                        ${logo}
                        <div>
                            <div class="nbfc-name">${n.company_name || '—'}</div>
                            <div class="nbfc-reg">${n.registration_number || '—'}</div>
                        </div>
                    </div>
                </td>
                <td class="muted">${n.city ? n.city + ', ' : ''}${n.state || '—'}</td>
                <td class="mono">${n.interest_rate ? n.interest_rate + '% p.a.' : '—'}</td>
                <td class="mono">${n.min_loan_amount ? fmtINR(n.min_loan_amount) + '–' + fmtINR(n.max_loan_amount) : '—'}</td>
                <td class="mono">${n.loan_count ?? '—'}</td>
                <td class="mono">${n.total_disbursed ? fmtINR(n.total_disbursed) : '—'}</td>
                <td><span class="status-badge ${n.status}">${n.status}</span></td>
                <td class="muted">${fmtDate(n.created_at)}</td>
                <td><div class="tbl-actions">${actions}</div></td>
            </tr>
        `;
    }).join('');
}

function fmtINR(n) {
    if (!n && n !== 0) return '—';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000)   return '₹' + (n / 1000).toFixed(1) + 'K';
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
        loadNbfcs();
    }, 350);
}

function switchTab(btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentTab = btn.dataset.status;
    renderTable();
}

// ── Quick approve/activate (no reason needed) ───────────────────
async function quickApprove(nbfcId) {
    const session = getSession();
    try {
        const res = await fetch(`${API}/api/admin/dashboard/nbfcs/${nbfcId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
            body: JSON.stringify({ status: 'active' }),
        });
        if (!res.ok) throw new Error('Failed to update status.');
        showToast('NBFC activated.', 'success');
        await loadNbfcs();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// ── Suspend flow ─────────────────────────────────────────────
let suspendTargetId = null;

function openSuspendModal(nbfcId, name) {
    suspendTargetId = nbfcId;
    document.getElementById('suspendModalSub').textContent = name;
    document.getElementById('suspendReason').value = '';
    document.getElementById('suspendModal').classList.add('open');
}
function closeSuspendModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('suspendModal').classList.remove('open');
    suspendTargetId = null;
}
async function confirmSuspend() {
    const reason = document.getElementById('suspendReason').value.trim();
    if (!reason) { showToast('Please enter a reason.', 'error'); return; }

    const session = getSession();
    try {
        const res = await fetch(`${API}/api/admin/dashboard/nbfcs/${suspendTargetId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders(session) },
            body: JSON.stringify({ status: 'suspended', reason }),
        });
        if (!res.ok) throw new Error('Failed to suspend NBFC.');
        showToast('NBFC suspended.', 'success');
        closeSuspendModal();
        await loadNbfcs();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

// ── Detail modal ─────────────────────────────────────────────
async function openModal(nbfcId) {
    document.getElementById('nbfcModal').classList.add('open');
    document.getElementById('modalBody').innerHTML = '<div class="modal-loading"><i class="ti ti-loader-2 spin"></i> Loading…</div>';
    document.getElementById('modalFooter').innerHTML = '';

    const session = getSession();
    try {
        const res = await fetch(`${API}/api/admin/dashboard/nbfcs/${nbfcId}`, { headers: authHeaders(session) });
        if (!res.ok) throw new Error('Failed to load NBFC details.');
        const data = await res.json();
        renderModal(data);
    } catch (e) {
        document.getElementById('modalBody').innerHTML = `<div class="modal-loading">Could not load details.</div>`;
    }
}

function renderModal(data) {
    const n = data.nbfc;
    document.getElementById('modalAvatar').textContent = (n.company_name || 'N').charAt(0).toUpperCase();
    document.getElementById('modalTitle').textContent = n.company_name || '—';
    document.getElementById('modalSub').textContent = n.email || '—';

    document.getElementById('modalBody').innerHTML = `
        <div class="stat-row-grid">
            <div class="stat-mini"><div class="stat-mini-val teal">${data.loan_count ?? 0}</div><div class="stat-mini-label">Total Loans</div></div>
            <div class="stat-mini"><div class="stat-mini-val">${fmtINR(data.total_disbursed)}</div><div class="stat-mini-label">Disbursed</div></div>
            <div class="stat-mini"><div class="stat-mini-val">${data.borrowers ? data.borrowers.length : 0}</div><div class="stat-mini-label">Borrowers</div></div>
            <div class="stat-mini"><div class="stat-mini-val">${n.interest_rate || '—'}%</div><div class="stat-mini-label">Interest Rate</div></div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title"><i class="ti ti-building-bank"></i> Company Info</div>
            <div class="detail-grid">
                <div class="detail-cell"><div class="detail-label">Registration No.</div><div class="detail-val mono">${n.registration_number || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">GST Number</div><div class="detail-val mono">${n.gst_number || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Mobile</div><div class="detail-val mono">${n.mobile || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Location</div><div class="detail-val">${n.city || ''}${n.city ? ', ' : ''}${n.state || '—'}</div></div>
                <div class="detail-cell"><div class="detail-label">Status</div><div class="detail-val"><span class="status-badge ${n.status}">${n.status}</span></div></div>
                <div class="detail-cell"><div class="detail-label">Registered On</div><div class="detail-val">${fmtDate(n.created_at)}</div></div>
            </div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title"><i class="ti ti-settings"></i> Loan Rules</div>
            <div class="detail-grid">
                <div class="detail-cell"><div class="detail-label">Loan Range</div><div class="detail-val mono">${fmtINR(n.min_loan_amount)} – ${fmtINR(n.max_loan_amount)}</div></div>
                <div class="detail-cell"><div class="detail-label">Tenure Range</div><div class="detail-val mono">${n.min_tenure_months || '—'} – ${n.max_tenure_months || '—'} mo</div></div>
                <div class="detail-cell"><div class="detail-label">Processing Fee</div><div class="detail-val mono">${n.processing_fee || '—'}%</div></div>
                <div class="detail-cell"><div class="detail-label">Min Credit Score</div><div class="detail-val mono">${n.min_credit_score || '—'}</div></div>
            </div>
        </div>
    `;

    let footer = '';
    if (n.status === 'pending') {
        footer = `
            <button class="btn-outline" onclick="closeModal()">Close</button>
            <button class="btn-primary" onclick="quickApprove(${n.id}); closeModal();"><i class="ti ti-check"></i> Approve NBFC</button>
        `;
    } else if (n.status === 'active') {
        footer = `
            <button class="btn-outline" onclick="closeModal()">Close</button>
            <button class="btn-danger" onclick="closeModal(); openSuspendModal(${n.id}, '${(n.company_name || '').replace(/'/g, "\\'")}');"><i class="ti ti-ban"></i> Suspend</button>
        `;
    } else if (n.status === 'suspended') {
        footer = `
            <button class="btn-outline" onclick="closeModal()">Close</button>
            <button class="btn-primary" onclick="quickApprove(${n.id}); closeModal();"><i class="ti ti-check"></i> Reactivate</button>
        `;
    } else {
        footer = `<button class="btn-outline" onclick="closeModal()">Close</button>`;
    }
    document.getElementById('modalFooter').innerHTML = footer;
}

function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('nbfcModal').classList.remove('open');
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
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
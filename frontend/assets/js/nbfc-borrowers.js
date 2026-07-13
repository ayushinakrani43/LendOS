// ═══════════════════════════════════════════════════════════════
//  nbfc-borrowers.js  —  LendOS NBFC Borrowers Page
// ═══════════════════════════════════════════════════════════════

const API = window.API_BASE || 'http://localhost:8000';
let currentPage = 1;
let allBorrowers = [];
let searchTimer = null;
const LIMIT = 15;

function getSession() {
    const token = localStorage.getItem('nbfc_token');
    if (!token) return null;
    return {
        access_token: token,
        nbfc_id: parseInt(localStorage.getItem('nbfc_id')),
        nbfc_name: localStorage.getItem('nbfc_name') || '',
    };
}

function fmtINR(n) {
    if (!n && n !== 0) return '—';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function scoreChip(score) {
    if (!score) return `<span class="score-chip none">—</span>`;
    if (score >= 750) return `<span class="score-chip excellent">${score}</span>`;
    if (score >= 650) return `<span class="score-chip good">${score}</span>`;
    if (score >= 550) return `<span class="score-chip fair">${score}</span>`;
    return `<span class="score-chip poor">${score}</span>`;
}

function kycBadge(status) {
    const map = {
        verified:  ['badge-verified',  '✓ Verified'],
        submitted: ['badge-submitted', '⏳ Submitted'],
        pending:   ['badge-pending',   '○ Pending'],
    };
    const [cls, label] = map[status] || ['badge-pending', status || '—'];
    return `<span class="kyc-badge ${cls}">${label}</span>`;
}

function loanStatusBadge(status) {
    const map = {
        none:              ['ls-none',     'No Loan'],
        pending_agreement: ['ls-applied',  'Agreement Pending'],
        applied:           ['ls-applied',  'Applied'],
        approved:          ['ls-approved', 'Approved'],
        active:            ['ls-active',   'Active'],
        closed:            ['ls-closed',   'Closed'],
    };
    const [cls, label] = map[status] || ['ls-none', status || '—'];
    return `<span class="loan-status-badge ${cls}">${label}</span>`;
}

// ── On load ───────────────────────────────────────────────────
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
    const name = session.nbfc_name || 'NBFC';
    document.getElementById('topNbfcName').textContent     = name;
    document.getElementById('companyAvatar').textContent   = name.charAt(0).toUpperCase();
    document.getElementById('sidebarAvatar').textContent   = name.charAt(0).toUpperCase();
    document.getElementById('sidebarNbfcName').textContent = name;

    if (localStorage.getItem('nbfc_sidebar_collapsed') === '1' && window.innerWidth > 768) {
        document.getElementById('sidebar')?.classList.add('collapsed');
    }

    await loadBorrowers(session, 1);
});

// ── Load borrowers ────────────────────────────────────────────
async function loadBorrowers(session, page) {
    showSkeleton();
    try {
        const res = await fetch(
            `${API}/api/nbfc/dashboard/borrowers/${session.nbfc_id}?page=${page}&limit=${LIMIT}`,
            { headers: { 'Authorization': `Bearer ${session.access_token}` } }
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        allBorrowers = data.borrowers || [];
        currentPage  = data.page || page;

    updateStats(allBorrowers, data.total);
        renderTable(allBorrowers, document.getElementById('searchInput').value.trim());
        renderPagination(data.total, currentPage, LIMIT);

    } catch (e) {
        document.getElementById('tableBody').innerHTML =
            `<tr><td colspan="9" class="table-empty">Could not load borrowers. Please refresh.</td></tr>`;
    }
}

function updateStats(borrowers, total) {
    document.getElementById('bstat-total').textContent    = total ?? borrowers.length;
document.getElementById('bstat-verified').textContent = borrowers.filter(b => ['verified','submitted'].includes(b.kyc_status)).length;
document.getElementById('bstat-applied').textContent  = borrowers.filter(b => ['applied','pending_agreement','pending'].includes(b.loan_status)).length;
document.getElementById('bstat-active').textContent   = borrowers.filter(b => ['active','disbursed'].includes(b.loan_status)).length;
}

// ── Render table ──────────────────────────────────────────────
function renderTable(borrowers, search) {
    const tbody  = document.getElementById('tableBody');
    const empty  = document.getElementById('emptyState');
    const footer = document.getElementById('tableFooter');

    const filtered = search
        ? borrowers.filter(b => {
            const q = search.toLowerCase();
            return (b.full_name || '').toLowerCase().includes(q)
                || (b.mobile || '').includes(q)
                || (b.pan_number || '').toLowerCase().includes(q)
                || (b.email || '').toLowerCase().includes(q);
        })
        : borrowers;

    if (!filtered.length) {
        tbody.innerHTML = '';
        empty.style.display  = 'flex';
        footer.style.display = 'none';
        return;
    }

    empty.style.display  = 'none';
    footer.style.display = 'flex';

    tbody.innerHTML = filtered.map(b => `
        <tr class="clickable" onclick="openProfile(${b.id})">
            <td>
                <div class="borrower-cell">
                    <div class="borrower-avatar">${initials(b.full_name)}</div>
                    <div>
                        <div class="borrower-name">${b.full_name || '—'}</div>
                        <div class="borrower-email">${b.email || ''}</div>
                    </div>
                </div>
            </td>
            <td style="font-family:var(--font-mono);font-size:13px;">${b.mobile || '—'}</td>
            <td style="font-family:var(--font-mono);font-size:12.5px;">${b.pan_number || '—'}</td>
            <td style="font-size:13px;">${b.employment_type ? b.employment_type.replace(/_/g,' ') : '—'}</td>
            <td>${kycBadge(b.kyc_status)}</td>
            <td>${scoreChip(b.credit_score)}</td>
            <td>${loanStatusBadge(b.loan_status)}</td>
            <td style="font-size:12.5px;color:var(--text-muted);">${fmtDate(b.created_at)}</td>
            <td><button class="view-btn" onclick="event.stopPropagation();openProfile(${b.id})"><i class="ti ti-eye"></i> View</button></td>
        </tr>
    `).join('');
}

// ── Render pagination ─────────────────────────────────────────
function renderPagination(total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    const from = ((page - 1) * limit) + 1;
    const to   = Math.min(page * limit, total);
    document.getElementById('footerInfo').textContent = total > 0 ? `Showing ${from}–${to} of ${total}` : '';

    const pg = document.getElementById('pagination');
    if (totalPages <= 1) { pg.innerHTML = ''; return; }

    let html = `<button class="page-btn" onclick="goPage(${page-1})" ${page<=1?'disabled':''}><i class="ti ti-chevron-left"></i></button>`;
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="page-btn ${i===page?'active':''}" onclick="goPage(${i})">${i}</button>`;
    }
    html += `<button class="page-btn" onclick="goPage(${page+1})" ${page>=totalPages?'disabled':''}><i class="ti ti-chevron-right"></i></button>`;
    pg.innerHTML = html;
}

function goPage(page) {
    const session = getSession();
    if (!session) return;
    currentPage = page;
    loadBorrowers(session, page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Search ────────────────────────────────────────────────────
function handleSearch(val) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderTable(allBorrowers, val.trim()), 250);
}

// ── Profile Modal ─────────────────────────────────────────────
async function openProfile(borrowerId) {
    document.getElementById('profileModal').classList.add('open');
    document.getElementById('modalBody').innerHTML =
        `<div style="text-align:center;padding:48px;color:var(--text-muted);"><i class="ti ti-loader-2" style="font-size:28px;animation:spin 1s linear infinite;"></i></div>`;

    const session = getSession();
    if (!session) return;

    try {
const res = await fetch(`${API}/api/nbfc/dashboard/borrower/${borrowerId}?nbfc_id=${session.nbfc_id}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) throw new Error();
        const b = await res.json();

        const inits = initials(b.full_name);
        document.getElementById('modalAvatar').textContent = inits;
        document.getElementById('modalName').textContent   = b.full_name || '—';
        document.getElementById('modalSub').textContent    = `${b.email || ''} · ${b.mobile || ''}`;

        // Parse bank data
        let bankData = {};
        let incomeData = {};
        try { bankData   = typeof b.bank_data   === 'string' ? JSON.parse(b.bank_data)   : (b.bank_data   || {}); } catch {}
        try { incomeData = typeof b.income_data  === 'string' ? JSON.parse(b.income_data)  : (b.income_data  || {}); } catch {}

        document.getElementById('modalBody').innerHTML = `
            <div class="profile-grid">

                <!-- Personal Info -->
                <div class="profile-section">
                    <div class="profile-section-title"><i class="ti ti-user"></i> Personal Information</div>
                    <div class="profile-rows">
                        <div class="profile-row"><span class="pr-label">Full Name</span><span class="pr-val">${b.full_name || '—'}</span></div>
                        <div class="profile-row"><span class="pr-label">Mobile</span><span class="pr-val mono">${b.mobile || '—'}</span></div>
                        <div class="profile-row"><span class="pr-label">Email</span><span class="pr-val">${b.email || '—'}</span></div>
                        <div class="profile-row"><span class="pr-label">PAN</span><span class="pr-val mono">${b.pan_number || '—'}</span></div>
                        <div class="profile-row"><span class="pr-label">Aadhaar</span><span class="pr-val mono">${b.aadhaar_number ? 'XXXX-XXXX-' + String(b.aadhaar_number).slice(-4) : '—'}</span></div>
                        <div class="profile-row"><span class="pr-label">Date of Birth</span><span class="pr-val">${b.date_of_birth || '—'}</span></div>
                        <div class="profile-row"><span class="pr-label">Gender</span><span class="pr-val">${b.gender || '—'}</span></div>
                        <div class="profile-row"><span class="pr-label">Employment</span><span class="pr-val">${(b.employment_type || '—').replace(/_/g,' ')}</span></div>
                        <div class="profile-row"><span class="pr-label">Address</span><span class="pr-val" style="font-size:12.5px;line-height:1.5;">${b.address || '—'}</span></div>
                    </div>
                </div>

                <!-- Status & Score -->
                <div class="profile-section">
                    <div class="profile-section-title"><i class="ti ti-chart-pie"></i> Credit & Status</div>
                    <div class="profile-score-hero">
                        <div class="psh-score ${b.credit_score >= 750 ? 'excellent' : b.credit_score >= 650 ? 'good' : b.credit_score >= 550 ? 'fair' : 'poor'}">${b.credit_score || '—'}</div>
                        <div class="psh-label">Credit Score / 900</div>
                    </div>
                    <div class="profile-rows" style="margin-top:12px;">
                        <div class="profile-row"><span class="pr-label">KYC Status</span><span class="pr-val">${kycBadge(b.kyc_status)}</span></div>
                        <div class="profile-row"><span class="pr-label">Loan Status</span><span class="pr-val">${loanStatusBadge(b.loan_status)}</span></div>
                        <div class="profile-row"><span class="pr-label">Joined</span><span class="pr-val">${fmtDate(b.created_at)}</span></div>
                    </div>
                </div>

      <!-- Loan Details -->
                <div class="profile-section full-width">
                    <div class="profile-section-title"><i class="ti ti-file-invoice"></i> Loan Application</div>
                    ${b.loan_id ? `
                    <div class="bank-grid-3">
                        <div class="bank-box"><div class="bank-box-label">Loan Amount</div><div class="bank-box-val">${fmtINR(b.amount)}</div></div>
                        <div class="bank-box"><div class="bank-box-label">Monthly EMI</div><div class="bank-box-val">${fmtINR(b.emi_amount)}</div></div>
                        <div class="bank-box"><div class="bank-box-label">Tenure</div><div class="bank-box-val">${b.tenure_months} months</div></div>
                        <div class="bank-box"><div class="bank-box-label">Status</div><div class="bank-box-val">${b.loan_app_status || '—'}</div></div>
                        <div class="bank-box"><div class="bank-box-label">Applied On</div><div class="bank-box-val">${fmtDate(b.applied_at)}</div></div>
                    </div>` : '<p style="font-size:13px;color:var(--text-muted);padding:4px 0;">No loan application yet.</p>'}
                </div>

            </div>
        `;
    } catch (e) {
        document.getElementById('modalBody').innerHTML =
            `<div style="text-align:center;padding:32px;color:var(--text-muted);">Could not load borrower profile.</div>`;
    }
}

function closeModal(event) {
    if (event && event.target !== document.getElementById('profileModal')) return;
    document.getElementById('profileModal').classList.remove('open');
}

// ── Skeleton ──────────────────────────────────────────────────
function showSkeleton() {
    document.getElementById('emptyState').style.display  = 'none';
    document.getElementById('tableFooter').style.display = 'none';
    document.getElementById('tableBody').innerHTML = [1,2,3,4,5].map(() => `
        <tr>
            <td style="padding:14px 16px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(90deg,var(--border-light) 25%,#f0f4f6 50%,var(--border-light) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;flex-shrink:0;"></div>
                    <div style="flex:1;"><div class="skeleton-line w60" style="margin-bottom:6px;"></div><div class="skeleton-line" style="width:40%;height:9px;"></div></div>
                </div>
            </td>
            <td><div class="skeleton-line" style="width:90px;"></div></td>
            <td><div class="skeleton-line" style="width:80px;"></div></td>
            <td><div class="skeleton-line" style="width:70px;"></div></td>
            <td><div class="skeleton-line" style="width:70px;border-radius:99px;"></div></td>
            <td><div class="skeleton-line" style="width:44px;"></div></td>
            <td><div class="skeleton-line" style="width:70px;border-radius:99px;"></div></td>
            <td><div class="skeleton-line" style="width:70px;"></div></td>
            <td><div class="skeleton-line" style="width:50px;margin-left:auto;"></div></td>
        </tr>
    `).join('');
}

// ── Sidebar & Logout ──────────────────────────────────────────
function toggleSidebar() {
    const s = document.getElementById('sidebar');
    const o = document.getElementById('sidebarOverlay');
    if (window.innerWidth <= 768) { s.classList.toggle('mobile-open'); o.classList.toggle('show'); }
    else {
        s.classList.toggle('collapsed');
        localStorage.setItem('nbfc_sidebar_collapsed', s.classList.contains('collapsed') ? '1' : '0');
    }
}

function handleLogout() {
    ['nbfc_token','nbfc_id','nbfc_name','nbfc_email'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/nbfc/register';
}

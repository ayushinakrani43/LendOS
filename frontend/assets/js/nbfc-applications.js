// ═══════════════════════════════════════════════════════════════
//  nbfc-applications.js  —  LendOS NBFC Loan Applications Page
// ═══════════════════════════════════════════════════════════════

const API = window.API_BASE || 'http://localhost:8000';

// ── State ─────────────────────────────────────────────────────────
let currentStatus = 'all';
let currentPage   = 1;
let currentSearch = '';
let searchTimer   = null;
let allLoans      = [];   // full current page data (for client-side search)
const LIMIT       = 15;

// ── Session ───────────────────────────────────────────────────────
function getSession() {
    const token = localStorage.getItem('nbfc_token');
    if (!token) return null;
    return {
        access_token: token,
        nbfc_id:      parseInt(localStorage.getItem('nbfc_id')),
        nbfc_name:    localStorage.getItem('nbfc_name') || '',
    };
}

// ── Helpers ───────────────────────────────────────────────────────
function fmtINR(n) {
    if (!n && n !== 0) return '—';
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000)   return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000)     return '₹' + (n / 1000).toFixed(0) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

function fmtINRFull(n) {
    if (!n && n !== 0) return '—';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
    });
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

function foirCell(foir, maxFoir) {
    if (!foir) return '<span style="color:var(--text-muted);font-size:12px;">—</span>';
    const limit   = maxFoir || 50;
    const pct     = Math.min(foir, 100);
    const cls     = foir <= limit ? 'safe' : foir <= limit + 10 ? 'moderate' : 'high';
    const barPct  = Math.min(pct, 100);
    return `
        <div class="foir-wrap">
            <div class="foir-row">
                <span class="foir-pct ${cls}">${foir.toFixed(1)}%</span>
            </div>
            <div class="foir-track">
                <div class="foir-fill ${cls}" style="width:${barPct}%"></div>
            </div>
        </div>`;
}

function statusBadge(status) {
    const map = {
        pending:  ['ti-clock-hour-4',  'Pending'],
        applied:  ['ti-loader-2',       'Under Review'],
        approved: ['ti-circle-check',   'Approved'],
        active:   ['ti-rocket',         'Active'],
        rejected: ['ti-x-circle',       'Rejected'],
        closed:   ['ti-lock',           'Closed'],
    };
    const [icon, label] = map[status] || ['ti-circle', status];
    return `<span class="status-badge ${status}">
        <i class="ti ${icon}"></i>${label}
    </span>`;
}

function purposeLabel(raw) {
    const map = {
        personal: 'Personal', medical: 'Medical', education: 'Education',
        home_renovation: 'Home Reno', business: 'Business',
        vehicle: 'Vehicle', travel: 'Travel', wedding: 'Wedding',
        debt_consolidation: 'Debt Consol.', other: 'Other',
    };
    return map[raw] || (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '');
}

function reviewBtnHtml(loan) {
    if (loan.status === 'pending' || loan.status === 'applied') {
        return `<a class="review-btn" href="/nbfc/applications/${loan.id}">
            <i class="ti ti-eye"></i> Review
        </a>`;
    }
    return `<a class="review-btn view" href="/nbfc/applications/${loan.id}">
        <i class="ti ti-eye"></i> View
    </a>`;
}

// ── On load ───────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    const session = getSession();
if (!session) { window.location.href = '/nbfc/register'; return; }
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
    // Topbar + sidebar
    const name = session.nbfc_name || 'NBFC';
    document.getElementById('topNbfcName').textContent     = name;
    document.getElementById('companyAvatar').textContent   = name.charAt(0).toUpperCase();
    document.getElementById('sidebarAvatar').textContent   = name.charAt(0).toUpperCase();
    document.getElementById('sidebarNbfcName').textContent = name;

    // Restore sidebar collapse
    if (localStorage.getItem('nbfc_sidebar_collapsed') === '1' && window.innerWidth > 768) {
        document.getElementById('sidebar')?.classList.add('collapsed');
    }

    // Load stats + first page of applications in parallel
    await Promise.all([
        loadStatusCounts(session),
        loadApplications(session, 'all', 1),
    ]);
});

// ── Load per-status counts for stats strip + tab badges ───────────
//async function loadStatusCounts(session) {
//    try {
//        // Fetch counts for each status in parallel
//        const statuses = ['pending', 'applied', 'approved', 'active', 'rejected', 'closed'];
//        const results  = await Promise.all(
//            statuses.map(s =>
//                fetch(`${API}/api/nbfc/dashboard/loans/${session.nbfc_id}?status=${s}&page=1&limit=1`, {
//                    headers: { 'Authorization': `Bearer ${session.access_token}` }
//                }).then(r => r.json()).catch(() => ({ total: 0 }))
//            )
//        );
//
//        const counts = {};
//        statuses.forEach((s, i) => { counts[s] = results[i].total || 0; });
//        const total = Object.values(counts).reduce((a, b) => a + b, 0);
//
//        // Stats strip
//        document.getElementById('stat-total').textContent    = total;
//        document.getElementById('stat-pending').textContent  = counts.pending;
//        document.getElementById('stat-applied').textContent  = counts.applied;
//        document.getElementById('stat-approved').textContent = counts.approved;
//        document.getElementById('stat-rejected').textContent = counts.rejected;
//        document.getElementById('stat-active').textContent   = counts.active;
//        document.getElementById('tab-count-declined').textContent = apps.filter(a => a.status === 'declined').length;
//
//        // Tab badges
//        setTabCount('pending',  counts.pending);
//        setTabCount('applied',  counts.applied);
//        setTabCount('approved', counts.approved);
//        setTabCount('active',   counts.active);
//        setTabCount('rejected', counts.rejected);
//
//        // Sidebar badge (pending + applied = needs attention)
//        const needsAction = counts.pending + counts.applied;
//        const sidebarBadge = document.getElementById('badge-loans');
//        if (sidebarBadge && needsAction > 0) {
//            sidebarBadge.textContent = needsAction;
//        }
//
//    } catch (e) {
//        console.error('Count load error:', e);
//    }
//}

async function loadStatusCounts(session) {
    try {
        const statuses = ['pending', 'applied', 'approved', 'active', 'rejected', 'closed', 'declined'];
        const results  = await Promise.all(
            statuses.map(s =>
                fetch(`${API}/api/nbfc/dashboard/loans/${session.nbfc_id}?status=${s}&page=1&limit=1`, {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                }).then(r => r.json()).catch(() => ({ total: 0 }))
            )
        );

        const counts = {};
        statuses.forEach((s, i) => { counts[s] = results[i].total || 0; });
        const total = Object.values(counts).reduce((a, b) => a + b, 0);

        // Stats strip
        document.getElementById('stat-total').textContent    = total;
        document.getElementById('stat-pending').textContent  = counts.pending;
        document.getElementById('stat-applied').textContent  = counts.applied;
        document.getElementById('stat-approved').textContent = counts.approved;
        document.getElementById('stat-rejected').textContent = counts.rejected;
        document.getElementById('stat-active').textContent   = counts.active;

        // Tab badges — show only if count > 0
        function setTabCount(status, count) {
            const el = document.getElementById(`tab-count-${status}`);
            if (!el) return;
            if (count > 0) {
                el.textContent    = count;
                el.style.display  = 'inline-flex';
            } else {
                el.style.display  = 'none';
            }
        }

        setTabCount('pending',  counts.pending);
        setTabCount('applied',  counts.applied);
        setTabCount('approved', counts.approved);
        setTabCount('active',   counts.active);
        setTabCount('rejected', counts.rejected);
        setTabCount('declined', counts.declined);

        // Sidebar badge
        const needsAction  = counts.pending + counts.applied;
        const sidebarBadge = document.getElementById('badge-loans');
        if (sidebarBadge && needsAction > 0) {
            sidebarBadge.textContent = needsAction;
        }

    } catch (e) {
        console.error('Count load error:', e);
    }
}

function setTabCount(status, count) {
    const el = document.getElementById(`tab-count-${status}`);
    if (!el) return;
    el.textContent = count;
    el.style.display = count > 0 ? 'inline-flex' : 'none';
}

// ── Load applications table ───────────────────────────────────────
async function loadApplications(session, status, page) {
    showSkeleton();

    let url = `${API}/api/nbfc/dashboard/loans/${session.nbfc_id}?page=${page}&limit=${LIMIT}`;
    if (status && status !== 'all') url += `&status=${status}`;

    try {
        const res  = await fetch(url, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();

        allLoans     = data.loans || [];
        currentPage  = data.page  || page;

        renderTable(allLoans, currentSearch);
        renderFooter(data.total, currentPage, LIMIT);

    } catch (e) {
        console.error('Load error:', e);
        showTableError();
    }
}

// ── Render table rows ─────────────────────────────────────────────
function renderTable(loans, search) {
    const tbody = document.getElementById('tableBody');
    const empty = document.getElementById('emptyState');
    const footer = document.getElementById('tableFooter');

    // Client-side search filter
    const filtered = search
        ? loans.filter(l => {
            const q = search.toLowerCase();
            return (l.borrower_name  || '').toLowerCase().includes(q)
                || (l.borrower_mobile || '').toLowerCase().includes(q)
                || String(l.amount || '').includes(q);
        })
        : loans;

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'flex';
        footer.style.display = 'none';
        updateEmptyState();
        document.getElementById('resultsCount').textContent = '0 results';
        return;
    }

    empty.style.display  = 'none';
    footer.style.display = 'flex';

    // Get NBFC's max_foir from profile (cached in localStorage if available)
    const maxFoir = parseFloat(localStorage.getItem('nbfc_max_foir') || '50');

    tbody.innerHTML = filtered.map(loan => `
        <tr>
            <td>
                <div class="borrower-cell">
                    <div class="borrower-avatar">${initials(loan.borrower_name)}</div>
                    <div>
                        <div class="borrower-name">${loan.borrower_name || '—'}</div>
                        <div class="borrower-mobile">${loan.borrower_mobile || ''}</div>
                    </div>
                </div>
            </td>
            <td>
                <div class="amount-val">${fmtINRFull(loan.amount)}</div>
                <div class="amount-purpose">${purposeLabel(loan.purpose)}</div>
            </td>
            <td>
                <span class="tenure-val">${loan.tenure_months || '—'} mo</span>
            </td>
            <td>
                <span class="emi-val">${fmtINR(loan.emi_amount)}/mo</span>
            </td>
            <td>${scoreChip(loan.credit_score)}</td>
            <td>${foirCell(loan.foir_at_application, maxFoir)}</td>
            <td>${statusBadge(loan.status)}</td>
            <td><span class="date-val">${fmtDate(loan.applied_at)}</span></td>
            <td style="text-align:right;">${reviewBtnHtml(loan)}</td>
        </tr>
    `).join('');

    document.getElementById('resultsCount').textContent =
        `${filtered.length} of ${loans.length} application${loans.length !== 1 ? 's' : ''}`;
}

// ── Render footer + pagination ────────────────────────────────────
function renderFooter(total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    const from = ((page - 1) * limit) + 1;
    const to   = Math.min(page * limit, total);

    document.getElementById('footerInfo').textContent =
        total > 0 ? `Showing ${from}–${to} of ${total}` : '';

    const pagination = document.getElementById('pagination');
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';

    // Prev button
    html += `<button class="page-btn" onclick="goPage(${page - 1})"
        ${page <= 1 ? 'disabled' : ''}>
        <i class="ti ti-chevron-left"></i>
    </button>`;

    // Page numbers — smart ellipsis
    const pages = getPageRange(page, totalPages);
    pages.forEach(p => {
        if (p === '…') {
            html += `<span style="padding:0 4px;color:var(--text-muted);font-size:13px;">…</span>`;
        } else {
            html += `<button class="page-btn ${p === page ? 'active' : ''}"
                onclick="goPage(${p})">${p}</button>`;
        }
    });

    // Next button
    html += `<button class="page-btn" onclick="goPage(${page + 1})"
        ${page >= totalPages ? 'disabled' : ''}>
        <i class="ti ti-chevron-right"></i>
    </button>`;

    pagination.innerHTML = html;
}

function getPageRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
    if (current >= total - 3) return [1, '…', total-4, total-3, total-2, total-1, total];
    return [1, '…', current - 1, current, current + 1, '…', total];
}

function goPage(page) {
    const session = getSession();
    if (!session) return;
    currentPage = page;
    loadApplications(session, currentStatus, page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Tab switching ─────────────────────────────────────────────────
function switchTab(btn) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    currentStatus = btn.dataset.status;
    currentPage   = 1;
    currentSearch = '';
    document.getElementById('searchInput').value = '';
    const session = getSession();
    if (session) loadApplications(session, currentStatus, 1);
}

// ── Search ────────────────────────────────────────────────────────
function handleSearch(val) {
    currentSearch = val.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
        renderTable(allLoans, currentSearch);
    }, 250);
}

// ── Skeleton ──────────────────────────────────────────────────────
function showSkeleton() {
    document.getElementById('emptyState').style.display  = 'none';
    document.getElementById('tableFooter').style.display = 'none';
    document.getElementById('resultsCount').textContent  = 'Loading…';
    document.getElementById('tableBody').innerHTML = [1,2,3,4,5].map(() => `
        <tr class="skeleton-row">
            <td style="padding:14px 16px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(90deg,var(--border-light) 25%,#f0f4f6 50%,var(--border-light) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;flex-shrink:0;"></div>
                    <div style="flex:1;">
                        <div class="skeleton-line w60" style="margin-bottom:6px;"></div>
                        <div class="skeleton-line w50" style="height:9px;width:40%;"></div>
                    </div>
                </div>
            </td>
            <td><div class="skeleton-line w80"></div></td>
            <td><div class="skeleton-line" style="width:40px;"></div></td>
            <td><div class="skeleton-line" style="width:60px;"></div></td>
            <td><div class="skeleton-line" style="width:44px;"></div></td>
            <td><div class="skeleton-line" style="width:60px;"></div></td>
            <td><div class="skeleton-line" style="width:80px;border-radius:99px;"></div></td>
            <td><div class="skeleton-line" style="width:70px;"></div></td>
            <td><div class="skeleton-line" style="width:60px;margin-left:auto;"></div></td>
        </tr>
    `).join('');
}

function showTableError() {
    document.getElementById('tableBody').innerHTML = `
        <tr>
            <td colspan="9" style="text-align:center;padding:48px 16px;color:var(--text-muted);font-size:13px;">
                <i class="ti ti-wifi-off" style="font-size:28px;display:block;margin-bottom:10px;opacity:0.5;"></i>
                Could not load applications. Please refresh the page.
            </td>
        </tr>`;
}

function updateEmptyState() {
    const titles = {
        all:      ['No applications yet',        'Share your portal link with borrowers to receive loan applications.'],
        pending:  ['No pending applications',     'All pending applications have been reviewed.'],
        applied:  ['No applications under review','Nothing awaiting your decision right now.'],
        approved: ['No approved applications',    'Approved applications will appear here.'],
        active:   ['No active loans',             'Active loans will appear here after disbursement.'],
        rejected: ['No rejected applications',    'Rejected applications will appear here.'],
        closed:   ['No closed loans',             'Closed loans will appear here.'],
    };
    const [title, sub] = titles[currentStatus] || titles.all;
    document.getElementById('emptyTitle').textContent = title;
    document.getElementById('emptySub').textContent   = sub;
}

// ── Cache max_foir from profile for FOIR bar colouring ───────────
async function cacheFoirLimit(session) {
    try {
        const res  = await fetch(`${API}/api/nbfc/dashboard/profile/${session.nbfc_id}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.max_foir_percent) {
            localStorage.setItem('nbfc_max_foir', data.max_foir_percent);
        }
    } catch (e) { /* silent */ }
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
    ['nbfc_token', 'nbfc_id', 'nbfc_name', 'nbfc_email', 'nbfc_max_foir']
        .forEach(k => localStorage.removeItem(k));
    window.location.href = '/nbfc/register';
}

// Cache FOIR limit in background after load
window.addEventListener('DOMContentLoaded', () => {
    const session = getSession();
    if (session) cacheFoirLimit(session);
});
// ═══════════════════════════════════════════════════════════════
//  nbfc-applications.js  —  LendOS NBFC Loan Applications Page
// ═══════════════════════════════════════════════════════════════

const API = window.API_BASE || window.location.origin;

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
        clearBulkSelection();

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
            <td class="row-check-cell">
                ${loan.status === 'applied'
                    ? `<input type="checkbox" class="row-checkbox" data-id="${loan.id}"
                        ${bulkSelectedIds.has(loan.id) ? 'checked' : ''}
                        onchange="toggleRowCheck(${loan.id}, this.checked)">`
                    : ''}
            </td>
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
            <td><div class="skeleton-line" style="width:16px;height:16px;"></div></td>
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
            <td colspan="10" style="text-align:center;padding:48px 16px;color:var(--text-muted);font-size:13px;">
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
// ═══════════════════════════════════════════════════════════════
//  Bulk Review — selection + modal flow
//  Only applications with status "applied" (borrower has signed the
//  agreement, awaiting NBFC decision) are bulk-selectable.
// ═══════════════════════════════════════════════════════════════

let bulkSelectedIds = new Set();   // ids currently ticked in the table
let bulkQueue       = [];          // loan objects being reviewed in the modal
let bulkDecisions   = {};          // id -> { status: 'approved'|'rejected', reason?: string }
let bulkDetailCache = {};          // id -> full detail object from /detail/{id}
let bulkIndex       = 0;
let bulkPendingAction = null;      // { status } while confirm popup is open

// ── Helpers matching nbfc-application-detail.js, so bulk cards look
//    exactly like the single-application review page ──────────────
function bulkEmploymentLabel(raw) {
    const map = {
        salaried:                     'Salaried',
        'self_employed_business':     'Self Employed — Business',
        'self_employed_professional': 'Self Employed — Professional',
    };
    return map[raw] || (raw || '—');
}

function bulkKycBadge(status) {
    const map = {
        verified:  ['#0e8c6a', '#f0fdf9', '✓ Verified'],
        submitted: ['#d97706', '#fffbeb', '⏳ Submitted'],
        pending:   ['#94a3b8', '#f8fafc', '○ Pending'],
    };
    const [color, bg, label] = map[status] || ['#94a3b8', '#f8fafc', status || '—'];
    return `<span style="background:${bg};color:${color};border:1px solid ${color}33;
        border-radius:99px;padding:2px 10px;font-size:11.5px;font-weight:600;">${label}</span>`;
}

function bulkScoreGradeInfo(score) {
    if (!score) return { grade: '—', action: '—', cls: '' };
    if (score >= 750) return { grade: 'Excellent',  action: 'High approval chance',     cls: 'excellent' };
    if (score >= 650) return { grade: 'Good',        action: 'Likely to be approved',    cls: 'good' };
    if (score >= 550) return { grade: 'Fair',        action: 'Conditional approval',     cls: 'fair' };
    if (score >= 450) return { grade: 'Poor',        action: 'Low approval chance',      cls: 'poor' };
    return               { grade: 'Very Poor',  action: 'Auto-reject recommended', cls: 'poor' };
}
let bulkAllDecidedViaQuickAction = false;

function fmtINRPlain(n) {
    if (!n && n !== 0) return '—';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

// ── Row selection ───────────────────────────────────────────────
function toggleRowCheck(id, checked) {
    if (checked) bulkSelectedIds.add(id);
    else bulkSelectedIds.delete(id);
    updateBulkTriggerButton();
}

function toggleSelectAll(checkbox) {
    const boxes = document.querySelectorAll('.row-checkbox');
    boxes.forEach(b => {
        b.checked = checkbox.checked;
        const id = parseInt(b.dataset.id);
        if (checkbox.checked) bulkSelectedIds.add(id);
        else bulkSelectedIds.delete(id);
    });
    updateBulkTriggerButton();
}

function clearBulkSelection() {
    bulkSelectedIds = new Set();
    const selectAll = document.getElementById('selectAllCheckbox');
    if (selectAll) selectAll.checked = false;
    updateBulkTriggerButton();
}

function updateBulkTriggerButton() {
    const btn = document.getElementById('bulkReviewBtn');
    const label = document.getElementById('bulkReviewCount');
    if (!btn) return;
    const n = bulkSelectedIds.size;
    if (n > 0) {
        btn.style.display = 'flex';
        label.textContent = `Review Selected (${n})`;
    } else {
        btn.style.display = 'none';
    }
}

// ── Open / close modal ──────────────────────────────────────────
async function openBulkReview() {
    bulkQueue = allLoans.filter(l => bulkSelectedIds.has(l.id));
    if (bulkQueue.length === 0) return;
    bulkDecisions = {};
    bulkDetailCache = {};
    bulkIndex = 0;
    document.getElementById('bulkModalTitle').textContent =
        `Bulk Review — ${bulkQueue.length} Application${bulkQueue.length !== 1 ? 's' : ''}`;
    bulkAllDecidedViaQuickAction = false;
    renderBulkTabStrip();

    document.getElementById('bulkModalBody').innerHTML = `
        <div class="bulk-loading-state">
            <i class="ti ti-loader-2"></i>
            Loading applicant details…
        </div>`;
    document.getElementById('bulkModalOverlay').style.display = 'flex';

    const session = getSession();
    if (!session) return;

    // Fetch full detail (KYC, bank summary, loan terms, affordability) for
    // every selected applicant in parallel — the table's list API only has
    // summary fields, this modal needs the same data as the detail page.
    await Promise.all(bulkQueue.map(async loan => {
        try {
            const res = await fetch(
                `${API}/api/nbfc/dashboard/loans/${session.nbfc_id}/detail/${loan.id}`,
                { headers: { 'Authorization': `Bearer ${session.access_token}` } }
            );
            bulkDetailCache[loan.id] = res.ok ? await res.json() : null;
        } catch (e) {
            bulkDetailCache[loan.id] = null;
        }
    }));

    renderBulkApplicant();
}

function closeBulkReview() {
    document.getElementById('bulkModalOverlay').style.display = 'none';
}

// ── Tab strip ────────────────────────────────────────────────────
function renderBulkTabStrip() {
    const strip = document.getElementById('bulkTabStrip');
    strip.innerHTML = bulkQueue.map((loan, i) => {
        const decision = bulkDecisions[loan.id];
        const dotClass = decision ? decision.status : '';
        return `
            <div class="bulk-tab-item ${i === bulkIndex ? 'active' : ''}" onclick="bulkGoTo(${i})">
                <div class="bulk-tab-avatar">${initials(loan.borrower_name)}</div>
                <span>${(loan.borrower_name || 'Borrower').split(' ')[0]}</span>
                <div class="bulk-tab-dot ${dotClass}"></div>
            </div>`;
    }).join('');
}

function bulkGoTo(i) {
    bulkIndex = i;
    renderBulkTabStrip();
    renderBulkApplicant();
}
function bulkGoNext() { if (bulkIndex < bulkQueue.length - 1) bulkGoTo(bulkIndex + 1); }
function bulkGoPrev() { if (bulkIndex > 0) bulkGoTo(bulkIndex - 1); }

// ── Render current applicant (mirrors nbfc-application-detail.js) ──
function renderBulkApplicant() {
    const loan = bulkQueue[bulkIndex];
    const body = document.getElementById('bulkModalBody');
    const decision = bulkDecisions[loan.id];
    const d = bulkDetailCache[loan.id];

    if (!d) {
        body.innerHTML = `
            <div class="bulk-loading-state" style="color:var(--error);">
                <i class="ti ti-alert-triangle" style="animation:none;"></i>
                Could not load full details for this applicant. Basic info only.
            </div>
            <div id="bulkDecisionArea">${renderDecisionArea(loan, decision)}</div>`;
        updateBulkNav();
        updateBulkFooterTally();
        return;
    }

    const initials = (d.full_name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
    const scoreInfo = bulkScoreGradeInfo(d.credit_score);

    let bankData = {};
    try { bankData = typeof d.bank_data === 'string' ? JSON.parse(d.bank_data) : (d.bank_data || {}); }
    catch (e) { bankData = {}; }

    const foirLimit = parseFloat(localStorage.getItem('nbfc_max_foir') || '50');
    const foir      = d.foir_at_application;
    const barWidth  = foir ? Math.min(foir, 100) : 0;
    let barColor = '#cbd5e1', verdictCls = '', verdictHtml = 'FOIR data not available for this application.';
    if (foir) {
        if (foir <= foirLimit) {
            barColor = '#10b981'; verdictCls = 'safe';
            verdictHtml = `<i class="ti ti-circle-check"></i> FOIR ${foir.toFixed(1)}% is within safe limit of ${foirLimit}%`;
        } else if (foir <= foirLimit + 10) {
            barColor = '#f59e0b'; verdictCls = 'warn';
            verdictHtml = `<i class="ti ti-alert-triangle"></i> FOIR ${foir.toFixed(1)}% slightly exceeds limit of ${foirLimit}%`;
        } else {
            barColor = '#ef4444'; verdictCls = 'danger';
            verdictHtml = `<i class="ti ti-x"></i> FOIR ${foir.toFixed(1)}% exceeds safe limit of ${foirLimit}%`;
        }
    }
    const bounceCount = bankData?.bounce_count ?? '—';

    body.innerHTML = `
        <!-- Borrower Information -->
        <div class="detail-card">
            <div class="detail-card-title"><i class="ti ti-user"></i> Borrower Information</div>
            <div class="borrower-header">
                <div class="borrower-avatar">${initials}</div>
                <div>
                    <div class="borrower-name">${d.full_name || '—'}</div>
                    <div class="borrower-meta-row">
                        <span><i class="ti ti-phone"></i> ${d.mobile || '—'}</span>
                        <span><i class="ti ti-mail"></i> ${d.email || '—'}</span>
                    </div>
                </div>
            </div>
            <div class="info-grid">
                <div class="info-item"><div class="info-label">PAN Number</div><div class="info-val mono">${d.pan_number || '—'}</div></div>
                <div class="info-item"><div class="info-label">Aadhaar</div><div class="info-val mono">${d.aadhaar_number ? 'XXXX-XXXX-' + String(d.aadhaar_number).slice(-4) : '—'}</div></div>
                <div class="info-item"><div class="info-label">Date of Birth</div><div class="info-val">${d.date_of_birth || '—'}</div></div>
                <div class="info-item"><div class="info-label">Gender</div><div class="info-val">${d.gender || '—'}</div></div>
                <div class="info-item"><div class="info-label">Employment Type</div><div class="info-val">${bulkEmploymentLabel(d.employment_type)}</div></div>
                <div class="info-item"><div class="info-label">KYC Status</div><div class="info-val">${bulkKycBadge(d.kyc_status)}</div></div>
            </div>
            <div class="info-item" style="margin-top:10px;">
                <div class="info-label">Address</div>
                <div class="info-val" style="font-size:13px;line-height:1.5;">${d.address || '—'}</div>
            </div>
        </div>

        <!-- Credit Score -->
        <div class="detail-card">
            <div class="detail-card-title"><i class="ti ti-chart-pie"></i> Credit Score</div>
            <div class="score-hero-row">
                <div class="score-circle ${scoreInfo.cls}">
                    <div class="score-num">${d.credit_score || '—'}</div>
                    <div class="score-max">/ 900</div>
                </div>
                <div class="score-grade-wrap">
                    <div class="score-grade">${scoreInfo.grade}</div>
                    <div class="score-action">${scoreInfo.action}</div>
                </div>
            </div>
        </div>

        <!-- Bank Statement Summary -->
        <div class="detail-card">
            <div class="detail-card-title"><i class="ti ti-building-bank"></i> Bank Statement Summary</div>
            <div class="bank-rows">
                <div class="bank-row"><span class="bank-label">Monthly Income</span><span class="bank-val">${fmtINRPlain(d.monthly_income)}</span></div>
                <div class="bank-row"><span class="bank-label">Existing EMI Obligations</span><span class="bank-val">${fmtINRPlain(d.existing_emis)}</span></div>
                <div class="bank-row"><span class="bank-label">Avg Monthly Balance</span><span class="bank-val">${bankData?.avg_closing_balance ? fmtINRPlain(bankData.avg_closing_balance) : '—'}</span></div>
                <div class="bank-row"><span class="bank-label">Total Credits (3 mo)</span><span class="bank-val">${bankData?.total_credits ? fmtINRPlain(bankData.total_credits) : '—'}</span></div>
                <div class="bank-row"><span class="bank-label">Total Debits (3 mo)</span><span class="bank-val">${bankData?.total_debits ? fmtINRPlain(bankData.total_debits) : '—'}</span></div>
                <div class="bank-row">
                    <span class="bank-label bounce-label"><i class="ti ti-alert-triangle" style="color:#ef4444;font-size:13px;"></i> Bounce Count</span>
                    <span class="bank-val" style="${bounceCount > 0 ? 'color:#ef4444;font-weight:700;' : ''}">${bounceCount}</span>
                </div>
                <div class="bank-row"><span class="bank-label">FOIR at Application</span><span class="bank-val">${foir ? foir.toFixed(1) + '%' : '—'}</span></div>
            </div>
        </div>

        <!-- Loan Details -->
        <div class="detail-card">
            <div class="detail-card-title"><i class="ti ti-file-invoice"></i> Loan Details</div>
            <div class="loan-amount-hero">
                <div class="loan-amount-label">Requested Amount</div>
                <div class="loan-amount-val">${fmtINRPlain(d.amount)}</div>
            </div>
            <div class="loan-rows">
                <div class="loan-row"><span class="loan-label">Tenure</span><span class="loan-val">${d.tenure_months} months</span></div>
                <div class="loan-row"><span class="loan-label">Interest Rate</span><span class="loan-val">${d.interest_rate}% p.a.</span></div>
                <div class="loan-row"><span class="loan-label">Monthly EMI</span><span class="loan-val green">${fmtINRPlain(d.emi_amount)}/mo</span></div>
                <div class="loan-divider"></div>
                <div class="loan-row"><span class="loan-label">Total Interest</span><span class="loan-val">${fmtINRPlain(d.total_interest)}</span></div>
                <div class="loan-row"><span class="loan-label">Total Payable</span><span class="loan-val strong">${fmtINRPlain(d.total_payable)}</span></div>
                <div class="loan-divider"></div>
                <div class="loan-row"><span class="loan-label">Processing Fee</span><span class="loan-val">${fmtINRPlain(d.processing_fee_amount)}</span></div>
                <div class="loan-row"><span class="loan-label">Purpose</span><span class="loan-val">${purposeLabel(d.purpose)}</span></div>
                <div class="loan-row"><span class="loan-label">Applied On</span><span class="loan-val">${fmtDate(d.applied_at)}</span></div>
            </div>
        </div>

        <!-- Affordability Check -->
        <div class="detail-card">
            <div class="detail-card-title"><i class="ti ti-shield-check"></i> Affordability Check</div>
            <div class="afford-rows">
                <div class="afford-row"><span class="afford-label">Monthly Income</span><span class="afford-val">${fmtINRPlain(d.monthly_income)}</span></div>
                <div class="afford-row"><span class="afford-label">Existing EMI Obligations</span><span class="afford-val">${fmtINRPlain(d.existing_emis)}</span></div>
                <div class="afford-row"><span class="afford-label">NBFC FOIR Limit</span><span class="afford-val">${foirLimit}%</span></div>
                <div class="afford-row"><span class="afford-label">FOIR Used</span><span class="afford-val">${foir ? foir.toFixed(1) + '%' : '—'}</span></div>
            </div>
            <div class="afford-bar-wrap">
                <div class="afford-bar-track">
                    <div class="afford-bar-fill" style="width:${barWidth}%;background:${barColor};"></div>
                    <div class="afford-bar-marker" style="left:${Math.min(foirLimit, 100)}%;"></div>
                </div>
                <div class="afford-bar-labels"><span>0%</span><span>Limit ${foirLimit}%</span><span>100%</span></div>
            </div>
            <div class="afford-verdict ${verdictCls}">${verdictHtml}</div>
        </div>

        <div id="bulkDecisionArea">${renderDecisionArea(loan, decision)}</div>
    `;

    updateBulkNav();
    updateBulkFooterTally();
}

function renderDecisionArea(loan, decision) {
    if (decision && decision.status === 'saving') {
        return `
            <div class="bulk-decided-banner" style="background:var(--surface);color:var(--text-secondary);">
                <span><i class="ti ti-loader-2" style="animation:spin 0.7s linear infinite;"></i> Submitting…</span>
            </div>`;
    }
    if (decision && decision.status === 'error') {
        return `
            <div class="bulk-decided-banner rejected">
                <span><i class="ti ti-alert-triangle"></i> Failed — ${decision.reason}</span>
                <button onclick="retryDecision(${loan.id})">Retry</button>
            </div>`;
    }
    if (decision && decision.status === 'approved') {
        return `
            <div class="bulk-decided-banner approved">
                <span><i class="ti ti-circle-check"></i> Approved</span>
            </div>`;
    }
    if (decision && decision.status === 'rejected') {
        return `
            <div class="bulk-decided-banner rejected">
                <span><i class="ti ti-x-circle"></i> Rejected — "${decision.reason}"</span>
            </div>`;
    }
    return `
        <div class="bulk-decision-box">
            <div class="bulk-decision-prompt">This application has been signed by the borrower and is awaiting your decision.</div>
            <div class="bulk-decision-btns">
                <button class="bulk-decide-btn approve" onclick="decideCurrent('approved')">
                    <i class="ti ti-check"></i> Approve This
                </button>
                <button class="bulk-decide-btn reject" onclick="showRejectPanel()">
                    <i class="ti ti-x"></i> Reject This
                </button>
            </div>
            <div id="bulkRejectPanel"></div>
        </div>`;
}

function retryDecision(id) {
    const loan = bulkQueue.find(l => l.id === id);
    if (!loan) return;
    delete bulkDecisions[id];
    renderBulkTabStrip();
    renderBulkApplicant();
}

function showRejectPanel() {
    const panel = document.getElementById('bulkRejectPanel');
    panel.innerHTML = `
        <div class="bulk-reject-panel">
            <textarea class="bulk-reject-textarea" id="bulkRejectReason"
                placeholder="Reason for rejection (shown to the borrower)…"></textarea>
            <div class="bulk-reject-quick">
                <button onclick="setBulkReason('Credit score below minimum requirement')">Low credit score</button>
                <button onclick="setBulkReason('FOIR exceeds acceptable limit')">High FOIR</button>
                <button onclick="setBulkReason('Incomplete or inconsistent documentation')">Doc issues</button>
                <button onclick="setBulkReason('Income does not meet eligibility criteria')">Income too low</button>
            </div>
            <div class="bulk-reject-panel-btns">
                <button class="bulk-reject-confirm" onclick="decideCurrent('rejected')">Confirm Reject</button>
                <button onclick="renderBulkApplicant()">Cancel</button>
            </div>
        </div>`;
    document.getElementById('bulkRejectReason').focus();
}

function setBulkReason(text) {
    const ta = document.getElementById('bulkRejectReason');
    if (ta) { ta.value = text; ta.focus(); }
}

async function decideCurrent(status) {
    const loan = bulkQueue[bulkIndex];
    let reason = '';
    if (status === 'rejected') {
        reason = (document.getElementById('bulkRejectReason')?.value || '').trim();
        if (!reason) {
            const ta = document.getElementById('bulkRejectReason');
            if (ta) { ta.style.borderColor = 'var(--error)'; ta.focus(); }
            return;
        }
    }
    await commitDecision(loan, status, reason);
    renderBulkTabStrip();
    renderBulkApplicant();
    updateBulkFooterTally();

    const session = getSession();
    await Promise.all([
        loadStatusCounts(session),
        loadApplications(session, currentStatus, currentPage),
    ]);

    // Auto-advance to next undecided applicant (single-decision flow only)
    setTimeout(() => {
        const nextUndecided = bulkQueue.findIndex((l, i) => i > bulkIndex && !bulkDecisions[l.id]);
        if (nextUndecided !== -1) bulkGoTo(nextUndecided);
        else if (bulkIndex < bulkQueue.length - 1) bulkGoTo(bulkIndex + 1);
    }, 250);
}

// Bare API call + local state update — no navigation, no re-render.
// Shared by the single "Approve/Reject This" click and the bulk
// "Approve/Reject All Remaining" shortcut, so bulk processing doesn't
// fight with per-click auto-advance.
async function commitDecision(loan, status, reason) {
    const session = getSession();
    if (!session) return;

    bulkDecisions[loan.id] = { status: 'saving' };

    try {
        const res = status === 'approved'
            ? await fetch(`${API}/api/nbfc/dashboard/loans/${loan.id}/approve`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ notes: null })
            })
            : await fetch(`${API}/api/nbfc/dashboard/loans/${loan.id}/reject`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ rejection_reason: reason })
            });

        if (res.ok) {
            bulkDecisions[loan.id] = { status, reason };
            showBulkToast(
                `${status === 'approved' ? '✓ Approved' : '✓ Rejected'} — ${loan.borrower_name || 'Loan #' + loan.id}`,
                'success'
            );
        } else {
            const err = await res.json().catch(() => ({}));
            bulkDecisions[loan.id] = { status: 'error', reason: err.detail || `HTTP ${res.status}` };
            showBulkToast(`✗ Could not ${status === 'approved' ? 'approve' : 'reject'} ${loan.borrower_name || 'loan'}: ${err.detail || 'Unknown error'}`, 'error');
        }
    } catch (e) {
        bulkDecisions[loan.id] = { status: 'error', reason: 'Network error — request never reached the server.' };
        showBulkToast(`✗ Network error deciding ${loan.borrower_name || 'loan'}.`, 'error');
    }
}

function retryDecision(id) {
    delete bulkDecisions[id];
    renderBulkTabStrip();
    renderBulkApplicant();
}

function updateBulkNav() {
    document.getElementById('bulkPrevBtn').disabled = bulkIndex === 0;
    document.getElementById('bulkNextBtn').disabled = bulkIndex === bulkQueue.length - 1;
    document.getElementById('bulkCounter').textContent = `${bulkIndex + 1} / ${bulkQueue.length}`;
}

function updateBulkFooterTally() {
    const decided = Object.values(bulkDecisions);
    const approved = decided.filter(d => d.status === 'approved').length;
    const rejected = decided.filter(d => d.status === 'rejected').length;
    const pending  = bulkQueue.length - decided.length;

    document.getElementById('bulkTally').textContent =
        `${approved} approved · ${rejected} rejected · ${pending} pending`;

    const pct = Math.round((decided.length / bulkQueue.length) * 100);
    document.getElementById('bulkProgressFill').style.width = pct + '%';

    const submitBtn = document.getElementById('bulkSubmitBtn');
    const allDecided = pending === 0;
    const canSubmit  = bulkAllDecidedViaQuickAction || allDecided;
    if (canSubmit) {
        submitBtn.disabled = false;
        submitBtn.textContent = `Submit Decisions (${bulkQueue.length})`;
    } else {
        submitBtn.disabled = true;
        submitBtn.textContent = `Decide all applications to continue (${pending} left)`;
    }

    // ADD at the end of updateBulkFooterTally() after the submitBtn logic
    if (pending === 0 && bulkAllDecidedViaQuickAction) {
        // Auto-submit after a short delay so NBFC sees the tally update
        setTimeout(() => {
            const btn = document.getElementById('bulkSubmitBtn');
            if (btn && !btn.disabled) btn.click();
        }, 800);
    }
    }

// ── "Approve/Reject All Remaining" — needs confirm popup first ──
function confirmBulkApplyAll(status) {
    const remaining = bulkQueue.filter(l => !bulkDecisions[l.id]);
    if (remaining.length === 0) return;

    bulkPendingAction = { status };
    const verb = status === 'approved' ? 'approve' : 'reject';
    document.getElementById('bulkConfirmIcon').innerHTML =
        status === 'approved' ? '<i class="ti ti-checks"></i>' : '<i class="ti ti-ban"></i>';
    document.getElementById('bulkConfirmTitle').textContent =
        `${status === 'approved' ? 'Approve' : 'Reject'} all remaining applications?`;
    document.getElementById('bulkConfirmSub').textContent =
        `This will ${verb} ${remaining.length} undecided application${remaining.length !== 1 ? 's' : ''} still awaiting a decision. You can still review each one before final submission.`;

    const okBtn = document.getElementById('bulkConfirmOkBtn');
    okBtn.onclick = () => applyBulkToRemaining(status);
    document.getElementById('bulkConfirmOverlay').style.display = 'flex';
}

function applyBulkToRemaining(status) {
    const reason = status === 'rejected' ? 'Did not meet this NBFC\'s lending criteria' : '';
    bulkQueue.forEach(l => {
        if (!bulkDecisions[l.id]) bulkDecisions[l.id] = { status, reason };
    });
    bulkAllDecidedViaQuickAction = true;  // ← ADD THIS
    closeBulkConfirm();
    renderBulkTabStrip();
    renderBulkApplicant();
}

function closeBulkConfirm() {
    bulkPendingAction = null;
    document.getElementById('bulkConfirmOverlay').style.display = 'none';
}

// ── Submit all decisions ──────────────────────────────────────────
async function submitBulkDecisions() {
    const session = getSession();
    if (!session) return;

    const submitBtn = document.getElementById('bulkSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 0.7s linear infinite;"></i> Submitting…';

    const calls = bulkQueue.map(loan => {
        const decision = bulkDecisions[loan.id];
        const request = decision.status === 'approved'
            ? fetch(`${API}/api/nbfc/dashboard/loans/${loan.id}/approve`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ notes: null })
            })
            : fetch(`${API}/api/nbfc/dashboard/loans/${loan.id}/reject`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ rejection_reason: decision.reason })
            });

        // fetch() only rejects on a real network failure — a 400/500
        // response still resolves "successfully" as far as Promise.all is
        // concerned. Check res.ok explicitly so a loan that fails server-side
        // (e.g. its status changed since selection) is actually reported,
        // instead of silently counted as submitted.
        return request
            .then(async res => ({
                loanId: loan.id,
                borrowerName: loan.borrower_name,
                ok: res.ok,
                error: res.ok ? null : (await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`,
            }))
            .catch(err => ({
                loanId: loan.id,
                borrowerName: loan.borrower_name,
                ok: false,
                error: 'Network error — request never reached the server.',
            }));
    });

    const results = await Promise.all(calls);
    const succeeded = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);

    if (failed.length === 0) {
        closeBulkReview();
        clearBulkSelection();
        showBulkToast(`✓ ${succeeded.length} decisions submitted successfully.`, 'success');
    } else {
        // Keep the modal open with decisions intact so nothing needs
        // re-deciding — remove only the ones that actually succeeded from
        // the queue, and let the NBFC retry the rest.
        const failedIds = new Set(failed.map(f => f.loanId));
        bulkQueue = bulkQueue.filter(l => failedIds.has(l.id));
        bulkIndex = 0;
        renderBulkTabStrip();
        renderBulkApplicant();
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Retry failed submissions';

        const names = failed.map(f => `${f.borrowerName || 'Loan #' + f.loanId}: ${f.error}`).join('; ');
        if (succeeded.length === 0) {
            showBulkToast(`✗ All ${failed.length} submissions failed. ${names}`, 'error');
        } else {
            showBulkToast(`⚠ ${succeeded.length} submitted, ${failed.length} failed — ${names}`, 'error');
        }
    }

    await Promise.all([
        loadStatusCounts(session),
        loadApplications(session, currentStatus, currentPage),
    ]);
}

function showBulkToast(msg, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="ti ${type === 'success' ? 'ti-check' : 'ti-alert-triangle'}"></i> ${msg}`;
    toast.style.position = 'fixed';
    toast.style.bottom = '24px';
    toast.style.right = '24px';
    toast.style.padding = '12px 18px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = '500';
    toast.style.zIndex = '2000';
    toast.style.color = '#fff';
    toast.style.background = type === 'success' ? '#0e8c6a' : '#dc2626';
    toast.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
}
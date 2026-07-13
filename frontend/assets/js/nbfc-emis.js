
const API = window.API_BASE || 'http://localhost:8000';
let currentTab    = 'all';
let allEmis       = [];
let searchQuery   = '';
let pendingEmiId  = null;
let currentMonth  = new Date();

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

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent   = msg;
    t.className     = `toast ${type}`;
    t.style.display = 'flex';
    setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// ── On load ───────────────────────────────────────────────────
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
    const name = session.nbfc_name || 'NBFC';
    document.getElementById('topNbfcName').textContent     = name;
    document.getElementById('companyAvatar').textContent   = name.charAt(0).toUpperCase();
    document.getElementById('sidebarAvatar').textContent   = name.charAt(0).toUpperCase();
    document.getElementById('sidebarNbfcName').textContent = name;

    if (localStorage.getItem('nbfc_sidebar_collapsed') === '1' && window.innerWidth > 768) {
        document.getElementById('sidebar')?.classList.add('collapsed');
    }

    updateMonthLabel();
    await loadEmis(session);
});

// ── Month navigation ──────────────────────────────────────────
function updateMonthLabel() {
    const label = currentMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    document.getElementById('monthLabel').textContent = label;
    const stripMonth = document.getElementById('interestStripMonth');
    if (stripMonth) stripMonth.textContent = `Profit breakdown — ${label}`;
}

function prevMonth() {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    updateMonthLabel();
    loadEmis(getSession());
}

//function nextMonth() {
//    const now = new Date();
//    if (currentMonth >= new Date(now.getFullYear(), now.getMonth(), 1)) return;
//    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
//    updateMonthLabel();
//    loadEmis(getSession());
//}

function nextMonth() {
    const maxMonth = new Date();
    maxMonth.setMonth(maxMonth.getMonth() + 12);
    if (currentMonth >= new Date(maxMonth.getFullYear(), maxMonth.getMonth(), 1)) return;
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    updateMonthLabel();
    loadEmis(getSession());
}

// ── Load EMIs ─────────────────────────────────────────────────
async function loadEmis(session) {
    if (!session) return;
    showSkeleton();

    const year  = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;

// AFTER
try {
    const year  = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    const res = await fetch(
        `${API}/api/nbfc/dashboard/emis/${session.nbfc_id}?year=${year}&month=${month}`,
        { headers: { 'Authorization': `Bearer ${session.access_token}` } }
    );

    if (!res.ok) throw new Error();
        const data = await res.json();
        allEmis = data.emis || [];

        updateStats(data);
        renderTable(allEmis, currentTab);

    } catch (e) {
        // Show no EMI data state (expected when no active loans yet)
        allEmis = [];
        updateStats({ total_due: 0, collected: 0, pending_count: 0, overdue_count: 0, interest_earned: 0 });
        renderTable([], currentTab);
    }
}

// ── Update stats ──────────────────────────────────────────────
function updateStats(data) {
    const totalDue   = data.total_due   || 0;
    const collected  = data.collected   || 0;
    const pct        = totalDue > 0 ? Math.round((collected / totalDue) * 100) : 0;

    // Interest and profit from paid EMIs
    const paidEmis      = allEmis.filter(e => e.status === 'paid');
    const totalInterest = paidEmis.reduce((s, e) => s + (parseFloat(e.interest_component) || 0), 0);
    const procFee   = data.processing_fee_total || 0;
    const netProfit = totalInterest + procFee;

    document.getElementById('emi-stat-due').textContent           = fmtINR(totalDue);
    document.getElementById('emi-stat-collected').textContent     = fmtINR(collected);
    document.getElementById('emi-stat-pending-count').textContent = data.pending_count  ?? '—';
    document.getElementById('emi-stat-overdue').textContent       = data.overdue_count  ?? '—';
    document.getElementById('emi-stat-interest').textContent      = fmtINR(totalInterest);
    document.getElementById('emi-stat-profit').textContent        = fmtINR(totalInterest);

    // Interest strip — show only when there's interest earned
    const strip = document.getElementById('interestStrip');
    if (strip) {
        if (totalInterest > 0) {
            strip.style.display = 'flex';
            document.getElementById('stripInterest').textContent  = fmtINR(totalInterest);
document.getElementById('stripPrincipal').textContent = fmtINR(procFee);
document.getElementById('stripTotal').textContent     = fmtINR(netProfit);
document.getElementById('emi-stat-profit').textContent = fmtINR(netProfit);
        } else {
            strip.style.display = 'none';
        }
    }

    // Sidebar badge
    const badge = document.getElementById('badge-emis');
    if (badge && data.overdue_count > 0) badge.textContent = data.overdue_count;

    // Progress card
    if (totalDue > 0) {
        document.getElementById('progressCard').style.display = 'block';
        document.getElementById('cpPct').textContent          = pct + '%';
        document.getElementById('cpFill').style.width         = pct + '%';
        document.getElementById('cpFill').style.background    = pct >= 80 ? 'var(--success)' : pct >= 50 ? '#f59e0b' : '#ef4444';
        document.getElementById('cpCollected').textContent    = `${fmtINR(collected)} collected`;
        document.getElementById('cpTotal').textContent        = `of ${fmtINR(totalDue)} due`;
    }
}

// ── Render table ──────────────────────────────────────────────
function handleSearch(val) {
    searchQuery = val.trim().toLowerCase();
    renderTable(allEmis, currentTab);
}

function renderTable(emis, tab) {
    const tbody = document.getElementById('emisBody');
    const empty = document.getElementById('emptyState');

    let filtered = tab === 'all' ? emis : emis.filter(e => e.status === tab);
    if (searchQuery) {
        filtered = filtered.filter(e =>
            (e.borrower_name || '').toLowerCase().includes(searchQuery) ||
            (e.borrower_mobile || '').includes(searchQuery)
        );
    }

    if (!filtered.length) {
        tbody.innerHTML = '';
        empty.style.display = 'flex';
        const titles = {
            all:     ['No EMIs this month', 'EMI data will appear here once loans are disbursed.'],
            pending: ['No pending EMIs',    'All pending EMIs have been collected.'],
            paid:    ['No paid EMIs yet',   'Paid EMIs will appear here.'],
            overdue: ['No overdue EMIs',    'Great! No overdue payments this month.'],
        };
        const [t, s] = titles[tab] || titles.all;
        document.getElementById('emptyTitle').textContent = t;
        document.getElementById('emptySub').textContent   = s;
        return;
    }

    empty.style.display = 'none';

    tbody.innerHTML = filtered.map(e => `
        <tr>
            <td>
                <div class="borrower-cell">
                    <div class="emi-avatar">${(e.borrower_name || '?').charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="borrower-name">${e.borrower_name || '—'}</div>
                        <div class="borrower-email">${e.borrower_mobile || ''}</div>
                    </div>
                </div>
            </td>
            <td style="font-family:var(--font-mono);font-weight:600;">${fmtINR(e.loan_amount)}</td>
            <td style="font-family:var(--font-mono);font-weight:700;color:var(--teal-600);">${fmtINR(e.amount)}</td>
            <td>
                <div class="int-cell">
                    <span class="int-main">${e.interest_component ? fmtINR(e.interest_component) : '—'}</span>
                    ${e.interest_rate ? `<span class="int-sub">${e.interest_rate}% p.a.</span>` : ''}
                </div>
            </td>
            <td style="font-family:var(--font-mono);font-size:12.5px;color:var(--text-secondary);font-weight:600">${e.principal_component ? fmtINR(e.principal_component) : '—'}</td>
            <td>
                <div style="font-size:13px;">${fmtDate(e.due_date)}</div>
                ${daysOverdueHtml(e)}
            </td>
<td>
                ${emiStatusBadge(e.status)}
                ${e.status === 'payment_claimed' && e.payment_reference
                    ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;font-family:var(--font-mono);">Ref: ${e.payment_reference}</div>`
                    : ''}
            </td>
            <td>
                ${e.late_fee_amount > 0
                    ? `<span class="late-fee-badge"><i class="ti ti-alert-circle"></i> +${fmtINR(e.late_fee_amount)}</span>`
                    : `<span class="late-fee-none">—</span>`}
            </td>
            <td>
                ${e.status === 'pending' || e.status === 'overdue'
                   ? `<button class="mark-paid-btn" onclick="openPaidModal(${e.id}, '${e.borrower_name}', ${e.amount})">
                        <i class="ti ti-circle-check"></i> Mark Paid
                       </button>`
                    : e.status === 'payment_claimed'
                    ? `<div style="display:flex;gap:6px;">
                       <button class="mark-paid-btn" onclick="openPaidModal(${e.id}, '${e.borrower_name}', ${e.claimed_amount || e.amount})">
                            <i class="ti ti-circle-check"></i> Confirm
                        </button>
                        <button class="dispute-btn" onclick="openDisputeModal(${e.id}, '${e.borrower_name}')">
                            <i class="ti ti-x"></i> Dispute
                        </button>
                       </div>`
                    : e.status === 'paid'
                    ? `<span style="font-size:12px;color:var(--success);"><i class="ti ti-check"></i> Paid ${fmtDate(e.paid_at)}</span>`
                    : '—'
                }
            </td>
        </tr>
    `).join('');
}

function isOverdue(emi) {
    return emi.status === 'pending' && new Date(emi.due_date) < new Date();
}
function daysOverdueHtml(emi) {
    if (emi.status !== 'pending' && emi.status !== 'overdue') return '';
    const due = new Date(emi.due_date);
    const today = new Date();
    const diffDays = Math.floor((today - due) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return '';
    return `<div class="days-overdue"><i class="ti ti-clock-exclamation" style="font-size:11px;"></i> ${diffDays}d overdue</div>`;
}

function exportToCSV() {
    if (!allEmis.length) { showToast('No EMI data to export.', 'error'); return; }

    const headers = ['Borrower', 'Mobile', 'Loan Amount', 'EMI Amount', 'Late Fee', 'Due Date', 'Status', 'Paid Date', 'Payment Reference'];
    const rows = allEmis.map(e => [
        e.borrower_name || '',
        e.borrower_mobile || '',
        e.loan_amount || 0,
        e.amount || 0,
        e.late_fee_amount || 0,
        e.due_date ? fmtDate(e.due_date) : '',
        e.status || '',
        e.paid_at ? fmtDate(e.paid_at) : '',
        e.payment_reference || '',
    ]);

    const csv = [headers, ...rows]
        .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `emi-collections-${currentMonth.getFullYear()}-${currentMonth.getMonth()+1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported successfully!', 'success');
}
function emiStatusBadge(status) {
    const map = {
        pending: ['emi-badge-pending', 'Pending'],
        paid:    ['emi-badge-paid',    'Paid'],
        overdue: ['emi-badge-overdue', 'Overdue'],
        payment_claimed:  ['emi-badge-claimed', 'Claimed'],
    };
    const [cls, label] = map[status] || ['emi-badge-pending', status];
    return `<span class="emi-badge ${cls}">${label}</span>`;
}

// ── Tab switch ────────────────────────────────────────────────
function switchTab(tab, btn) {
    currentTab = tab;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderTable(allEmis, tab);
}

// ── Mark Paid Modal ───────────────────────────────────────────
function openPaidModal(emiId, borrowerName, emiAmount) {
    pendingEmiId = emiId;
    document.getElementById('paidModalName').textContent = borrowerName;
    document.getElementById('paidModalAmt').textContent  = fmtINR(emiAmount);
    document.getElementById('paidModalSub').textContent  = `EMI of ${fmtINR(emiAmount)} from ${borrowerName}`;
    document.getElementById('paidModal').classList.add('open');
}

function closePaidModal(event) {
    if (event && event.target !== document.getElementById('paidModal')) return;
    document.getElementById('paidModal').classList.remove('open');
    pendingEmiId = null;
}

async function confirmMarkPaid() {
    if (!pendingEmiId) return;
    const session = getSession();
    if (!session) return;

    const btn = document.getElementById('confirmPaidBtn');
    btn.disabled  = true;
    btn.innerHTML = '<i class="ti ti-loader-2"></i> Processing…';

    try {
const res = await fetch(`${API}/api/nbfc/dashboard/emis/${pendingEmiId}/confirm?nbfc_id=${session.nbfc_id}`, {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!res.ok) {
            const d = await res.json();
            showToast(d.detail || 'Failed to mark as paid.', 'error');
            btn.disabled  = false;
            btn.innerHTML = '<i class="ti ti-circle-check"></i> Confirm Payment';
            return;
        }

        document.getElementById('paidModal').classList.remove('open');
        showToast('✓ EMI marked as paid successfully!', 'success');
        pendingEmiId = null;

        // Reload
        await loadEmis(session);

    } catch (e) {
        showToast('Cannot connect to server.', 'error');
        btn.disabled  = false;
        btn.innerHTML = '<i class="ti ti-circle-check"></i> Confirm Payment';
    }
}

// ── Dispute Modal ─────────────────────────────────────────────
let disputeEmiId = null;

function openDisputeModal(emiId, borrowerName) {
    disputeEmiId = emiId;
    document.getElementById('disputeModalName').textContent = borrowerName;
    document.getElementById('disputeReasonInput').value = '';
    document.getElementById('disputeModal').classList.add('open');
}

function closeDisputeModal(event) {
    if (event && event.target !== document.getElementById('disputeModal')) return;
    document.getElementById('disputeModal').classList.remove('open');
    disputeEmiId = null;
}

async function confirmDispute() {
    const reason = document.getElementById('disputeReasonInput').value.trim();
    if (!reason) { showToast('Please enter a dispute reason.', 'error'); return; }
    if (!disputeEmiId) return;

    const session = getSession();
    const btn = document.getElementById('confirmDisputeBtn');
    btn.disabled  = true;
    btn.innerHTML = '<i class="ti ti-loader-2"></i> Submitting…';

    try {
const res = await fetch(
            `${API}/api/nbfc/dashboard/emis/${disputeEmiId}/dispute?nbfc_id=${session.nbfc_id}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ dispute_reason: reason }),
            }
        );

        if (!res.ok) {
            const d = await res.json();
            showToast(d.detail || 'Failed to submit dispute.', 'error');
            btn.disabled  = false;
            btn.innerHTML = '<i class="ti ti-x"></i> Submit Dispute';
            return;
        }

        document.getElementById('disputeModal').classList.remove('open');
        showToast('Payment disputed. Borrower will be notified.', 'success');
        disputeEmiId = null;
        await loadEmis(session);

    } catch (e) {
        showToast('Cannot connect to server.', 'error');
        btn.disabled  = false;
        btn.innerHTML = '<i class="ti ti-x"></i> Submit Dispute';
    }
}

// ── Skeleton ──────────────────────────────────────────────────
function showSkeleton() {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('emisBody').innerHTML = [1,2,3,4].map(() => `
        <tr>
            <td style="padding:14px 16px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(90deg,var(--border-light) 25%,#f0f4f6 50%,var(--border-light) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;flex-shrink:0;"></div>
                    <div style="flex:1;"><div class="skeleton-line w60" style="margin-bottom:5px;"></div><div class="skeleton-line" style="width:35%;height:9px;"></div></div>
                </div>
            </td>
            <td><div class="skeleton-line" style="width:70px;"></div></td>
            <td><div class="skeleton-line" style="width:65px;"></div></td>
            <td><div class="skeleton-line" style="width:52px;"></div></td>
            <td><div class="skeleton-line" style="width:52px;"></div></td>
            <td><div class="skeleton-line" style="width:80px;"></div></td>
    <td><div class="skeleton-line" style="width:65px;border-radius:99px;"></div></td>
            <td><div class="skeleton-line" style="width:50px;"></div></td>
            <td><div class="skeleton-line" style="width:80px;border-radius:6px;"></div></td>
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
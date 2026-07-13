// ═══════════════════════════════════════════════════════════════
//  nbfc-reports.js — LendOS NBFC Reports Page
// ═══════════════════════════════════════════════════════════════

const API = window.API_BASE || window.location.origin;

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
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000)   return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000)     return '₹' + (n / 1000).toFixed(1) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function authHeaders(session) {
    return { 'Authorization': `Bearer ${session.access_token}` };
}

let currentPeriod = 'month';
let allLoans = [];
let allEMIs  = [];

// ── Init ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    const session = getSession();
    if (!session) { window.location.href = '/nbfc/login'; return; }

    // Topbar
    const name = session.nbfc_name || 'NBFC';
    document.getElementById('topNbfcName').textContent  = name;
    document.getElementById('companyAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('sidebarNbfcName').textContent = name;
    document.getElementById('sidebarAvatar').textContent   = name.charAt(0).toUpperCase();

    await loadAllData(session);
});

// ── Period switch ─────────────────────────────────────────────
function switchPeriod(btn) {
    document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    renderAll();
}

// ── Load all data ─────────────────────────────────────────────
async function loadAllData(session) {
    try {
        const res  = await fetch(`${API}/api/nbfc/dashboard/reports/${session.nbfc_id}`, {
            headers: authHeaders(session)
        });
        const data = res.ok ? await res.json() : { loans: [], emis: [] };

        allLoans = data.loans || [];
        allEMIs  = data.emis  || [];

        renderAll();
    } catch (e) {
        console.error('Reports load error:', e);
    }
}

// ── Filter by period ──────────────────────────────────────────
//function filterByPeriod(items, dateField) {
//    if (currentPeriod === 'all') return items;
//    const now  = new Date();
//    const from = new Date();
//    if (currentPeriod === 'month')   from.setDate(1);
//    if (currentPeriod === 'quarter') from.setMonth(now.getMonth() - 2, 1);
//    if (currentPeriod === 'year')    from.setMonth(0, 1);
//    from.setHours(0, 0, 0, 0);
//    return items.filter(item => {
//        const d = new Date(item[dateField]);
//        return d >= from;
//    });
//}

function filterByPeriod(items, dateField) {
    if (currentPeriod === 'all') return items;
    const now  = new Date();
    const from = new Date();
    const to   = new Date();

    if (currentPeriod === 'month') {
        from.setDate(1);
        to.setMonth(to.getMonth() + 1, 0);   // last day of this month
    }
    if (currentPeriod === 'quarter') {
        from.setMonth(now.getMonth() - 2, 1);
        to.setMonth(to.getMonth() + 1, 0);   // last day of this month
    }
    if (currentPeriod === 'year') {
        from.setMonth(0, 1);
        to.setMonth(11, 31);                  // 31 Dec of this year
    }

    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    return items.filter(item => {
        const d = new Date(item[dateField]);
        return d >= from && d <= to;
    });
}

// ── Render all sections ───────────────────────────────────────
function renderAll() {
    const loans = filterByPeriod(allLoans, 'applied_at');
    const emis  = filterByPeriod(allEMIs, 'due_date');

    renderKPIs(loans, emis);
    renderFunnel(loans);
    renderDonut(allLoans);
    renderCollection(emis);
    renderScoreDist(allLoans);
    renderTopBorrowers(allLoans);
    renderOverdue(emis);
    renderRevenue(loans, emis);
}

function renderRevenue(loans, emis) {
    const paidEmis       = emis.filter(e => e.status === 'paid');
    const interestEarned = paidEmis.reduce((s, e) => s + (parseFloat(e.interest_component) || 0), 0);
    const principalColl  = paidEmis.reduce((s, e) => s + (parseFloat(e.principal_component) || 0), 0);
    const totalCollected = paidEmis.reduce((s, e) => s + (e.paid_amount || e.amount || 0), 0);
    const procFees       = loans
        .filter(l => ['active','disbursed','closed'].includes(l.status))
        .reduce((s, l) => s + (parseFloat(l.processing_fee_amount) || 0), 0);
    const netProfit      = interestEarned + procFees;
    const intPct         = totalCollected > 0 ? Math.round((interestEarned / totalCollected) * 100) : 0;
    const avgInterest    = paidEmis.length > 0 ? Math.round(interestEarned / paidEmis.length) : 0;

    document.getElementById('revenueWrap').innerHTML = `
        <div class="collection-metric">
            <span class="collection-metric-label">Interest Income</span>
            <span class="collection-metric-val" style="color:var(--teal-600);">${fmtINR(interestEarned)}</span>
        </div>
        <div class="coll-row">
            <div class="coll-row-label" style="color:var(--teal-600);">Interest</div>
            <div class="coll-row-track">
                <div class="coll-row-fill" style="width:${intPct}%;background:var(--teal-400);"></div>
            </div>
            <div class="coll-row-val">${intPct}%</div>
        </div>
        <div class="coll-row">
            <div class="coll-row-label">Principal</div>
            <div class="coll-row-track">
                <div class="coll-row-fill" style="width:${100-intPct}%;background:#e2e8f0;"></div>
            </div>
            <div class="coll-row-val">${100-intPct}%</div>
        </div>
        <div class="collection-metric" style="margin-top:14px;">
            <span class="collection-metric-label">Processing Fees Collected</span>
            <span class="collection-metric-val">${fmtINR(procFees)}</span>
        </div>
        <div class="collection-metric">
            <span class="collection-metric-label">Avg Interest per EMI</span>
            <span class="collection-metric-val">${fmtINR(avgInterest)}</span>
        </div>
        <div style="margin-top:16px;padding:12px;background:var(--teal-50);border:1px solid var(--teal-100);border-radius:var(--radius-md);display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12.5px;color:var(--teal-600);font-weight:600;">Net Profit (Interest + Fees)</span>
            <span style="font-size:18px;font-weight:700;font-family:var(--font-mono);color:var(--teal-600);">${fmtINR(netProfit)}</span>
        </div>
    `;
}

// ── KPIs ──────────────────────────────────────────────────────
function renderKPIs(loans, emis) {
    const disbursed   = loans.filter(l => ['active','disbursed','closed'].includes(l.status))
                             .reduce((s, l) => s + (l.amount_disbursed || l.amount || 0), 0);
    const collected   = emis.filter(e => e.status === 'paid').reduce((s, e) => s + (e.paid_amount || e.amount || 0), 0);
    const overdueCnt  = emis.filter(e => e.status === 'overdue').length;
    const activeBorr = new Set(allLoans.filter(l => ['active','disbursed'].includes(l.status)).map(l => l.borrower_name)).size;
    const approved    = loans.filter(l => ['approved','active','disbursed','closed'].includes(l.status)).length;
    const approvalRate = loans.length > 0 ? Math.round((approved / loans.length) * 100) : 0;
    const eligibleLoans = allLoans.filter(l => ['active', 'disbursed'].includes(l.status));
    const npaLoans = eligibleLoans.filter(loan =>
        allEMIs.some(e => e.loan_id === loan.id && e.status === 'overdue')
    );
    const npaRate = eligibleLoans.length > 0
    ? ((npaLoans.length / eligibleLoans.length) * 100).toFixed(1)
    : '0.0';

    document.getElementById('kpiDisbursed').textContent    = fmtINR(disbursed);
    document.getElementById('kpiCollected').textContent    = fmtINR(collected);
    document.getElementById('kpiOverdue').textContent      = overdueCnt;
    document.getElementById('kpiBorrowers').textContent    = activeBorr;
    document.getElementById('kpiApprovalRate').textContent = approvalRate + '%';
    document.getElementById('kpiNPA').textContent          = npaRate + '%';
    const interestEarned = emis
        .filter(e => e.status === 'paid')
        .reduce((s, e) => s + (parseFloat(e.interest_component) || 0), 0);

    const procFees = loans
        .filter(l => ['active','disbursed','closed'].includes(l.status))
        .reduce((s, l) => s + (parseFloat(l.processing_fee_amount) || 0), 0);

    const netProfit = interestEarned + procFees;

    document.getElementById('kpiInterest').textContent  = fmtINR(interestEarned);
    document.getElementById('kpiNetProfit').textContent = fmtINR(netProfit);
    }

// ── Funnel ────────────────────────────────────────────────────
function renderFunnel(loans) {
    const base     = allLoans;          // ← always use full dataset for funnel
    const total    = base.length;
    const applied  = base.filter(l => ['applied','approved','active','disbursed','closed'].includes(l.status)).length;
    const approved = base.filter(l => ['approved','active','disbursed','closed'].includes(l.status)).length;
    const active   = base.filter(l => ['active','disbursed'].includes(l.status)).length;
    const rejected = base.filter(l => l.status === 'rejected').length;

    const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

    const stages = [
        { label: 'Total Applied', count: total,    cls: 'total',    pct: 100 },
        { label: 'Under Review',  count: applied,  cls: 'applied',  pct: pct(applied) },
        { label: 'Approved',      count: approved, cls: 'approved', pct: pct(approved) },
        { label: 'Disbursed',     count: active,   cls: 'active',   pct: pct(active) },
        { label: 'Rejected',      count: rejected, cls: 'rejected', pct: pct(rejected) },
    ];

    document.getElementById('funnelWrap').innerHTML = stages.map(s => `
        <div class="funnel-row">
            <div class="funnel-label">${s.label}</div>
            <div class="funnel-bar-track">
                <div class="funnel-bar-fill ${s.cls}" style="width:${s.pct}%;--bar-w:${s.pct}%;">
                    ${s.count > 0 ? s.count : ''}
                </div>
            </div>
            <div class="funnel-pct">${s.pct}%</div>
        </div>
    `).join('');
}

// ── Donut (pure CSS/Canvas) ───────────────────────────────────
function renderDonut(loans) {
    const statusCounts = {};
    loans.forEach(l => { statusCounts[l.status] = (statusCounts[l.status] || 0) + 1; });

    const colorMap = {
        pending:   '#f59e0b', applied:  '#3b82f6', approved: '#0e8c6a',
        active:    '#7c3aed', rejected: '#c0392b', closed:   '#94a3b8',
        disbursed: '#10b981',
    };
    const labelMap = {
        pending: 'Pending', applied: 'Under Review', approved: 'Approved',
        active: 'Active', rejected: 'Rejected', closed: 'Closed', disbursed: 'Disbursed',
    };

    const total = loans.length;
    const canvas = document.getElementById('donutChart');
    const ctx    = canvas.getContext('2d');
    const cx = 100, cy = 100, r = 80, inner = 52;

    ctx.clearRect(0, 0, 200, 200);

    if (total === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
        ctx.fillStyle = '#e2e8f0';
        ctx.fill();
        document.getElementById('donutLegend').innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No data</div>';
        return;
    }

    let startAngle = -Math.PI / 2;
    const entries = Object.entries(statusCounts).filter(([,v]) => v > 0);

    entries.forEach(([status, count]) => {
        const slice = (count / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, startAngle + slice);
        ctx.arc(cx, cy, inner, startAngle + slice, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = colorMap[status] || '#94a3b8';
        ctx.fill();
        startAngle += slice;
    });

    // Center label
    ctx.fillStyle = '#0a1f2a';
    ctx.font = 'bold 18px DM Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy - 6);
    ctx.font = '11px DM Sans, sans-serif';
    ctx.fillStyle = '#7a9aaa';
    ctx.fillText('loans', cx, cy + 12);

    // Legend
    document.getElementById('donutLegend').innerHTML = entries.map(([status, count]) => `
        <div class="legend-item">
            <div class="legend-dot" style="background:${colorMap[status] || '#94a3b8'};"></div>
            <span>${labelMap[status] || status}</span>
            <span class="legend-val">${count}</span>
        </div>
    `).join('');
}

// ── Collection performance ────────────────────────────────────
function renderCollection(emis) {
    const total   = emis.length;
    const paid    = emis.filter(e => e.status === 'paid').length;
    const overdue = emis.filter(e => e.status === 'overdue').length;
    const pending = emis.filter(e => e.status === 'pending').length;

    const paidAmt    = emis.filter(e => e.status === 'paid').reduce((s, e) => s + (e.paid_amount || e.amount || 0), 0);
    const overdueAmt = emis.filter(e => e.status === 'overdue').reduce((s, e) => s + (e.amount || 0), 0);

    const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;

    document.getElementById('collectionWrap').innerHTML = `
        <div class="collection-metric">
            <span class="collection-metric-label">Total EMI Amount Collected</span>
            <span class="collection-metric-val" style="color:var(--success);">${fmtINR(paidAmt)}</span>
        </div>
        <div class="collection-metric">
            <span class="collection-metric-label">Total Overdue Amount</span>
            <span class="collection-metric-val" style="color:var(--error);">${fmtINR(overdueAmt)}</span>
        </div>
        <div style="margin: 16px 0 8px; font-size:11px; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em;">EMI Count Breakdown</div>
        <div class="coll-row">
            <div class="coll-row-label" style="color:var(--success);">Paid</div>
            <div class="coll-row-track"><div class="coll-row-fill" style="width:${pct(paid)}%;background:var(--success);"></div></div>
            <div class="coll-row-val">${paid}</div>
        </div>
        <div class="coll-row">
            <div class="coll-row-label" style="color:var(--warning);">Pending</div>
            <div class="coll-row-track"><div class="coll-row-fill" style="width:${pct(pending)}%;background:var(--warning);"></div></div>
            <div class="coll-row-val">${pending}</div>
        </div>
        <div class="coll-row">
            <div class="coll-row-label" style="color:var(--error);">Overdue</div>
            <div class="coll-row-track"><div class="coll-row-fill" style="width:${pct(overdue)}%;background:var(--error);"></div></div>
            <div class="coll-row-val">${overdue}</div>
        </div>
        <div style="margin-top:16px; padding:12px; background:var(--off-white); border-radius:var(--radius-md); display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:12.5px; color:var(--text-secondary);">Collection Rate</span>
            <span style="font-size:18px; font-weight:700; font-family:var(--font-mono); color:${pct(paid) >= 80 ? 'var(--success)' : 'var(--warning)'};">${pct(paid)}%</span>
        </div>
    `;
}

// ── Score distribution ────────────────────────────────────────
function renderScoreDist(loans) {
    const bands = [
        { label: '750–900 Excellent', min: 750, max: 900, cls: 'excellent' },
        { label: '700–749 Good',      min: 700, max: 749, cls: 'good' },
        { label: '650–699 Fair',      min: 650, max: 699, cls: 'fair' },
        { label: 'Below 650 Poor',    min: 0,   max: 649, cls: 'poor' },
    ];

    const total = loans.filter(l => l.credit_score).length;

    document.getElementById('scoreDistWrap').innerHTML = bands.map(band => {
        const count = loans.filter(l => l.credit_score >= band.min && l.credit_score <= band.max).length;
        const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
        return `
            <div class="score-band-row">
                <div class="score-band-label">${band.label}</div>
                <div class="score-band-track">
                    <div class="score-band-fill ${band.cls}" style="width:${pct}%;">
                        ${count > 0 ? count : ''}
                    </div>
                </div>
                <div class="score-band-pct">${pct}%</div>
            </div>
        `;
    }).join('');
}

// ── Top borrowers ─────────────────────────────────────────────
function renderTopBorrowers(loans) {
    const sorted = [...loans]
        .filter(l => l.amount)
        .sort((a, b) => (b.amount_disbursed || b.amount) - (a.amount_disbursed || a.amount))
        .slice(0, 10);

    if (sorted.length === 0) {
        document.getElementById('topBorrowersBody').innerHTML =
            `<tr><td colspan="7" class="empty-report"><i class="ti ti-users-off"></i>No loans yet</td></tr>`;
        return;
    }

    const rankCls = (i) => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';

    document.getElementById('topBorrowersBody').innerHTML = sorted.map((loan, i) => {
        const initials = (loan.borrower_name || 'B').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        return `
            <tr>
                <td><div class="rank-num ${rankCls(i)}">${i + 1}</div></td>
                <td>
                    <div class="borrower-cell">
                        <div class="b-avatar">${initials}</div>
                        <div>
                            <div class="b-name">${loan.borrower_name || '—'}</div>
                            <div class="b-mobile">${loan.borrower_mobile || ''}</div>
                        </div>
                    </div>
                </td>
                <td><span class="teal-val">${fmtINR(loan.amount_disbursed || loan.amount)}</span></td>
                <td><span class="mono-val">${fmtINR(loan.emi_amount)}</span></td>
                <td><span class="mono-val" style="color:var(--success);">${loan.credit_score || '—'}</span></td>
                <td><span class="status-badge ${loan.status}">${loan.status}</span></td>
                <td style="color:var(--text-muted);font-size:12px;">${fmtDate(loan.applied_at)}</td>
            </tr>
        `;
    }).join('');
}

// ── Overdue EMIs ──────────────────────────────────────────────
function renderOverdue(emis) {
    const overdue = emis.filter(e => e.status === 'overdue')
                        .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

    if (overdue.length === 0) {
        document.getElementById('overdueBody').innerHTML =
            `<tr><td colspan="6" class="empty-report"><i class="ti ti-circle-check" style="color:var(--success);"></i>No overdue EMIs</td></tr>`;
        return;
    }

    document.getElementById('overdueBody').innerHTML = overdue.map(e => {
        const days = Math.floor((new Date() - new Date(e.due_date)) / 86400000);
        const cls  = days > 30 ? 'critical' : 'warning';
        const initials = (e.borrower_name || 'B').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        return `
            <tr>
                <td>
                    <div class="borrower-cell">
                        <div class="b-avatar">${initials}</div>
                        <div>
                            <div class="b-name">${e.borrower_name || '—'}</div>
                            <div class="b-mobile">${e.borrower_mobile || ''}</div>
                        </div>
                    </div>
                </td>
                <td style="color:var(--error);font-family:var(--font-mono);font-size:12.5px;">${fmtDate(e.due_date)}</td>
                <td style="color:var(--text-muted);">EMI #${e.instalment_number}</td>
                <td><span class="mono-val">${fmtINR(e.amount)}</span></td>
                <td><span class="mono-val">${fmtINR(e.outstanding_balance)}</span></td>
                <td><span class="overdue-days ${cls}"><i class="ti ti-clock"></i> ${days}d</span></td>
            </tr>
        `;
    }).join('');
}

// ── Sidebar + logout ──────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
        overlay?.classList.toggle('show');
    } else {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
    }
}

function handleLogout() {
    ['nbfc_token','nbfc_id','nbfc_name'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/nbfc/login';
}
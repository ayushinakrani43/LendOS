const API = window.API_BASE || window.location.origin;

function getSession() {
    const token = localStorage.getItem('admin_token');
    if (!token) return null;
    return { access_token: token, admin_name: localStorage.getItem('admin_name') || 'Admin' };
}
function authHeaders(session) {
    return { 'Authorization': `Bearer ${session.access_token}` };
}

const ADM_COLORS = ['#4f46e5', '#059669', '#d97706', '#dc2626', '#0891b2', '#7c3aed', '#94a3b8'];

const STATUS_COLOR = {
    pending: '#d97706', applied: '#3b82f6', approved: '#4f46e5',
    active: '#059669', disbursed: '#10b981', closed: '#94a3b8', rejected: '#dc2626',
};
const GRADE_COLOR = {
    'Excellent': '#059669', 'Good': '#4f46e5', 'Fair': '#d97706',
    'Poor': '#ea580c', 'Very Poor': '#dc2626',
};

// Case-insensitive color lookup — some rows store grade/status with
// different casing than the color maps above use as keys (e.g. "good"
// vs "Good"), which previously collapsed distinct slices into the same
// gray fallback color. This matches regardless of case.
function resolveColor(colorMap, key) {
    if (colorMap[key]) return colorMap[key];
    const lower = String(key).toLowerCase();
    const match = Object.keys(colorMap).find(k => k.toLowerCase() === lower);
    return match ? colorMap[match] : '#94a3b8';
}

// Display label as Title Case regardless of how it's cased in the DB
function titleCase(str) {
    return String(str).split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

window.addEventListener('DOMContentLoaded', async () => {
    const session = getSession();
    if (!session) { window.location.href = '/admin/login'; return; }

    document.getElementById('adminName').textContent = session.admin_name;
    document.getElementById('adminAvatar').textContent = session.admin_name.charAt(0).toUpperCase();
    document.getElementById('sidebarAdminName').textContent = session.admin_name;

    if (localStorage.getItem('admin_sidebar_collapsed') === '1' && window.innerWidth > 768) {
        document.getElementById('sidebar')?.classList.add('collapsed');
    }

    await loadReport();
});

async function loadReport() {
    const session = getSession();
    try {
        const res = await fetch(`${API}/api/admin/dashboard/platform-reports`, { headers: authHeaders(session) });
        if (!res.ok) throw new Error('Failed to load report.');
        const data = await res.json();

        document.getElementById('rptLoading').style.display = 'none';
        document.getElementById('rptContent').style.display = 'block';

        renderOverview(data.overview);
        renderLoanPortfolio(data.loan_portfolio, data.month_labels);
        renderBorrowerAnalytics(data.borrower_analytics, data.month_labels);
        renderCollectionPerformance(data.collection_performance, data.month_labels);
        renderLeaderboard(data.nbfc_leaderboard);
    } catch (e) {
        document.getElementById('rptLoading').innerHTML =
            `<div style="color:#dc2626;">Could not load platform reports. Please try refreshing.</div>`;
    }
}

// ── Helpers ────────────────────────────────────────────────────
function fmtINR(n) {
    if (!n && n !== 0) return '—';
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
    if (n >= 100000)   return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000)     return '₹' + (n / 1000).toFixed(1) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}
function rateClass(rate) {
    if (rate >= 85) return 'good';
    if (rate >= 60) return 'mid';
    return 'low';
}

// ── Section 1: Overview strip ───────────────────────────────────
function renderOverview(ov) {
    document.getElementById('statNBFCs').textContent     = ov.active_nbfcs;
    document.getElementById('statLoans').textContent     = ov.total_loans;
    document.getElementById('statDisbursed').textContent = fmtINR(ov.total_disbursed);
    document.getElementById('statBorrowers').textContent = ov.total_borrowers;
}

// ── Section 2: Loan Portfolio ───────────────────────────────────
function renderLoanPortfolio(lp, labels) {
    drawDonut('portfolioDonut', 'portfolioLegend', lp.status_distribution, STATUS_COLOR, 'loans');
    drawLineChart('disbursedCountChart', labels, [{ data: lp.monthly_disbursed_count, color: '#4f46e5', label: 'Loans' }]);
    drawBarChart('disbursedAmountChart', labels, lp.monthly_disbursed_amount, '#059669', fmtINR);
}

// ── Section 3: Borrower Analytics ───────────────────────────────
function renderBorrowerAnalytics(ba, labels) {
    drawBarChart('newBorrowersChart', labels, ba.new_borrowers_per_month, '#4f46e5', v => v);
    drawDonut('scoreDonut', 'scoreLegend', ba.score_distribution, GRADE_COLOR, 'scores');
    renderEmploymentBars(ba.employment_distribution);
}

function renderEmploymentBars(dist) {
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    const el = document.getElementById('employmentBars');
    if (!total) { el.innerHTML = '<div class="rpt-empty">No employment data yet</div>'; return; }

el.innerHTML = Object.entries(dist).map(([type, count]) => {
        const pct = Math.round((count / total) * 100);
        return `
            <div class="emp-bar-row">
                <div class="emp-bar-label">
                    <span>${type}</span>
                    <span>${pct}% <span style="color:var(--text-muted);font-weight:400;">(${count})</span></span>
                </div>
                <div class="emp-bar-track">
                    <div class="emp-bar-fill" style="width:${pct}%;"></div>
                </div>
            </div>`;
    }).join('');
}

// ── Section 4: Collection Performance ───────────────────────────
function renderCollectionPerformance(cp, labels) {
document.getElementById('overallCollectionRate').textContent = cp.overall_rate + '%';
    const fill = document.getElementById('collectionRateFill');
    if (fill) fill.style.width = Math.min(cp.overall_rate, 100) + '%';
    document.getElementById('collectionSub').textContent =
        `${fmtINR(cp.collected_total)} collected of ${fmtINR(cp.due_total)} due (all-time)`;

    const tbody = document.getElementById('perNbfcCollectionBody');
    if (!cp.per_nbfc.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="rpt-empty">No EMI data yet</td></tr>`;
    } else {
  tbody.innerHTML = cp.per_nbfc.map(r => `
            <tr>
                <td>
                    <div class="nbfc-cell">
                        <div class="nbfc-avatar">${r.nbfc_name.charAt(0)}</div>
                        <div class="nbfc-name">${r.nbfc_name}</div>
                    </div>
                </td>
                <td class="mono">${fmtINR(r.due)}</td>
                <td class="mono">${fmtINR(r.collected)}</td>
                <td><span class="rate-pill ${rateClass(r.rate)}">${r.rate}%</span></td>
                <td class="mono" style="color:${r.overdue > 0 ? '#dc2626' : 'var(--text-muted)'};">
                    ${r.overdue || 0}
                </td>
            </tr>
        `).join('');
    }

    drawLineChart('overdueTrendChart', labels, [{ data: cp.overdue_trend, color: '#dc2626', label: 'Overdue EMIs' }]);
}

// ── Section 5: NBFC Leaderboard ─────────────────────────────────
function renderLeaderboard(list) {
    const tbody = document.getElementById('leaderboardBody');
    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="rpt-empty">No NBFCs yet</td></tr>`;
        return;
    }
const rankClass = i => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    tbody.innerHTML = list.map((r, i) => `
        <tr>
            <td><span class="rank ${rankClass(i)}">${i + 1}</span></td>
            <td>
                <div class="nbfc-cell">
                    <div class="nbfc-avatar">${r.nbfc_name.charAt(0)}</div>
                    <div>
                        <div class="nbfc-name">${r.nbfc_name}</div>
                        <div class="nbfc-reg">${r.registration_number || ''}</div>
                    </div>
                </div>
            </td>
            <td class="mono">${r.total_loans || 0}</td>
            <td class="mono">${fmtINR(r.total_disbursed)}</td>
            <td class="mono">${r.active_loans}</td>
            <td class="mono">${r.total_loans ? fmtINR(r.total_disbursed / r.total_loans) : '—'}</td>
        </tr>
    `).join('');
}

// ══════════════════════════════════════════════════════════════
//  Canvas chart primitives — no external library, matches the
//  hand-drawn canvas style already used on nbfc-reports.js
// ══════════════════════════════════════════════════════════════

function drawDonut(canvasId, legendId, dataObj, colorMap, unitLabel) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');

    // Scale geometry to THIS canvas's actual size instead of assuming 200x200 —
    // different donut instances on this page use different pixel dimensions
    // (e.g. 140x140, 180x180), and hardcoded geometry clipped the smaller ones.
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) * 0.4;
    const inner = r * 0.65;

    ctx.clearRect(0, 0, W, H);

    const entries = Object.entries(dataObj).filter(([, v]) => v > 0);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);

    if (total === 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
        ctx.fillStyle = '#e2e8f0';
        ctx.fill();
        document.getElementById(legendId).innerHTML = '<div class="rpt-empty">No data yet</div>';
        return;
    }

    let startAngle = -Math.PI / 2;
    entries.forEach(([key, count]) => {
        const slice = (count / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, startAngle + slice);
        ctx.arc(cx, cy, inner, startAngle + slice, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = resolveColor(colorMap, key);
        ctx.fill();
        startAngle += slice;
    });

    const bigFont = Math.max(14, Math.round(r * 0.28));
    const smallFont = Math.max(9, Math.round(r * 0.16));

    ctx.fillStyle = '#0f0e1a';
    ctx.font = `bold ${bigFont}px DM Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(total, cx, cy - bigFont * 0.35);
    ctx.font = `${smallFont}px DM Sans, sans-serif`;
    ctx.fillStyle = '#8585a8';
    ctx.fillText(unitLabel, cx, cy + bigFont * 0.55);

    document.getElementById(legendId).innerHTML = entries.map(([key, count]) => `
        <div class="legend-item">
            <div class="legend-dot" style="background:${resolveColor(colorMap, key)};"></div>
            <span>${titleCase(key)}</span>
            <span class="legend-val">${count}</span>
        </div>
    `).join('');
}

function drawBarChart(canvasId, labels, values, color, fmtFn) {
    const canvas = canvas_setup(canvasId);
    if (!canvas) return;
    const { ctx, W, H, padL, padB, padT } = canvas;

    const maxVal = Math.max(...values, 1);
    const chartW = W - padL - 16;
    const chartH = H - padT - padB;
    const barGap = 6;
    const barW = (chartW / values.length) - barGap;

    values.forEach((v, i) => {
        const barH = maxVal > 0 ? (v / maxVal) * chartH : 0;
        const x = padL + i * (barW + barGap);
        const y = padT + chartH - barH;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        roundRectTop(ctx, x, y, barW, barH, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
    });

    drawAxisLabels(ctx, labels, values.length, padL, padT, chartW, chartH, H);
}

function drawLineChart(canvasId, labels, series) {
    const canvas = canvas_setup(canvasId);
    if (!canvas) return;
    const { ctx, W, H, padL, padB, padT } = canvas;

    const allVals = series.flatMap(s => s.data);
    const maxVal = Math.max(...allVals, 1);
    const chartW = W - padL - 16;
    const chartH = H - padT - padB;
    const n = series[0].data.length;
    const stepX = n > 1 ? chartW / (n - 1) : 0;

    series.forEach(s => {
        ctx.beginPath();
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        s.data.forEach((v, i) => {
            const x = padL + i * stepX;
            const y = padT + chartH - (maxVal > 0 ? (v / maxVal) * chartH : 0);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();

        s.data.forEach((v, i) => {
            const x = padL + i * stepX;
            const y = padT + chartH - (maxVal > 0 ? (v / maxVal) * chartH : 0);
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = s.color;
            ctx.fill();
        });
    });

    drawAxisLabels(ctx, labels, n, padL, padT, chartW, chartH, H);
}

function canvas_setup(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const padL = 8, padB = 26, padT = 10;
    ctx.clearRect(0, 0, W, H);
    return { ctx, W, H, padL, padB, padT };
}

function roundRectTop(ctx, x, y, w, h, radius) {
    if (h <= 0) { ctx.beginPath(); return; }
    const r = Math.min(radius, w / 2, h);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
}

function drawAxisLabels(ctx, labels, count, padL, padT, chartW, chartH, H) {
    if (!labels) return;
    ctx.fillStyle = '#8585a8';
    ctx.font = '9.5px DM Sans, sans-serif';

    const xAt = i => padL + (count > 1 ? i * (chartW / (count - 1)) : chartW / 2);

    // Measure the actual widest label instead of guessing — narrow charts
    // (e.g. 280px) can't fit 6+ labels like "Oct 25" without them colliding,
    // so figure out from real text width how many labels genuinely fit.
    const widestLabel = labels.reduce((max, l) => {
        const w = ctx.measureText(l).width;
        return w > max ? w : max;
    }, 0);
    const minGap = 10; // breathing room between adjacent labels
    const maxLabelsThatFit = Math.max(2, Math.floor(chartW / (widestLabel + minGap)));

    let step = Math.ceil((count - 1) / (maxLabelsThatFit - 1));
    if (!isFinite(step) || step < 1) step = 1;

    labels.forEach((label, i) => {
        const isFirst = i === 0;
        const isLast  = i === count - 1;
        if (!isFirst && !isLast && i % step !== 0) return;
        // Guard against a stepped label landing too close to the last one
        // when step doesn't divide evenly into count-1
        if (!isFirst && !isLast && (count - 1 - i) * (chartW / (count - 1)) < widestLabel + minGap) return;

        const x = xAt(i);
        // Center-aligning text exactly at the first/last x-position pushes
        // half the text past the canvas edge (e.g. "Aug 25" clipped to
        // "ug 25"). Anchor edge labels inward instead of centering on them.
        if (isFirst) {
            ctx.textAlign = 'left';
        } else if (isLast) {
            ctx.textAlign = 'right';
        } else {
            ctx.textAlign = 'center';
        }
        ctx.fillText(label, x, H - 8);
    });
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
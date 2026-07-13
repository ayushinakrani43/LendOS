// ═══════════════════════════════════════════════════════════════
//  borrower-loans.js  —  LendOS My Loans Page
// ═══════════════════════════════════════════════════════════════

const API = window.location.origin;

// ── Session ───────────────────────────────────────────────────
function getSession() {
    const token = localStorage.getItem('borrower_token');
    if (!token) return null;
    return {
        access_token: token,
        borrower_id:  parseInt(localStorage.getItem('borrower_id')),
        full_name:    localStorage.getItem('borrower_name') || '',
    };
}

function apiFetch(url) {
    const session = getSession();
    return fetch(`${API}${url}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
}

// ── Helpers ───────────────────────────────────────────────────
function fmtINR(n) {
    if (!n && n !== 0) return '—';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function purposeLabel(raw) {
    const map = {
        personal: 'Personal Use', medical: 'Medical Emergency',
        education: 'Education', home_renovation: 'Home Renovation',
        business: 'Business', vehicle: 'Vehicle Purchase',
        travel: 'Travel', wedding: 'Wedding',
        debt_consolidation: 'Debt Consolidation', other: 'Other',
    };
    return map[raw] || (raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '—');
}

function statusBadge(status) {
    const map = {
        pending:  ['pending',  'ti-clock',        'Pending Review'],
        applied:  ['applied',  'ti-send',         'Under Review'],
        approved: ['approved', 'ti-circle-check', 'Approved'],
        active:   ['active',   'ti-rocket',       'Active'],
        rejected: ['rejected', 'ti-x-circle',     'Rejected'],
        declined: ['declined', 'ti-ban',          'Declined'],
        closed:   ['closed',   'ti-lock',         'Closed'],
    };
    const [cls, icon, label] = map[status] || ['pending', 'ti-clock', status];
    return `<span class="loan-badge ${cls}"><i class="ti ${icon}"></i>${label}</span>`;
}

function emiStatusBadge(status) {
    const map = {
        paid:    ['paid',    'ti-check',    'Paid'],
        pending: ['pending', 'ti-clock',    'Pending'],
        payment_claimed:  ['claimed', 'ti-hourglass',       'Verification Pending'],
        overdue: ['overdue', 'ti-alert',    'Overdue'],
        waived:  ['waived',  'ti-discount', 'Waived'],
    };
    const [cls, icon, label] = map[status] || ['pending', 'ti-clock', status];
    return `<span class="emi-status-badge ${cls}"><i class="ti ${icon}"></i>${label}</span>`;
}

// ── Next EMI strip (shown above EMI schedule) ─────────────────
function nextEmiHtml(emis, loanId) {
    if (!emis || !emis.length) return '';

    const today    = new Date();
    today.setHours(0,0,0,0);

    // Find next unpaid EMI
    const next = emis.find(e => e.status !== 'paid');
    if (!next) return '';

    const due      = new Date(next.due_date);
    const diffDays = Math.floor((due - today) / (1000 * 60 * 60 * 24));
    const isOverdue = diffDays < 0;
    const daysAbs  = Math.abs(diffDays);

    const urgencyClass = isOverdue
        ? 'next-emi-strip overdue'
        : diffDays <= 5
        ? 'next-emi-strip urgent'
        : 'next-emi-strip normal';

    const icon = isOverdue ? 'ti-alert-triangle' : diffDays <= 5 ? 'ti-clock-exclamation' : 'ti-calendar-due';

    const dueLine = isOverdue
        ? `<span class="emi-due-tag overdue"><i class="ti ti-alert-triangle"></i> ${daysAbs} day${daysAbs !== 1 ? 's' : ''} overdue</span>`
        : diffDays === 0
        ? `<span class="emi-due-tag today"><i class="ti ti-clock"></i> Due today</span>`
        : diffDays <= 5
        ? `<span class="emi-due-tag urgent"><i class="ti ti-clock-exclamation"></i> Due in ${diffDays} days</span>`
        : `<span class="emi-due-tag normal"><i class="ti ti-calendar"></i> Due in ${diffDays} days</span>`;

    const lateFeeHtml = next.late_fee_amount > 0
        ? `<span class="emi-late-fee"><i class="ti ti-alert-circle"></i> +${fmtINR(next.late_fee_amount)} late fee</span>`
        : '';

    const actionBtn = (next.status === 'pending' || next.status === 'overdue')
        ? `<button class="emi-pay-btn" onclick="openPayModal(${loanId}, ${next.id}, ${next.instalment_number}, ${next.amount}, ${next.late_fee_amount || 0})">
             <i class="ti ti-credit-card"></i> Pay Now
           </button>`
        : next.status === 'payment_claimed'
        ? `<span class="emi-claimed-tag"><i class="ti ti-hourglass"></i> Verification Pending</span>`
        : '';

    return `
        <div class="${urgencyClass}" id="next-emi-strip-${loanId}">
            <div class="nes-left">
                <i class="ti ${icon} nes-icon"></i>
                <div>
                    <div class="nes-title">EMI #${next.instalment_number} — ${fmtINR(next.amount)}</div>
                    <div class="nes-meta">${fmtDate(next.due_date)} ${dueLine} ${lateFeeHtml}</div>
                </div>
            </div>
            <div class="nes-right">${actionBtn}</div>
        </div>`;
}

// ── Build per-row EMI action button ─────────────────────────────
function buildEmiAction(emi, loanId) {
    if (emi.status === 'pending' || emi.status === 'overdue') {
return `<button class="emi-pay-btn" onclick="openPayModal(${loanId}, ${emi.id}, ${emi.instalment_number}, ${emi.amount}, ${emi.late_fee_amount || 0})">
                    <i class="ti ti-credit-card"></i> Mark as Paid
                </button>`;
    }
    if (emi.status === 'payment_claimed') {
        return `<span style="font-size:11.5px;color:var(--text-muted);">Awaiting NBFC confirmation</span>`;
    }
    return '';
}

// ── Pay EMI modal ──────────────────────────────────────────────
let currentEmiContext = null;

async function openPayModal(loanId, emiId, instalmentNo, amount, lateFee) {
    currentEmiContext = { loanId, emiId, instalmentNo, amount, lateFee };

    // Fetch NBFC bank details for this loan
    let bankInfo = { bank_name: '—', bank_account_no: '—', bank_ifsc: '—', upi_id: '—' };
    try {
        const session = getSession();
        const res = await apiFetch(`/api/borrower/loans/${session.borrower_id}/bank-details/${loanId}`);
        if (res.ok) bankInfo = await res.json();
    } catch (e) {}

   document.getElementById('payModalAmount').textContent  = fmtINR(amount);

    // Show late fee notice if applicable
    const lateFeeNote = document.getElementById('payModalLateFeeNote');
    if (lateFeeNote) {
        if (lateFee > 0) {
            lateFeeNote.style.display = 'block';
            lateFeeNote.textContent = `Includes ₹${Math.round(lateFee).toLocaleString('en-IN')} late payment penalty`;
        } else {
            lateFeeNote.style.display = 'none';
        }
    }
    document.getElementById('payModalInstNo').textContent  = instalmentNo;
    document.getElementById('payModalBankName').textContent = bankInfo.bank_name || '—';
    document.getElementById('payModalAccNo').textContent    = bankInfo.bank_account_no || '—';
    document.getElementById('payModalIfsc').textContent     = bankInfo.bank_ifsc || '—';
    document.getElementById('payModalUpi').textContent      = bankInfo.upi_id || '—';
    document.getElementById('payRefInput').value = '';
    document.getElementById('payModalOverlay').style.display = 'flex';
}

function closePayModal() {
    document.getElementById('payModalOverlay').style.display = 'none';
    currentEmiContext = null;
}

async function submitEmiClaim() {
    const ref = document.getElementById('payRefInput').value.trim();
    if (!ref) { alert('Please enter the payment reference (UTR / UPI Ref).'); return; }
    if (!currentEmiContext) return;

    const btn = document.getElementById('submitClaimBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Submitting…';

    try {
        const session = getSession();
        const res = await fetch(`${API}/api/borrower/emi/${currentEmiContext.emiId}/claim`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                payment_reference: ref,
                claimed_amount: currentEmiContext.amount,
            }),
        });
        const data = await res.json();

        if (!res.ok) {
            alert(data.detail || 'Failed to submit payment claim.');
            btn.disabled = false;
            btn.innerHTML = '<i class="ti ti-check"></i> Submit Payment Proof';
            return;
        }

const loanId = currentEmiContext.loanId;
        closePayModal();
        // Force refresh: hide first, then re-fetch after brief delay
        const tableDiv = document.getElementById(`emi-table-${loanId}`);
        if (tableDiv) tableDiv.style.display = 'none';
        setTimeout(() => toggleEMI(loanId), 300);

    } catch (e) {
        alert('Cannot connect to server. Please try again.');
        btn.disabled = false;
        btn.innerHTML = '<i class="ti ti-check"></i> Submit Payment Proof';
    }
}

// ── On load ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    const session = getSession();
    if (!session) { window.location.href = '/borrower/login'; return; }

    // Fill topbar
    const name = session.full_name || 'Borrower';
    document.getElementById('userName').textContent   = name;
    document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();

    await loadLoans(session);
});

// ── Load loans ────────────────────────────────────────────────
async function loadLoans(session) {
    try {
        const res  = await apiFetch(`/api/borrower/loans/${session.borrower_id}`);
        const data = await res.json();

        document.getElementById('loadingState').style.display = 'none';

        if (!res.ok || !data.loans || data.loans.length === 0) {
            document.getElementById('emptyState').style.display = 'block';
            return;
        }

        document.getElementById('loansContent').style.display = 'block';

      renderStats(data.loans);

        // Pre-fetch EMI schedule for active/disbursed loans so next EMI strip shows immediately
        const activeLoans = data.loans.filter(l => ['active','disbursed'].includes(l.status));
        await Promise.all(activeLoans.map(async loan => {
            try {
                const emiRes  = await apiFetch(`/api/borrower/loans/${session.borrower_id}/emi/${loan.id}`);
                const emiData = await emiRes.json();
                if (emiData.emi_schedule) loan._emis = emiData.emi_schedule;
            } catch (e) { /* silent — strip just won't show */ }
        }));

        renderLoanCards(data.loans);

    } catch (e) {
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('emptyState').style.display   = 'block';
        console.error('Loans load error:', e);
    }
}

// ── Render stats strip ────────────────────────────────────────
function renderStats(loans) {
    const total    = loans.length;
   const active = loans.filter(l => ['active','disbursed'].includes(l.status)).length;
    const pending  = loans.filter(l => ['pending','applied','approved'].includes(l.status)).length;
    const rejected = loans.filter(l => l.status === 'rejected').length;

    const totalEMI = loans
        .filter(l => l.status === 'active')
        .reduce((sum, l) => sum + (l.emi_amount || 0), 0);

    document.getElementById('loanStatsStrip').innerHTML = `
        <div class="loan-stat">
            <div class="loan-stat-icon teal"><i class="ti ti-file-invoice"></i></div>
            <div>
                <div class="loan-stat-val">${total}</div>
                <div class="loan-stat-label">Total Applications</div>
            </div>
        </div>
        <div class="loan-stat">
            <div class="loan-stat-icon green"><i class="ti ti-rocket"></i></div>
            <div>
                <div class="loan-stat-val">${active}</div>
                <div class="loan-stat-label">Active Loans</div>
            </div>
        </div>
        <div class="loan-stat">
            <div class="loan-stat-icon orange"><i class="ti ti-clock"></i></div>
            <div>
                <div class="loan-stat-val">${pending}</div>
                <div class="loan-stat-label">Under Review</div>
            </div>
        </div>
        ${totalEMI > 0 ? `
        <div class="loan-stat">
            <div class="loan-stat-icon teal"><i class="ti ti-coin-rupee"></i></div>
            <div>
                <div class="loan-stat-val">${fmtINR(totalEMI)}</div>
                <div class="loan-stat-label">Monthly EMI</div>
            </div>
        </div>` : ''}
    `;
}

// ── Render loan cards ─────────────────────────────────────────
function renderLoanCards(loans) {
    const container = document.getElementById('loanCards');

    container.innerHTML = loans.map((loan, idx) => {
const logoHtml = loan.nbfc_logo
    ? `<img src="${loan.nbfc_logo}" alt="${loan.nbfc_name}"/>`
    : `<span>${(loan.nbfc_name || 'N').charAt(0).toUpperCase()}</span>`;

        const rejectionBox = loan.status === 'rejected' && loan.rejection_reason ? `
            <div class="rejection-box">
                <i class="ti ti-alert-circle"></i>
                <div><strong>Rejection Reason:</strong> ${loan.rejection_reason}</div>
            </div>` : '';

        const actions = buildActions(loan);
   const nextEmiStrip = (loan.status === 'active' || loan.status === 'disbursed') && loan._emis
            ? nextEmiHtml(loan._emis, loan.id)
            : '';

        const emiSection = (loan.status === 'active' || loan.status === 'disbursed')
            ? `<div class="emi-section" id="emi-section-${loan.id}">
                <div class="emi-section-title">
                    <i class="ti ti-calendar"></i> EMI Schedule
                    <button class="toggle-emi-btn" id="toggle-emi-${loan.id}"
                            onclick="toggleEMI(${loan.id})" style="margin-left:auto;">
                        <i class="ti ti-chevron-down"></i> Show schedule
                    </button>
                </div>
                <div id="emi-table-${loan.id}" style="display:none;"></div>
               </div>` : '';

        return `
        <div class="loan-card">
            <!-- Header -->
            <div class="loan-card-header">
                <div class="loan-card-header-left">
                    <div class="loan-card-nbfc-logo">${logoHtml}</div>
                    <div>
                        <div class="loan-card-nbfc-name">${loan.nbfc_name || '—'}</div>
                        <div class="loan-card-app-id">Application #${loan.id} · Applied ${fmtDate(loan.applied_at)}</div>
                    </div>
                </div>
                <div class="loan-card-header-right">
                    ${statusBadge(loan.status)}
                </div>
            </div>

            <!-- Body -->
            <div class="loan-card-body">
                <div class="loan-details-grid">
                    <div class="loan-detail-item">
                        <div class="loan-detail-label">Loan Amount</div>
                        <div class="loan-detail-val teal">${fmtINR(loan.amount)}</div>
                    </div>
                    <div class="loan-detail-item">
                        <div class="loan-detail-label">Monthly EMI</div>
                        <div class="loan-detail-val">${loan.emi_amount ? fmtINR(loan.emi_amount) : '—'}</div>
                    </div>
                    <div class="loan-detail-item">
                        <div class="loan-detail-label">Interest Rate</div>
                        <div class="loan-detail-val normal">${loan.interest_rate ? loan.interest_rate + '% p.a.' : '—'}</div>
                    </div>
                    <div class="loan-detail-item">
                        <div class="loan-detail-label">Tenure</div>
                        <div class="loan-detail-val normal">${loan.tenure_months ? loan.tenure_months + ' months' : '—'}</div>
                    </div>
                    <div class="loan-detail-item">
                        <div class="loan-detail-label">Total Payable</div>
                        <div class="loan-detail-val">${fmtINR(loan.total_payable)}</div>
                    </div>
                    <div class="loan-detail-item">
                        <div class="loan-detail-label">Total Interest</div>
                        <div class="loan-detail-val">${fmtINR(loan.total_interest)}</div>
                    </div>
                    <div class="loan-detail-item">
                        <div class="loan-detail-label">Processing Fee</div>
                        <div class="loan-detail-val">${fmtINR(loan.processing_fee_amount)}</div>
                    </div>
                    <div class="loan-detail-item">
                        <div class="loan-detail-label">Purpose</div>
                        <div class="loan-detail-val normal">${purposeLabel(loan.purpose)}</div>
                    </div>
                </div>
            </div>
            ${rejectionBox}
            ${nextEmiStrip}
            ${emiSection}


            <!-- Actions -->
            <div class="loan-card-actions">${actions}</div>
        </div>`;
    }).join('');
}

// ── Build action buttons per status ──────────────────────────
function buildActions(loan) {
    const viewAgreement = `
        <a class="loan-action-btn primary" href="/borrower/loans/agreement?id=${loan.id}">
            <i class="ti ti-file-description"></i> View Agreement
        </a>`;

    const browseBtn = `
        <a class="loan-action-btn" href="/borrower/nbfcs">
            <i class="ti ti-building-bank"></i> Browse Other Lenders
        </a>`;

    switch (loan.status) {
        case 'pending':
            return viewAgreement;
        case 'applied':
            return viewAgreement;
        case 'approved':
            return `${viewAgreement}
                <span style="font-size:12px;color:var(--teal-600);display:flex;align-items:center;gap:5px;">
                    <i class="ti ti-info-circle"></i> Sign the agreement to activate your loan
                </span>`;
        case 'active':
            return viewAgreement;
        case 'rejected':
            return `${viewAgreement}${browseBtn}`;
        case 'declined':
            return browseBtn;
        case 'closed':
            return viewAgreement;
        default:
            return viewAgreement;
    }
}

// ── Toggle EMI schedule ───────────────────────────────────────
async function toggleEMI(loanId) {
    const tableDiv = document.getElementById(`emi-table-${loanId}`);
    const toggleBtn = document.getElementById(`toggle-emi-${loanId}`);

    if (tableDiv.style.display !== 'none') {
        tableDiv.style.display = 'none';
        toggleBtn.innerHTML = '<i class="ti ti-chevron-down"></i> Show schedule';
        return;
    }

    toggleBtn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Loading…';

    try {
       const s    = getSession();
        const res  = await apiFetch(`/api/borrower/loans/${s.borrower_id}/emi/${loanId}`);
        const data = await res.json();

      if (!res.ok || !data.emi_schedule || data.emi_schedule.length === 0) {
            tableDiv.innerHTML = `<p style="font-size:13px;color:var(--text-muted);padding:12px 0;">No EMI schedule yet.</p>`;
            tableDiv.style.display = 'block';
            toggleBtn.innerHTML = '<i class="ti ti-chevron-up"></i> Hide schedule';
            return;
        }

        const paid    = data.emi_schedule.filter(e => e.status === 'paid').length;
        const total   =data.emi_schedule.length;
        const pct     = Math.round((paid / total) * 100);

        tableDiv.innerHTML = `
            <div class="emi-progress-wrap">
                <div class="emi-progress-info">
                    <span>${paid} of ${total} EMIs paid</span>
                    <span>${pct}% complete</span>
                </div>
                <div class="emi-progress-track">
                    <div class="emi-progress-fill" style="width:${pct}%;"></div>
                </div>
            </div>
            <div class="emi-table-wrap">
                <table class="emi-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Due Date</th>
                            <th>EMI Amount</th>
                            <th>Principal</th>
                            <th>Interest</th>
                         <th>Balance</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.emi_schedule.map(e => `
                            <tr>
                                <td style="color:var(--text-muted);font-size:12px;">${e.instalment_number}</td>
                                <td>${fmtDate(e.due_date)}</td>
                                <td style="font-family:var(--font-mono);font-weight:700;">${fmtINR(e.amount)}</td>
                                <td style="font-family:var(--font-mono);">${fmtINR(e.principal_component)}</td>
                                <td style="font-family:var(--font-mono);">${fmtINR(e.interest_component)}</td>
                                <td style="font-family:var(--font-mono);">${fmtINR(e.outstanding_balance)}</td>
                                <td>${emiStatusBadge(e.status)}</td>
                                <td>${buildEmiAction(e, loanId)}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;

        tableDiv.style.display = 'block';
        toggleBtn.innerHTML = '<i class="ti ti-chevron-up"></i> Hide schedule';

    } catch (e) {
        tableDiv.innerHTML = `<p style="font-size:13px;color:var(--error);padding:12px 0;">Failed to load EMI schedule.</p>`;
        tableDiv.style.display = 'block';
        toggleBtn.innerHTML = '<i class="ti ti-chevron-down"></i> Show schedule';
    }
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
        localStorage.setItem('sidebar_collapsed',
            sidebar.classList.contains('collapsed') ? '1' : '0');
    }
}

function handleLogout() {
    ['borrower_token','borrower_id','borrower_name','borrower_email',
     'borrower_mobile','borrower_aadhaar','borrower_pan',
     'borrower_kyc_status','borrower_score'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/borrower/login';
}
//const API = 'http://localhost:8000';
//
//// ── Session ───────────────────────────────────────────────────────────────────
//function getSession() {
//    const token = localStorage.getItem('borrower_token');
//    if (!token) return null;
//    return {
//        access_token: token,
//        borrower_id:  parseInt(localStorage.getItem('borrower_id')),
//        full_name:    localStorage.getItem('borrower_name') || '',
//        credit_score: parseInt(localStorage.getItem('borrower_score')) || null,
//    };
//}
//
//// ── On load ───────────────────────────────────────────────────────────────────
//window.addEventListener('DOMContentLoaded', async () => {
//    const session = getSession();
//    if (!session) { window.location.href = '/borrower/login'; return; }
//
//    // Fill topbar
//    const name = session.full_name || 'Borrower';
//    const userNameEl   = document.getElementById('userName');
//    const userAvatarEl = document.getElementById('userAvatar');
//    if (userNameEl)   userNameEl.textContent   = name;
//    if (userAvatarEl) userAvatarEl.textContent = name.charAt(0).toUpperCase();
//
//    await loadNBFCs(session);
//});
//
//// ── Load NBFCs ────────────────────────────────────────────────────────────────
//async function loadNBFCs(session) {
//    const container = document.getElementById('nbfcCards');
//    const warning   = document.getElementById('no-score-warning');
//
//    if (!session.credit_score) {
//        warning.style.display   = 'block';
//        container.style.display = 'none';
//        return;
//    }
//
//    container.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:13px;">Loading lenders…</div>';
//
//    try {
//        const res  = await fetch(`${API}/api/borrower/nbfcs?score=${session.credit_score}`, {
//            headers: { 'Authorization': `Bearer ${session.access_token}` }
//        });
//        const data = await res.json();
//
//        if (!res.ok) {
//            container.innerHTML = `<div style="padding:20px;color:var(--error);font-size:13px;">${data.detail || 'Failed to load lenders.'}</div>`;
//            return;
//        }
//
//        if (!data.nbfcs || data.nbfcs.length === 0) {
//            container.innerHTML = `
//                <div class="content-card">
//                    <div class="card-body-pad" style="text-align:center;padding:40px;">
//                        <i class="ti ti-building-bank" style="font-size:40px;color:var(--teal-200);margin-bottom:12px;display:block;"></i>
//                        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">No lenders available yet</div>
//                        <div style="font-size:13px;color:var(--text-secondary);">
//                            No NBFCs currently match your score of ${session.credit_score}. Check back soon.
//                        </div>
//                    </div>
//                </div>`;
//            return;
//        }
//
//        container.innerHTML = data.nbfcs.map(n => `
//            <div class="nbfc-card">
//                <div class="nbfc-logo-box">
//                    ${n.logo_url
//                        ? `<img src="${n.logo_url}" alt="${esc(n.company_name)}"/>`
//                        : n.company_name.charAt(0).toUpperCase()
//                    }
//                </div>
//                <div class="nbfc-info">
//                    <div class="nbfc-name">${esc(n.company_name)}</div>
//                    <div class="nbfc-meta">
//                        <div class="nbfc-meta-item"><i class="ti ti-percentage"></i><strong>${n.interest_rate}%</strong> p.a.</div>
//                        <div class="nbfc-meta-item"><i class="ti ti-coin-rupee"></i>Up to <strong>₹${fmtNum(n.max_loan_amount)}</strong></div>
//                        <div class="nbfc-meta-item"><i class="ti ti-calendar"></i><strong>${n.min_tenure_months}–${n.max_tenure_months}</strong> months</div>
//                        <div class="nbfc-meta-item"><i class="ti ti-receipt"></i>Processing fee: <strong>${n.processing_fee}%</strong></div>
//                    </div>
//                    <div class="nbfc-eligible">
//                        <i class="ti ti-circle-check"></i> Eligible · Min score required: ${n.min_credit_score}
//                    </div>
//                </div>
//                <button class="nbfc-apply-btn" onclick="applyToNBFC(${n.id}, '${esc(n.company_name)}', ${n.interest_rate})">
//                    <i class="ti ti-arrow-right"></i> Apply
//                </button>
//            </div>`
//        ).join('');
//
//    } catch (err) {
//        container.innerHTML = `<div style="padding:20px;color:var(--error);font-size:13px;">Cannot connect to server.</div>`;
//    }
//}
//
//// ── Apply ─────────────────────────────────────────────────────────────────────
//function applyToNBFC(nbfcId, nbfcName, interestRate) {
//    localStorage.setItem('selected_nbfc_id',       nbfcId);
//    localStorage.setItem('selected_nbfc_name',     nbfcName);
//    localStorage.setItem('selected_nbfc_interest', interestRate);
//    window.location.href = '/borrower/loans';
//}
//
//// ── Logout ────────────────────────────────────────────────────────────────────
//function handleLogout() {
//    ['borrower_token','borrower_id','borrower_name','borrower_email',
//     'borrower_mobile','borrower_aadhaar','borrower_pan',
//     'borrower_kyc_status','borrower_score'].forEach(k => localStorage.removeItem(k));
//    window.location.href = '/borrower/login';
//}
//
//// ── Helpers ───────────────────────────────────────────────────────────────────
//function fmtNum(n) {
//    if (!n && n !== 0) return '0';
//    return Number(n).toLocaleString('en-IN');
//}
//
//function esc(str) {
//    if (!str) return '';
//    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
//}
//
//// ── Sidebar toggle ────────────────────────────────────────────────────────────
//function toggleSidebar() {
//    const sidebar = document.getElementById('sidebar');
//    const overlay = document.getElementById('sidebarOverlay');
//    if (window.innerWidth <= 768) {
//        sidebar.classList.toggle('mobile-open');
//        if (overlay) overlay.classList.toggle('show');
//    } else {
//        sidebar.classList.toggle('collapsed');
//    }
//}

const API = 'http://localhost:8000';

// ── Session ───────────────────────────────────────────────────────────────────
function getSession() {
    const token = localStorage.getItem('borrower_token');
    if (!token) return null;
    return {
        access_token: token,
        borrower_id:  parseInt(localStorage.getItem('borrower_id')),
        full_name:    localStorage.getItem('borrower_name') || '',
        credit_score: parseInt(localStorage.getItem('borrower_score')) || null,
    };
}

// ── On load ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    const session = getSession();
    if (!session) { window.location.href = '/borrower/login'; return; }

    // Fill topbar
     const name = session.full_name || 'Borrower';
    const userNameEl   = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    if (userNameEl)   userNameEl.textContent   = name;
    if (userAvatarEl) userAvatarEl.textContent = name.charAt(0).toUpperCase();

    // ── Check existing loan FIRST before rendering anything ──────
    try {
        const loanRes  = await fetch(`${API}/api/borrower/my-loan`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const loanData = await loanRes.json();

if (loanData.loan) {
            const loan = loanData.loan;
            window._myLoan = loan;
            if (['pending', 'applied', 'approved', 'active', 'disbursed'].includes(loan.status)) {
                window.location.href = `/borrower/loans/agreement?id=${loan.id}`;
                return;
            }
        }
    } catch (e) { /* no loan or error — proceed to show NBFCs */ }

    await loadNBFCs(session);
});


// ── Accent colors per card (cycles through palette) ──────────────────────────
const CARD_ACCENTS = [
    { accent: '#e67e22', logoBg: '#fef3e2', logoColor: '#e67e22', logoBorder: '#fde0b0' },
    { accent: '#8e44ad', logoBg: '#f4eafe', logoColor: '#8e44ad', logoBorder: '#d7aefb' },
    { accent: '#0e8c6a', logoBg: '#f0fdf9', logoColor: '#0e8c6a', logoBorder: '#9fe1cb' },
    { accent: '#2471a3', logoBg: '#eaf4fb', logoColor: '#2471a3', logoBorder: '#a9d0f5' },
    { accent: '#c0392b', logoBg: '#fef0ee', logoColor: '#c0392b', logoBorder: '#f5b7b1' },
    { accent: '#1a7a4a', logoBg: '#eafaf1', logoColor: '#1a7a4a', logoBorder: '#a9dfbf' },
];

// ── Load NBFCs ────────────────────────────────────────────────────────────────
async function loadNBFCs(session) {
    const container = document.getElementById('nbfcCards');
    const warning   = document.getElementById('no-score-warning');

    if (!session.credit_score) {
        warning.style.display   = 'block';
        container.style.display = 'none';
        return;
    }

    // Score banner
    const wrap = document.getElementById('nbfc-list-wrap');
    const banner = document.createElement('div');
    banner.className = 'score-banner';
    banner.innerHTML = `
        <div class="score-banner-left">
            <div class="score-banner-num">${session.credit_score}</div>
            <div class="score-banner-text">
                <strong>Your Credit Score</strong>
                Eligible lenders are highlighted. Locked lenders require a higher score.
            </div>
        </div>
        <span style="font-size:12px;color:var(--text-muted);">
            <i class="ti ti-info-circle"></i> Results filtered to your score
        </span>`;
    wrap.insertBefore(banner, container);

container.innerHTML = '<div style="padding:20px;color:var(--text-muted);font-size:13px;">Loading lenders…</div>';

// ── Use cached loan from DOMContentLoaded ────────────────────
    if (window._myLoan) {
        const loan = window._myLoan;
        if (['pending', 'applied', 'approved', 'active'].includes(loan.status)) {
            window.location.href = `/borrower/loans/agreement?id=${loan.id}`;
            return;
        }
     if (loan.status === 'rejected') {
            showExistingLoan(loan, wrap, container, banner);
            return;
        }
        if (loan.status === 'closed') {
            showExistingLoan(loan, wrap, container, banner);
            return;
        }
        // declined — fall through to show NBFC list so borrower can reapply
    }

    try {
        const res  = await fetch(`${API}/api/borrower/nbfcs?score=${session.credit_score}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await res.json();

        if (!res.ok) {
            container.innerHTML = `<div style="padding:20px;color:var(--error);font-size:13px;">${data.detail || 'Failed to load lenders.'}</div>`;
            return;
        }

        if (!data.nbfcs || data.nbfcs.length === 0) {
            container.innerHTML = `
                <div class="content-card nbfc-empty">
                    <div class="card-body-pad" style="text-align:center;padding:40px;">
                        <i class="ti ti-building-bank" style="font-size:40px;color:var(--teal-200);margin-bottom:12px;display:block;"></i>
                        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">No lenders available yet</div>
                        <div style="font-size:13px;color:var(--text-secondary);">
                            No NBFCs currently match your score of ${session.credit_score}. Check back soon.
                        </div>
                    </div>
                </div>`;
            return;
        }

container.innerHTML = data.nbfcs.map((n, i) => {
    const eligible = n.eligible;
    const c        = CARD_ACCENTS[i % CARD_ACCENTS.length];
    const initials = n.company_name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
    const logo     = n.logo_url
        ? `<img src="${n.logo_url}" alt="${esc(n.company_name)}"/>`
        : initials;

    const badge = eligible
        ? `<span class="nbfc-eligible"><i class="ti ti-circle-check"></i> Eligible · ${n.min_credit_score}+</span>`
        : `<span class="nbfc-min-score"><i class="ti ti-lock"></i> Needs ${n.min_credit_score}+</span>`;

    const applyBtn = eligible
        ? `<button class="nbfc-apply-btn"
               onclick="applyToNBFC(${n.id}, '${esc(n.company_name)}', ${n.interest_rate})">
               Apply
           </button>`
        : `<button class="nbfc-apply-btn nbfc-apply-btn--disabled" disabled
               title="Your score of ${session.credit_score} is below the minimum ${n.min_credit_score} required">
               <i class="ti ti-lock"></i> Locked
           </button>`;

    const cardStyle = eligible
        ? `--card-accent:${c.accent};--logo-bg:${c.logoBg};--logo-color:${c.logoColor};--logo-border:${c.logoBorder};`
        : '';   // disabled cards use greyed-out CSS vars

    return `
    <div class="nbfc-card${eligible ? '' : ' nbfc-card--disabled'}" style="${cardStyle}">
        <div class="nbfc-card-top">
            <div class="nbfc-logo-box">${logo}</div>
            <div class="nbfc-name">${esc(n.company_name)}</div>
        </div>
        <div class="nbfc-rate">${n.interest_rate}%<span>p.a.</span></div>
        <div class="nbfc-meta-line">
            <span>&#8377;${fmtNum(n.max_loan_amount)}</span>
            <span class="dot">·</span>
            <span>${n.min_tenure_months}–${n.max_tenure_months} mo</span>
            <span class="dot">·</span>
            <span>Fee ${n.processing_fee}%</span>
        </div>
        <div class="nbfc-card-bottom">
            ${badge}
            ${applyBtn}
        </div>
    </div>`;
}).join('');

    } catch (err) {
        container.innerHTML = `<div style="padding:20px;color:var(--error);font-size:13px;">Cannot connect to server.</div>`;
    }
}

// ── Show existing loan instead of NBFC list ───────────────────────────────────
function showExistingLoan(loan, wrap, container, banner) {
    const statusMap = {
        pending:  { label: 'Awaiting Review',    cls: 'pending',  icon: 'ti-clock-hour-4',   desc: 'Your agreement has been generated. Please review and accept it.' },
        applied:  { label: 'Under Review',        cls: 'applied',  icon: 'ti-loader-2',        desc: 'Your application has been submitted and is under review by the lender.' },
        approved: { label: 'Approved!',           cls: 'approved', icon: 'ti-circle-check',   desc: 'Your loan has been approved. Sign the agreement to get disbursed.' },
        active:   { label: 'Loan Active',         cls: 'active',   icon: 'ti-rocket',         desc: 'Your loan is active. EMI payments are scheduled.' },
    };
    const s = statusMap[loan.status] || statusMap['applied'];

    const purposeMap = {
        personal: 'Personal Use', medical: 'Medical Emergency',
        education: 'Education', home_renovation: 'Home Renovation',
        business: 'Business', vehicle: 'Vehicle Purchase',
        travel: 'Travel', wedding: 'Wedding',
        debt_consolidation: 'Debt Consolidation', other: 'Other',
    };

    const fmtINR = n => '₹' + Math.round(n).toLocaleString('en-IN');
    const fmtDate = iso => new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });

    // Replace container with existing loan card
    container.innerHTML = `
        <div class="existing-loan-card">

            <!-- Status banner -->
            <div class="elc-status ${s.cls}">
                <i class="ti ${s.icon}"></i>
                <div>
                    <strong>${s.label}</strong>
                    <span>${s.desc}</span>
                </div>
            </div>

            <!-- Loan details grid -->
            <div class="elc-grid">
                <div class="elc-item">
                    <span class="elc-label">Lender</span>
                    <span class="elc-val elc-strong">${loan.nbfc_name}</span>
                </div>
                <div class="elc-item">
                    <span class="elc-label">Loan Amount</span>
                    <span class="elc-val elc-strong">${fmtINR(loan.amount)}</span>
                </div>
                <div class="elc-item">
                    <span class="elc-label">Interest Rate</span>
                    <span class="elc-val">${loan.interest_rate}% p.a.</span>
                </div>
                <div class="elc-item">
                    <span class="elc-label">Tenure</span>
                    <span class="elc-val">${loan.tenure_months} months</span>
                </div>
                <div class="elc-item">
                    <span class="elc-label">Monthly EMI</span>
                    <span class="elc-val elc-teal elc-strong">${fmtINR(loan.emi_amount)}</span>
                </div>
                <div class="elc-item">
                    <span class="elc-label">Total Payable</span>
                    <span class="elc-val">${fmtINR(loan.total_payable)}</span>
                </div>
                <div class="elc-item">
                    <span class="elc-label">Purpose</span>
                    <span class="elc-val">${purposeMap[loan.purpose] || loan.purpose}</span>
                </div>
                <div class="elc-item">
                    <span class="elc-label">Applied On</span>
                    <span class="elc-val">${fmtDate(loan.applied_at)}</span>
                </div>
            </div>

            <!-- Action buttons -->
            <div class="elc-actions">
                <a href="/borrower/loans/agreement?id=${loan.id}" class="elc-btn-primary">
                    <i class="ti ti-file-description"></i> View Agreement
                </a>
                <a href="/borrower/loans" class="elc-btn-secondary">
                    <i class="ti ti-file-invoice"></i> My Loans
                </a>
            </div>

        </div>`;
}

// ── Apply ─────────────────────────────────────────────────────────────────────
function applyToNBFC(nbfcId, nbfcName, interestRate, rateNotice) {
    localStorage.setItem('selected_nbfc_id',       nbfcId);
    localStorage.setItem('selected_nbfc_name',     nbfcName);
    localStorage.setItem('selected_nbfc_interest', interestRate);
    localStorage.setItem('selected_nbfc_notice',   rateNotice || '');
    window.location.href = '/borrower/loans/apply';
}

// ── Logout ────────────────────────────────────────────────────────────────────
function handleLogout() {
    ['borrower_token','borrower_id','borrower_name','borrower_email',
     'borrower_mobile','borrower_aadhaar','borrower_pan',
     'borrower_kyc_status','borrower_score'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/borrower/login';
}

function esc(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Sidebar toggle ────────────────────────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
        if (overlay) overlay.classList.toggle('show');
    } else {
        sidebar.classList.toggle('collapsed');
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtNum(n) {
    if (!n && n !== 0) return '0';
    const num = Number(n);
    if (num >= 10000000) return (num / 10000000).toFixed(num % 10000000 === 0 ? 0 : 1) + 'Cr';
    if (num >= 100000)   return (num / 100000).toFixed(num % 100000 === 0 ? 0 : 1) + 'L';
    if (num >= 1000)     return (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + 'K';
    return num.toLocaleString('en-IN');
}
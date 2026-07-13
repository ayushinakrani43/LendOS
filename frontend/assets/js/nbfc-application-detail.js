// ═══════════════════════════════════════════════════════════════
//  nbfc-application-detail.js  —  LendOS NBFC Application Detail
// ═══════════════════════════════════════════════════════════════

const API = window.API_BASE || window.location.origin;

let loanId  = null;
let nbfcId  = null;
let loanData = null;  // cached full detail

// ── Session ───────────────────────────────────────────────────
function getSession() {
    const token = localStorage.getItem('nbfc_token');
    if (!token) return null;
    return {
        access_token: token,
        nbfc_id:      parseInt(localStorage.getItem('nbfc_id')),
        nbfc_name:    localStorage.getItem('nbfc_name') || '',
    };
}

// ── Helpers ───────────────────────────────────────────────────
function fmtINR(n) {
    if (!n && n !== 0) return '—';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
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

function employmentLabel(raw) {
    const map = {
        salaried:                      'Salaried',
        'self_employed_business':      'Self Employed — Business',
        'self_employed_professional':  'Self Employed — Professional',
    };
    return map[raw] || (raw || '—');
}

function kycBadge(status) {
    const map = {
        verified:  ['#0e8c6a', '#f0fdf9', '✓ Verified'],
        submitted: ['#d97706', '#fffbeb', '⏳ Submitted'],
        pending:   ['#94a3b8', '#f8fafc', '○ Pending'],
    };
    const [color, bg, label] = map[status] || ['#94a3b8', '#f8fafc', status || '—'];
    return `<span style="background:${bg};color:${color};border:1px solid ${color}33;
        border-radius:99px;padding:2px 10px;font-size:11.5px;font-weight:600;">
        ${label}</span>`;
}

function scoreGradeInfo(score) {
    if (!score) return { grade: '—', action: '—', cls: '' };
    if (score >= 750) return { grade: 'Excellent',  action: 'High approval chance',       cls: 'excellent' };
    if (score >= 650) return { grade: 'Good',       action: 'Likely to be approved',      cls: 'good' };
    if (score >= 550) return { grade: 'Fair',       action: 'Conditional approval',       cls: 'fair' };
    if (score >= 450) return { grade: 'Poor',       action: 'Low approval chance',        cls: 'poor' };
    return               { grade: 'Very Poor', action: 'Auto-reject recommended',   cls: 'poor' };
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent   = msg;
    t.className     = `toast ${type}`;
    t.style.display = 'flex';
    setTimeout(() => { t.style.display = 'none'; }, 3500);
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
    nbfcId = session.nbfc_id;

    // Fill topbar + sidebar
    const name = session.nbfc_name || 'NBFC';
    document.getElementById('topNbfcName').textContent     = name;
    document.getElementById('companyAvatar').textContent   = name.charAt(0).toUpperCase();
    document.getElementById('sidebarAvatar').textContent   = name.charAt(0).toUpperCase();
    document.getElementById('sidebarNbfcName').textContent = name;

    // Restore sidebar state
    if (localStorage.getItem('nbfc_sidebar_collapsed') === '1' && window.innerWidth > 768) {
        document.getElementById('sidebar')?.classList.add('collapsed');
    }

    // Get loan ID from URL: /nbfc/applications/123
    const parts = window.location.pathname.split('/');
    loanId = parseInt(parts[parts.length - 1]);
    if (!loanId) {
        showLoadError('Invalid application ID in URL.');
        return;
    }

    await loadDetail(session);
});

// ── Load detail ───────────────────────────────────────────────
async function loadDetail(session) {
    try {
       const res = await fetch(
    `${API}/api/nbfc/dashboard/loans/${session.nbfc_id}/detail/${loanId}`,
    { headers: { 'Authorization': `Bearer ${session.access_token}` } }
);

        if (res.status === 404) { showLoadError('Application not found.'); return; }
        if (!res.ok)            { showLoadError('Failed to load application.'); return; }

        loanData = await res.json();
        renderDetail(loanData, session);

    } catch (e) {
        console.error(e);
        showLoadError('Cannot connect to server.');
    }
}

// ── Render ────────────────────────────────────────────────────
function renderDetail(d, session) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('mainContent').style.display  = 'block';

    // ── Page header ──
    document.getElementById('pageTitle').textContent    = `Application #LA-${String(d.id).padStart(4,'0')}`;
    document.getElementById('pageSubtitle').textContent = `${d.full_name} · Applied ${fmtDate(d.applied_at)}`;

    // ── Decision banner ──
//    if (d.status === 'approved' || d.status === 'active' || d.status === 'closed') {
//        const banner = document.getElementById('decisionBanner');
//        banner.className = 'decision-banner approved';
//        banner.style.display = 'flex';
//        document.getElementById('decisionBannerIcon').className = 'ti ti-circle-check decision-banner-icon';
//        document.getElementById('decisionBannerTitle').textContent = 'Application Approved';
//        document.getElementById('decisionBannerSub').textContent   = 'This application has been approved.';
//    }

if (d.status === 'approved' || d.status === 'active' || d.status === 'disbursed' || d.status === 'closed') {
    const banner = document.getElementById('decisionBanner');
    banner.className = 'decision-banner approved';
    banner.style.display = 'flex';
    document.getElementById('decisionBannerIcon').className = 'ti ti-circle-check decision-banner-icon';
    document.getElementById('decisionBannerTitle').textContent = 'Application Approved';
    document.getElementById('decisionBannerSub').textContent   = 'This application has been approved.';
}

// Show disbursement card when active
if (d.status === 'active' || d.status === 'disbursed') {
    document.getElementById('disbursCard').style.display = 'block';

    let bank = {};
    try {
        bank = typeof d.bank_data === 'string'
            ? JSON.parse(d.bank_data)
            : (d.bank_data || {});
    } catch(e) { bank = {}; }

    document.getElementById('disBankName').textContent = bank.bank_name     || '—';
    document.getElementById('disAccNo').textContent    = bank.account_number ? 'XXXXXX' + String(bank.account_number).slice(-4) : '—';
    document.getElementById('disIfsc').textContent     = bank.ifsc_code      || '—';
    document.getElementById('disAmount').textContent   = d.amount_disbursed  ? `₹${fmtINR(d.amount_disbursed)}` : `₹${fmtINR(d.amount)}`;
}

// Show disbursed confirmation
if (d.status === 'disbursed') {
    document.getElementById('disbursCard').style.display  = 'block';
    document.getElementById('disForm').style.display      = 'none';
    document.getElementById('disConfirm').style.display   = 'block';
    document.getElementById('confirmedUtr').textContent   = d.utr_number        || '—';
    document.getElementById('confirmedMode').textContent  = d.disbursement_mode || '—';
    document.getElementById('confirmedDate').textContent  = d.disbursed_at ? new Date(d.disbursed_at).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'}) : '—';
}
    else if (d.status === 'rejected') {
        const banner = document.getElementById('decisionBanner');
        banner.className = 'decision-banner rejected';
        banner.style.display = 'flex';
        document.getElementById('decisionBannerIcon').className = 'ti ti-x-circle decision-banner-icon';
        document.getElementById('decisionBannerTitle').textContent = 'Application Rejected';
        document.getElementById('decisionBannerSub').textContent   = d.rejection_reason || '';
    }

    // ── Show action buttons + decision card for pending/applied ──
    const canDecide = d.status === 'applied' || d.status === 'pending';
    if (canDecide) {
        document.getElementById('headerActions').style.display = 'flex';
        document.getElementById('decisionCard').style.display  = 'block';
    }

    // ── Show rejection reason card ──
    if (d.status === 'rejected' && d.rejection_reason) {
        document.getElementById('rejectionCard').style.display = 'block';
        document.getElementById('rejectionReasonText').textContent = d.rejection_reason;
    }

    // ── Borrower info ──
    const initials = (d.full_name || '?').split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase();
    document.getElementById('borrowerAvatar').textContent    = initials;
    document.getElementById('borrowerName').textContent      = d.full_name || '—';
    document.getElementById('borrowerMobile').innerHTML      = `<i class="ti ti-phone"></i> ${d.mobile || '—'}`;
    document.getElementById('borrowerEmail').innerHTML       = `<i class="ti ti-mail"></i> ${d.email || '—'}`;
    document.getElementById('borrowerPan').textContent       = d.pan_number || '—';
    document.getElementById('borrowerAadhaar').textContent   = d.aadhaar_number
        ? 'XXXX-XXXX-' + String(d.aadhaar_number).slice(-4)
        : '—';
    document.getElementById('borrowerDob').textContent       = d.date_of_birth || '—';
    document.getElementById('borrowerGender').textContent    = d.gender || '—';
    document.getElementById('borrowerEmployment').textContent = employmentLabel(d.employment_type);
    document.getElementById('borrowerKyc').innerHTML         = kycBadge(d.kyc_status);
    document.getElementById('borrowerAddress').textContent   = d.address || '—';

    // ── Credit score ──
    const scoreInfo = scoreGradeInfo(d.credit_score);
    document.getElementById('scoreNum').textContent    = d.credit_score || '—';
    document.getElementById('scoreGrade').textContent  = scoreInfo.grade;
    document.getElementById('scoreAction').textContent = scoreInfo.action;
    const circle = document.getElementById('scoreCircle');
    if (scoreInfo.cls) circle.classList.add(scoreInfo.cls);

// ── Bank summary ──
    document.getElementById('bankIncome').textContent      = fmtINR(d.monthly_income);
    document.getElementById('bankExistingEmi').textContent = fmtINR(d.existing_emis);
    const foirPct = d.foir_at_application;
    document.getElementById('bankFoir').textContent = foirPct ? foirPct.toFixed(1) + '%' : '—';

    // ── Bank data (from bank_data JSON column) ────────────────────
    let bankData = null;
    try {
        bankData = typeof d.bank_data === 'string'
            ? JSON.parse(d.bank_data)
            : d.bank_data;
    } catch (e) {}

   document.getElementById('bankAvgBalance').textContent =
        bankData?.avg_closing_balance ? fmtINR(bankData.avg_closing_balance) : '—';
    document.getElementById('bankTotalCredits').textContent =
        bankData?.total_credits ? fmtINR(bankData.total_credits) : '—';
    document.getElementById('bankTotalDebits').textContent =
        bankData?.total_debits ? fmtINR(bankData.total_debits) : '—';

    // Bounce count — highlight red if > 0
    const bounceEl    = document.getElementById('bankBounceCount');
    const bounceCount = bankData?.bounce_count ?? '—';
    bounceEl.textContent = bounceCount;
    if (bounceCount > 0) {
        bounceEl.style.color      = '#ef4444';
        bounceEl.style.fontWeight = '700';
    }

    // ── Loan details ──
    document.getElementById('loanAmount').textContent       = fmtINR(d.amount);
    document.getElementById('loanTenure').textContent       = `${d.tenure_months} months`;
    document.getElementById('loanRate').textContent         = `${d.interest_rate}% p.a.`;
    document.getElementById('loanEmi').textContent          = fmtINR(d.emi_amount) + '/mo';
    document.getElementById('loanTotalInterest').textContent = fmtINR(d.total_interest);
    document.getElementById('loanTotalPayable').textContent  = fmtINR(d.total_payable);
    document.getElementById('loanFee').textContent           = fmtINR(d.processing_fee_amount);
    document.getElementById('loanDisbursed').textContent     = fmtINR(d.amount_disbursed);
    document.getElementById('loanPurpose').textContent       = purposeLabel(d.purpose);
    document.getElementById('loanAppliedAt').textContent     = fmtDate(d.applied_at);

    // ── Affordability ──
    renderAffordability(d, session);
}

// ── Affordability bar ─────────────────────────────────────────
async function renderAffordability(d, session) {
    // Get NBFC FOIR limit from localStorage or fetch profile
    let foirLimit = parseFloat(localStorage.getItem('nbfc_max_foir')) || 50;

    document.getElementById('affordIncome').textContent   = fmtINR(d.monthly_income);
    document.getElementById('affordExisting').textContent = fmtINR(d.existing_emis);
    document.getElementById('affordFoirLimit').textContent = foirLimit + '%';
    document.getElementById('affordBarLimitLabel').textContent = `Limit ${foirLimit}%`;

    // Position the limit marker
    document.getElementById('affordBarMarker').style.left = Math.min(foirLimit, 100) + '%';

    const foir     = d.foir_at_application;
    const barWidth = foir ? Math.min(foir, 100) : 0;

    document.getElementById('affordFoirUsed').textContent = foir ? foir.toFixed(1) + '%' : '—';
    document.getElementById('affordBarFill').style.width  = barWidth + '%';

    const fill    = document.getElementById('affordBarFill');
    const verdict = document.getElementById('affordVerdict');

    if (!foir) {
        fill.style.background = '#cbd5e1';
        verdict.className     = 'afford-verdict';
        verdict.textContent   = 'FOIR data not available for this application.';
        return;
    }

    if (foir <= foirLimit) {
        fill.style.background = '#10b981';
        verdict.className     = 'afford-verdict safe';
        verdict.innerHTML     = `<i class="ti ti-circle-check"></i> FOIR ${foir.toFixed(1)}% is within safe limit of ${foirLimit}%`;
    } else if (foir <= foirLimit + 10) {
        fill.style.background = '#f59e0b';
        verdict.className     = 'afford-verdict warn';
        verdict.innerHTML     = `<i class="ti ti-alert-triangle"></i> FOIR ${foir.toFixed(1)}% slightly exceeds limit of ${foirLimit}%`;
    } else {
        fill.style.background = '#ef4444';
        verdict.className     = 'afford-verdict danger';
        verdict.innerHTML     = `<i class="ti ti-x"></i> FOIR ${foir.toFixed(1)}% exceeds safe limit of ${foirLimit}%`;
    }
}

// ── Approve ───────────────────────────────────────────────────
async function approveApplication() {
    if (!confirm(`Approve this loan application for ${loanData?.full_name}?`)) return;

    const session = getSession();
    if (!session) return;

    const btn = document.getElementById('headerActions')?.querySelector('.btn-approve');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i> Approving…'; }

try {
        const res = await fetch(`${API}/api/nbfc/dashboard/loans/${loanId}/approve`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ notes: null })
        });

        const data = await res.json();
        if (!res.ok) {
            showToast(data.detail || 'Approval failed.', 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-circle-check"></i> Approve'; }
            return;
        }

        showToast('✓ Application approved successfully!', 'success');

        // Update UI
        document.getElementById('headerActions').style.display = 'none';
        document.getElementById('decisionCard').style.display  = 'none';

        const banner = document.getElementById('decisionBanner');
        banner.className = 'decision-banner approved';
        banner.style.display = 'flex';
        document.getElementById('decisionBannerIcon').className = 'ti ti-circle-check decision-banner-icon';
        document.getElementById('decisionBannerTitle').textContent = 'Application Approved';
        document.getElementById('decisionBannerSub').textContent   = 'Loan has been approved successfully.';

        // Redirect after short delay
        setTimeout(() => { window.location.href = '/nbfc/applications'; }, 2000);

    } catch (e) {
        showToast('Cannot connect to server.', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-circle-check"></i> Approve'; }
    }
}

// ── Reject modal ──────────────────────────────────────────────
function openRejectModal() {
    document.getElementById('rejectModal').style.display = 'flex';
    document.getElementById('rejectReasonInput').value   = '';
    setTimeout(() => document.getElementById('rejectReasonInput').focus(), 100);
}

function closeRejectModal(event) {
    if (event && event.target !== document.getElementById('rejectModal')) return;
    document.getElementById('rejectModal').style.display = 'none';
}

function setReason(text) {
    document.getElementById('rejectReasonInput').value = text;
    document.getElementById('rejectReasonInput').focus();
}

async function confirmReject() {
    const reason = document.getElementById('rejectReasonInput').value.trim();
    if (!reason) {
        document.getElementById('rejectReasonInput').style.borderColor = '#ef4444';
        document.getElementById('rejectReasonInput').focus();
        return;
    }
    document.getElementById('rejectReasonInput').style.borderColor = '';

    const session = getSession();
    if (!session) return;

    const confirmBtn = document.querySelector('.btn-reject-confirm');
    confirmBtn.disabled  = true;
    confirmBtn.innerHTML = '<i class="ti ti-loader-2"></i> Rejecting…';

try {
        const res = await fetch(`${API}/api/nbfc/dashboard/loans/${loanId}/reject`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({ rejection_reason: reason })
        });

        const data = await res.json();
        if (!res.ok) {
            showToast(data.detail || 'Rejection failed.', 'error');
            confirmBtn.disabled  = false;
            confirmBtn.innerHTML = '<i class="ti ti-x-circle"></i> Confirm Rejection';
            return;
        }

        // Close modal
        document.getElementById('rejectModal').style.display = 'none';
        showToast('Application rejected.', 'success');

        // Update UI
        document.getElementById('headerActions').style.display = 'none';
        document.getElementById('decisionCard').style.display  = 'none';

        const banner = document.getElementById('decisionBanner');
        banner.className = 'decision-banner rejected';
        banner.style.display = 'flex';
        document.getElementById('decisionBannerIcon').className = 'ti ti-x-circle decision-banner-icon';
        document.getElementById('decisionBannerTitle').textContent = 'Application Rejected';
        document.getElementById('decisionBannerSub').textContent   = reason;

        document.getElementById('rejectionCard').style.display   = 'block';
        document.getElementById('rejectionReasonText').textContent = reason;

        setTimeout(() => { window.location.href = '/nbfc/applications'; }, 2000);

    } catch (e) {
        showToast('Cannot connect to server.', 'error');
        confirmBtn.disabled  = false;
        confirmBtn.innerHTML = '<i class="ti ti-x-circle"></i> Confirm Rejection';
    }
}

// ── Error state ───────────────────────────────────────────────
function showLoadError(msg) {
    document.getElementById('loadingState').innerHTML = `
        <i class="ti ti-alert-triangle" style="font-size:32px;display:block;margin-bottom:12px;color:#f59e0b;"></i>
        <div style="font-size:14px;">${msg}</div>
        <a href="/nbfc/applications" style="display:inline-block;margin-top:14px;color:var(--teal-600);font-size:13px;">
            ← Back to Applications
        </a>`;
}

// ── Sidebar ───────────────────────────────────────────────────
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
async function markDisbursed() {
    const session = getSession();
    if (!session) { window.location.href = '/nbfc/login'; return; }
    const utr  = document.getElementById('utrInput').value.trim();
    const mode = document.getElementById('disMode').value;

if (!utr) { showToast('Please enter UTR number.', 'error'); return; }
    if (!mode) { showToast('Please select transfer mode.', 'error'); return; }

    // ── UTR format validation per transfer mode ───────────────
    const utrUpper = utr.toUpperCase();
    document.getElementById('utrInput').value = utrUpper;

    const modePatterns = {
        NEFT:   [/^[A-Z]{4}\d{12}$/, /^[A-Z]{4}[A-Z0-9]{12}$/],
        RTGS:   [/^[A-Z]{4}[A-Z0-9]{16,22}$/],
        IMPS:   [/^\d{12}$/],
        UPI:    [/^\d{12}$/],
        CHEQUE: [/^[A-Z0-9]{6,20}$/],
    };
    const modeHints = {
        NEFT:   'NEFT UTR must be 16 chars — e.g. HDFC2260012345',
        RTGS:   'RTGS UTR must be 16–22 alphanumeric chars',
        IMPS:   'IMPS UTR must be exactly 12 digits',
        UPI:    'UPI transaction ID must be exactly 12 digits',
        CHEQUE: 'Cheque number must be 6–20 alphanumeric characters',
    };
    const patterns = modePatterns[mode];
    if (patterns && !patterns.some(p => p.test(utrUpper))) {
        showToast(modeHints[mode] || 'Invalid UTR format.', 'error');
        return;
    }

    const btn = document.querySelector('#disForm .btn-approve-full');
    btn.disabled  = true;
    btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Processing…';

    try {
      const res = await fetch(`${API}/api/nbfc/dashboard/loans/${loanId}/disburse?nbfc_id=${session.nbfc_id}`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body:    JSON.stringify({ utr_number: utr, disbursement_mode: mode })
        });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.detail || 'Disbursement failed.', 'error');
            btn.disabled  = false;
            btn.innerHTML = '<i class="ti ti-check"></i> Mark as Disbursed';
            return;
        }

        showToast('Loan marked as disbursed successfully!', 'success');

        // Show confirmation
        document.getElementById('disForm').style.display    = 'none';
        document.getElementById('disConfirm').style.display = 'block';
        document.getElementById('confirmedUtr').textContent  = utr;
        document.getElementById('confirmedMode').textContent = mode;
        document.getElementById('confirmedDate').textContent = new Date().toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'});

    } catch(err) {
        showToast('Cannot connect to server.', 'error');
        btn.disabled  = false;
        btn.innerHTML = '<i class="ti ti-check"></i> Mark as Disbursed';
    }
}
// ── Logout ────────────────────────────────────────────────────
function handleLogout() {
    ['nbfc_token','nbfc_id','nbfc_name','nbfc_email','nbfc_max_foir']
        .forEach(k => localStorage.removeItem(k));
    window.location.href = '/nbfc/register';
}
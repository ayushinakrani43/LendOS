
const API = window.location.origin;

// ── Session ──────────────────────────────────────────────────────
function getSession() {
    const token = localStorage.getItem('borrower_token');
    if (!token) return null;
    return {
        access_token: token,
        borrower_id:  parseInt(localStorage.getItem('borrower_id')),
        full_name:    localStorage.getItem('borrower_name') || '',
    };
}

// ── Helpers ───────────────────────────────────────────────────────
function fmtINR(n) {
    if (!n && n !== 0) return '—';
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
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

// ── On load ───────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    const session = getSession();
    if (!session) { window.location.href = '/borrower/login'; return; }

    // Fill topbar
    const name = session.full_name || 'Borrower';
    document.getElementById('userName').textContent   = name;
    document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();

    // Get application_id from URL
    const params = new URLSearchParams(window.location.search);
    const appId  = params.get('id');
    if (!appId) { window.location.href = '/borrower/loans'; return; }

    // Update loading text
    document.getElementById('loadingText').textContent = 'Generating your loan agreement…';

    // Fetch agreement from backend
    try {
        const res  = await fetch(`${API}/api/borrower/loan-application/${appId}/agreement`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await res.json();

        if (!res.ok) {
            showError(data.detail || 'Failed to load agreement.');
            return;
        }

        renderAgreement(data);

    } catch (err) {
        showError('Cannot connect to server. Please try again.');
    }
});

// ── Render agreement ─────────────────────────────────────────────
function renderAgreement(data) {
    const { loan, borrower, nbfc, agreement_text, status, rejection_reason } = data;

    // Hide loading, show content
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('mainContent').style.display  = 'block';

    // Page subtitle
    document.getElementById('pageSubtitle').textContent =
        `Loan with ${nbfc.company_name} · ₹${Math.round(loan.amount).toLocaleString('en-IN')}`;

    // ── Fill summary panel ────────────────────────────────────────
    document.getElementById('sumNbfc').textContent     = nbfc.company_name;
    document.getElementById('sumAmount').textContent   = fmtINR(loan.amount);
    document.getElementById('sumRate').textContent     = `${loan.interest_rate}% p.a.`;
    document.getElementById('sumTenure').textContent   = `${loan.tenure_months} months`;
    document.getElementById('sumEmi').textContent      = fmtINR(loan.emi_amount);
    document.getElementById('sumInterest').textContent = fmtINR(loan.total_interest);
    document.getElementById('sumTotal').textContent    = fmtINR(loan.total_payable);
    document.getElementById('sumFee').textContent      = fmtINR(loan.processing_fee);
    document.getElementById('sumDisbursed').textContent= fmtINR(loan.amount_disbursed);
    document.getElementById('sumPurpose').textContent  = purposeLabel(loan.purpose);
    document.getElementById('sumDate').textContent     = fmtDate(loan.applied_at);

    document.getElementById('borName').textContent   = borrower.full_name;
    document.getElementById('borPan').textContent    = borrower.pan_number || '—';
    document.getElementById('borMobile').textContent = borrower.mobile;
    document.getElementById('borScore').textContent  = borrower.credit_score || '—';

    // ── Fill agreement text ───────────────────────────────────────
const rawText = agreement_text || 'Agreement text not available.';

if (typeof marked !== 'undefined') {
    marked.setOptions({ breaks: true, gfm: true });
    document.getElementById('agreementBody').innerHTML = marked.parse(rawText);
} else {
    // Fallback: basic markdown to HTML conversion without raw symbols
    const html = rawText
        .replace(/^#{1} (.+)$/gm, '<h1>$1</h1>')
        .replace(/^#{2} (.+)$/gm, '<h2>$1</h2>')
        .replace(/^#{3} (.+)$/gm, '<h3>$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^---$/gm, '<hr>')
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ol>$1</ol>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(?!<[a-z])(.+)$/gm, '<p>$1</p>');
    document.getElementById('agreementBody').innerHTML = html;
}
    document.getElementById('docMeta').textContent =
        `AI-Generated · LendOS Platform · App #${data.application_id}`;

    // ── Render status-based UI ─────────────────────────────────────
    renderStatus(status, rejection_reason);
}

// ── Status rendering ─────────────────────────────────────────────
function renderStatus(status, rejectionReason) {
    const banner    = document.getElementById('statusBanner');
    const chip      = document.getElementById('docStatusChip');
    const signSec   = document.getElementById('signSection');
    const rejSec    = document.getElementById('rejectedSection');

    // Reset
    banner.className   = 'status-banner';
    chip.className     = 'doc-status-chip';
    signSec.style.display = 'none';
    rejSec.style.display  = 'none';
// Hide back button by default — only show when pending (can still change loan)
    const backBtn = document.querySelector('.back-btn');
    if (backBtn) backBtn.style.display = 'none';
if (status === 'pending') {
        banner.classList.add('pending');
        banner.innerHTML = `
            <i class="ti ti-file-description"></i>
            <div class="status-banner-body">
                <strong>Review Your Loan Agreement</strong>
                Please read the agreement carefully. Accept to submit your application
                to the lender, or decline to go back and choose a different lender.
            </div>`;
        chip.innerHTML = `<i class="ti ti-clock"></i> Pending Review`;
        document.querySelector('.back-btn') && (document.querySelector('.back-btn').style.display = 'flex');
        document.getElementById('actionBar').style.display = 'flex';
} else if (status === 'applied') {
        banner.classList.add('approved');
        banner.innerHTML = `
            <i class="ti ti-circle-check"></i>
            <div class="status-banner-body">
                <strong>Agreement Accepted & Under Review</strong>
                Your application has been submitted to the lender and is under review.
                You will be notified once a decision is made.
            </div>`;
        chip.classList.add('approved');
        chip.innerHTML = `<i class="ti ti-check"></i> Submitted`;
        document.querySelector('.back-btn').style.display = 'none';
    } else if (status === 'approved') {
        banner.classList.add('approved');
        banner.innerHTML = `
            <i class="ti ti-circle-check"></i>
            <div class="status-banner-body">
                <strong>Application Approved!</strong>
                Your loan has been approved. Please read the agreement carefully and sign it
                using OTP verification below. The loan will be disbursed after signing.
            </div>`;
        chip.classList.add('approved');
       chip.classList.add('approved');
        chip.innerHTML = `<i class="ti ti-check"></i> Approved`;
        signSec.style.display = 'block';
        document.getElementById('signBtn').innerHTML =
            '<i class="ti ti-writing-sign"></i> Sign & Accept Agreement';
        setupOtpValidation();
document.querySelector('.back-btn').style.display = 'none';
    } else if (status === 'rejected') {
        banner.classList.add('rejected');
        banner.innerHTML = `
            <i class="ti ti-x-circle"></i>
            <div class="status-banner-body">
                <strong>Application Rejected</strong>
                Unfortunately your application was not approved by the lender.
                You can apply with another lender from the lenders page.
            </div>`;
        chip.classList.add('rejected');
        chip.innerHTML = `<i class="ti ti-x"></i> Rejected`;
        rejSec.style.display = 'block';
document.getElementById('rejectedReason').textContent =
            rejectionReason || 'No reason provided by the lender.';
        // Wire Browse Other Lenders button to reset loan_status before redirecting
        const browseBtn = document.querySelector('.reapply-btn');
        if (browseBtn) {
            browseBtn.removeAttribute('href');
            browseBtn.onclick = browseOtherLenders;
        }

} else if (status === 'active') {
        banner.classList.add('active');
        banner.innerHTML = `
            <i class="ti ti-rocket"></i>
            <div class="status-banner-body">
                <strong>Loan Active — Disbursement in Progress</strong>
                Agreement signed successfully. Your loan amount will be credited to your
                registered bank account within 1–2 business days.
            </div>`;
        chip.classList.add('active');
        chip.innerHTML = `<i class="ti ti-check-circle"></i> Active`;
        showSignedSuccess();

    } else if (status === 'disbursed') {
        banner.classList.add('active');
        banner.innerHTML = `
            <i class="ti ti-circle-check"></i>
            <div class="status-banner-body">
                <strong>Loan Disbursed Successfully!</strong>
                Your loan amount of <strong>${document.getElementById('sumDisbursed').textContent}</strong>
                has been transferred to your bank account. Your first EMI will be due next month.
                Check <a href="/borrower/loans" style="color:inherit;font-weight:700;">My Loans</a>
                for your repayment schedule.
            </div>`;
        chip.classList.add('active');
        chip.innerHTML = `<i class="ti ti-check-circle"></i> Disbursed`;
        showSignedSuccess();
    }
}

// ── OTP validation logic ─────────────────────────────────────────
let otpSent = false;

function setupOtpValidation() {
    const otpInput = document.getElementById('otpInput');
    const signBtn  = document.getElementById('signBtn');

    otpInput.addEventListener('input', () => {
       const val = otpInput.value.replace(/\D/g, '').slice(0, 6);
        otpInput.value = val;
        signBtn.disabled = !(otpSent && val.length === 6);
    });
}

let otpCooldownTimer = null;

// ── Send OTP ──────────────────────────────────────────────────
async function sendOtp() {
    const appId  = getAppId();
    const session = getSession();
    if (!session) {
        showToast('Session expired. Please login again.', 'error');
        window.location.href = '/borrower/login';
        return;
    }
    const btn    = document.getElementById('sendOtpBtn');
    const input  = document.getElementById('otpInput');
    const signBtn = document.getElementById('signBtn');

    btn.disabled  = true;
    btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Sending…';

    try {
        const res  = await fetch(`${API}/api/borrower/loan-application/${appId}/send-otp`, {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.detail || 'Failed to send OTP.', 'error');
            btn.disabled  = false;
            btn.innerHTML = '<i class="ti ti-device-mobile-message"></i> Send OTP';
            return;
        }

        showToast(data.message || 'OTP sent to your email.', 'success');
        otpSent = true;
        // Dev mode — auto fill OTP
        if (data.dev_otp) {
            input.value = data.dev_otp;
            signBtn.disabled = !(input.value.length === 6);
            showToast(`[DEV] OTP: ${data.dev_otp}`, 'info');
        }

        // Start 30s cooldown
        startOtpCooldown(btn);

        // Enable sign button when 6 digits entered
        input.addEventListener('input', function() {
            signBtn.disabled = this.value.trim().length !== 6;
        });

    } catch (err) {
        showToast('Cannot connect to server. Please try again.', 'error');
        btn.disabled  = false;
        btn.innerHTML = '<i class="ti ti-device-mobile-message"></i> Send OTP';
    }
}

// ── OTP Cooldown timer ────────────────────────────────────────
function startOtpCooldown(btn) {
    let seconds = 30;
    if (otpCooldownTimer) clearInterval(otpCooldownTimer);

    otpCooldownTimer = setInterval(() => {
        btn.innerHTML = `<i class="ti ti-clock"></i> Resend in ${seconds}s`;
        seconds--;
        if (seconds < 0) {
            clearInterval(otpCooldownTimer);
            btn.disabled  = false;
            btn.innerHTML = '<i class="ti ti-device-mobile-message"></i> Resend OTP';
        }
    }, 1000);
}

// ── Sign agreement with OTP ───────────────────────────────────
async function signAgreement() {
    const appId   = getAppId();
    const session = getSession();    // ← ADD THIS LINE

    if (!session) {
        showToast('Session expired. Please login again.', 'error');
        window.location.href = '/borrower/login';
        return;
    }
    const otp     = document.getElementById('otpInput').value.trim();
    const signBtn = document.getElementById('signBtn');

    if (otp.length !== 6 || !/^\d{6}$/.test(otp)) {
        showToast('Please enter a valid 6-digit OTP.', 'error');
        return;
    }

    signBtn.disabled  = true;
    signBtn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Verifying…';

    try {
        const res  = await fetch(
            `${API}/api/borrower/loan-application/${appId}/sign?otp_code=${otp}`,
            {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            }
        );
        const data = await res.json();

        if (!res.ok) {
            showToast(data.detail || 'Signing failed. Please try again.', 'error');
            signBtn.disabled  = false;
            signBtn.innerHTML = '<i class="ti ti-writing-sign"></i> Sign & Accept Agreement';
            return;
        }

        // Success — show success state then redirect
        showToast('Agreement signed successfully! Your loan is now active.', 'success');

        signBtn.innerHTML = '<i class="ti ti-check"></i> Signed Successfully!';
        signBtn.style.background = '#10b981';

        setTimeout(() => {
            window.location.href = '/borrower/loans';
        }, 2000);

    } catch (err) {
        showToast('Cannot connect to server. Please try again.', 'error');
        signBtn.disabled  = false;
        signBtn.innerHTML = '<i class="ti ti-writing-sign"></i> Sign & Accept Agreement';
    }
}

// ── Toast notification ────────────────────────────────────────
function showToast(message, type = 'success') {
    // Remove existing toast
    const existing = document.querySelector('.ag-toast');
    if (existing) existing.remove();

    const colors = {
        success: { bg: '#0F6E56', icon: 'ti-check' },
        error:   { bg: '#dc2626', icon: 'ti-x' },
        info:    { bg: '#1d4ed8', icon: 'ti-info-circle' },
    };
    const c = colors[type] || colors.success;

    const toast = document.createElement('div');
    toast.className = 'ag-toast';
    toast.innerHTML = `<i class="ti ${c.icon}"></i> ${message}`;
    toast.style.cssText = `
        position:fixed; bottom:24px; right:24px;
        background:${c.bg}; color:white;
        padding:12px 18px; border-radius:8px;
        font-size:13px; font-weight:500;
        display:flex; align-items:center; gap:8px;
        box-shadow:0 4px 20px rgba(0,0,0,0.15);
        z-index:9999; animation:toastIn 0.25s ease;
        max-width:360px; line-height:1.4;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ── Helper ────────────────────────────────────────────────────
function getAppId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id') || localStorage.getItem('loan_application_id');
}


// ── Accept agreement ──────────────────────────────────────────
async function acceptAgreement() {
    const params  = new URLSearchParams(window.location.search);
    const appId   = params.get('id');
    const session = getSession();

    const btn = document.querySelector('.btn-accept');
    btn.disabled  = true;
    btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Submitting…';

    try {
        const res  = await fetch(`${API}/api/borrower/loan-application/${appId}/accept`, {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await res.json();

        if (!res.ok) {
            alert(data.detail || 'Failed to accept. Please try again.');
            btn.disabled  = false;
            btn.innerHTML = '<i class="ti ti-check"></i> Accept & Submit Application';
            return;
        }

        // Hide action bar, update banner + chip, show success
        document.getElementById('actionBar').style.display   = 'none';
        document.getElementById('actionBar').style.display   = 'none';
        document.querySelector('.back-btn').style.display     = 'none';
        document.getElementById('statusBanner').className    = 'status-banner approved';
        document.getElementById('statusBanner').innerHTML    = `
            <i class="ti ti-circle-check"></i>
            <div class="status-banner-body">
                <strong>Agreement Accepted & Submitted!</strong>
                Your loan application is now under review by the lender.
                Redirecting you in 3 seconds…
            </div>`;
        document.getElementById('docStatusChip').className   = 'doc-status-chip approved';
        document.getElementById('docStatusChip').innerHTML   = `<i class="ti ti-check"></i> Submitted`;
        showSignedSuccess();

        // Redirect to Apply for Loan page after 3 seconds so borrower sees their loan status
        setTimeout(() => {
            window.location.href = '/borrower/nbfcs';
        }, 3000);

    } catch (err) {
        alert('Cannot connect to server. Please try again.');
        btn.disabled  = false;
        btn.innerHTML = '<i class="ti ti-check"></i> Accept & Submit Application';
    }
}
async function browseOtherLenders() {
    const params  = new URLSearchParams(window.location.search);
    const appId   = params.get('id');
    const session = getSession();

    // Call decline endpoint to reset loan_status so nbfcs page shows NBFC list
    try {
        await fetch(`${API}/api/borrower/loan-application/${appId}/decline`, {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
    } catch (e) { /* still redirect */ }

    // Clear all draft + application localStorage
    ['loan_draft_amount','loan_draft_tenure','loan_draft_purpose',
     'loan_application_id','selected_nbfc_id','selected_nbfc_name',
     'selected_nbfc_interest','selected_nbfc_notice']
        .forEach(k => localStorage.removeItem(k));

    window.location.href = '/borrower/nbfcs';
}
// ── Decline agreement ─────────────────────────────────────────
async function rejectAgreement() {
    if (!confirm('Are you sure you want to decline this agreement?\nYou can apply with another lender.')) return;

    const params  = new URLSearchParams(window.location.search);
    const appId   = params.get('id');
    const session = getSession();

    try {
        await fetch(`${API}/api/borrower/loan-application/${appId}/decline`, {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
    } catch (e) { /* still redirect even if call fails */ }

    // Clear draft values so loan-apply page starts fresh
    ['loan_draft_amount','loan_draft_tenure','loan_draft_purpose',
     'loan_application_id','selected_nbfc_id','selected_nbfc_name',
     'selected_nbfc_interest','selected_nbfc_notice']
        .forEach(k => localStorage.removeItem(k));

    window.location.href = '/borrower/nbfcs';
}

function showSignedSuccess() {
    const rightCol = document.querySelector('.agreement-right');
    // Remove old sign section and append success block
    const existing = rightCol.querySelector('.signed-success');
    if (existing) return;

    const div = document.createElement('div');
    div.className = 'signed-success';
    div.innerHTML = `
        <div class="signed-success-icon"><i class="ti ti-writing-sign"></i></div>
        <div class="signed-success-title">Agreement Signed & Locked</div>
        <div class="signed-success-sub">
            Your loan agreement has been digitally signed and is locked permanently.
            An audit trail with timestamp, IP, and OTP status has been recorded.
        </div>
        <a href="/borrower/loans" class="reapply-btn" style="display:inline-flex;">
            <i class="ti ti-file-invoice"></i> View My Loans
        </a>`;
    rightCol.appendChild(div);
}


async function downloadAgreement() {
    const appId    = new URLSearchParams(window.location.search).get('id') || '';
    const subtitle = document.getElementById('pageSubtitle').textContent || 'Loan Agreement';
    const bodyEl   = document.getElementById('agreementBody');

    // ── Button: loading state ────────────────────────────────────
    const btn = document.getElementById('downloadBtn');
    const origHTML = btn.innerHTML;
    btn.innerHTML  = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite;display:inline-block;font-size:16px;"></i>';
    btn.disabled   = true;
    btn.title      = 'Generating PDF…';

    try {
        const { jsPDF } = window.jspdf;

        // ── Temporarily expand agreementBody to full height so nothing is clipped ──
        const prevMaxH    = bodyEl.style.maxHeight;
        const prevOverflow = bodyEl.style.overflow;
        bodyEl.style.maxHeight = 'none';
        bodyEl.style.overflow  = 'visible';

        // ── Capture agreementBody as canvas ──────────────────────
        const canvas = await html2canvas(bodyEl, {
            scale:            2,           // 2× for crisp text on retina
            useCORS:          true,
            backgroundColor:  '#fdfdfd',
            logging:          false,
            windowWidth:      bodyEl.scrollWidth,
            windowHeight:     bodyEl.scrollHeight,
        });

        // Restore styles
        bodyEl.style.maxHeight = prevMaxH;
        bodyEl.style.overflow  = prevOverflow;

        // ── Build PDF ────────────────────────────────────────────
        const pdf      = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const pageW    = pdf.internal.pageSize.getWidth();   // 210mm
        const pageH    = pdf.internal.pageSize.getHeight();  // 297mm
        const margin   = 14;   // mm
        const headerH  = 18;   // mm — teal top bar
        const footerH  = 10;   // mm — teal bottom bar
        const contentW = pageW - margin * 2;
        const contentH = pageH - headerH - footerH - margin; // printable height per page

        // Canvas → image
        const imgData  = canvas.toDataURL('image/png');
        const imgPxW   = canvas.width;
        const imgPxH   = canvas.height;

        // Scale: fit image width to contentW
        const scaledW  = contentW;
        const scaledH  = (imgPxH / imgPxW) * scaledW;

        // How many PDF pages needed
        const totalPages = Math.ceil(scaledH / contentH);

        for (let page = 0; page < totalPages; page++) {

            if (page > 0) pdf.addPage();

            // ── Teal header band ──────────────────────────────

//pdf.setTextColor(10, 60, 100);
//            pdf.rect(0, 0, pageW, headerH, 'F');
pdf.setFillColor(219, 234, 254);
pdf.rect(0, 0, pageW, headerH, 'F');
            // Logo text
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(11);
//            pdf.setTextColor(255, 255, 255);
pdf.setTextColor(30, 64, 175);
//            pdf.text('LendOS', margin, 10);
//
//            // Divider line
//            pdf.setDrawColor(159, 225, 203);
//            pdf.setLineWidth(0.4);
//            pdf.line(margin + 22, 6, margin + 22, 14);
//
//            // Subtitle
//            pdf.setFont('helvetica', 'normal');
//            pdf.setFontSize(8);
//            pdf.text('Borrower Portal  ·  Loan Agreement', margin + 25, 10);
const nbfcLabel = document.getElementById('sumNbfc')?.textContent || 'Lender';
pdf.text(nbfcLabel, margin, 10);

// Divider line
//pdf.setDrawColor(159, 225, 203);
pdf.setDrawColor(30, 64, 175);
pdf.setLineWidth(0.4);
const divX = margin + pdf.getTextWidth(nbfcLabel) + 4;
pdf.line(divX, 6, divX, 14);

// Subtitle
pdf.setFont('helvetica', 'normal');
pdf.setFontSize(8);
pdf.text('Loan Agreement', divX + 3, 10);
            // App + date right-aligned
            const today = new Date().toLocaleDateString('en-IN', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
            pdf.text(`App #${appId}  ·  ${today}`, pageW - margin, 10, { align: 'right' });

            // ── Clip and draw the canvas slice for this page ──
            const sliceYpx = page * (contentH / scaledW) * imgPxW;
            const sliceHpx = Math.min(contentH / scaledW * imgPxW, imgPxH - sliceYpx);

            // Create a temp canvas slice
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width  = imgPxW;
            sliceCanvas.height = sliceHpx;
            const ctx = sliceCanvas.getContext('2d');
            ctx.fillStyle = '#fdfdfd';
            ctx.fillRect(0, 0, imgPxW, sliceHpx);
            ctx.drawImage(canvas, 0, -sliceYpx);

            const sliceImg = sliceCanvas.toDataURL('image/png');
            const sliceHmm = (sliceHpx / imgPxW) * scaledW;

            pdf.addImage(sliceImg, 'PNG', margin, headerH + 4, scaledW, sliceHmm, '', 'FAST');

            // ── Teal footer band ──────────────────────────────

            pdf.setFillColor(219, 234, 254);
            pdf.rect(0, pageH - footerH, pageW, footerH, 'F');
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(7);
            pdf.setTextColor(30, 64, 175);

            const nbfcFooter = document.getElementById('sumNbfc')?.textContent || 'Lender';
            pdf.text(
                `${nbfcFooter}  |  AI-Generated Legal Document  |  Confidential`,
                margin, pageH - 3.5
            );
            pdf.text(
                `Page ${page + 1} of ${totalPages}`,
                pageW - margin, pageH - 3.5, { align: 'right' }
            );
        }

//        pdf.save(`LendOS_LoanAgreement_App${appId}.pdf`);
const nbfcSlug = (document.getElementById('sumNbfc')?.textContent || 'Lender')
    .replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
pdf.save(`${nbfcSlug}_LoanAgreement_App${appId}.pdf`);

        // ── Success flash ────────────────────────────────────
        btn.innerHTML = '<i class="ti ti-check" style="font-size:16px;"></i>';
        btn.style.color = 'var(--teal-600)';
        setTimeout(() => {
            btn.innerHTML = origHTML;
            btn.style.color = '';
            btn.disabled    = false;
            btn.title       = 'Download Agreement as PDF';
        }, 2500);

    } catch (err) {
        console.error('PDF generation error:', err);
        alert('PDF download failed: ' + err.message);
        btn.innerHTML = origHTML;
        btn.disabled  = false;
    }
}
// ── Error state ───────────────────────────────────────────────────
function showError(msg) {
    document.getElementById('loadingState').innerHTML = `
        <div class="loading-spinner" style="background:var(--error-bg);">
            <i class="ti ti-alert-triangle" style="color:var(--error);"></i>
        </div>
        <div class="loading-text" style="color:var(--error);">Error Loading Agreement</div>
        <div class="loading-sub">${msg}</div>
        <a href="/borrower/loans" style="margin-top:20px;color:var(--teal-600);font-weight:600;text-decoration:none;">
            ← Back to My Loans
        </a>`;
}

// ── Sidebar + Logout ──────────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
        if (overlay) overlay.classList.toggle('show');
    } else {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebar_collapsed',
            sidebar.classList.contains('collapsed') ? '1' : '0');
    }
}

function handleLogout() {
    ['borrower_token','borrower_id','borrower_name','borrower_email',
     'borrower_mobile','borrower_aadhaar','borrower_pan',
     'borrower_kyc_status','borrower_score',
     'selected_nbfc_id','selected_nbfc_name',
     'selected_nbfc_interest','selected_nbfc_notice',
     'loan_application_id'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/borrower/login';
}
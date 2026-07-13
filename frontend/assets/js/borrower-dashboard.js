const API = 'http://localhost:8000';

// ── Session keys (must match borrower-login.js saveSession) ───────────────────
function getSession() {
    const token = localStorage.getItem('borrower_token');
    if (!token) return null;
    return {
        access_token:   token,
        borrower_id:    parseInt(localStorage.getItem('borrower_id')),
        full_name:      localStorage.getItem('borrower_name')      || '',
        email:          localStorage.getItem('borrower_email')     || '',
        mobile:         localStorage.getItem('borrower_mobile')    || '',
        aadhaar_number: localStorage.getItem('borrower_aadhaar')   || '',
        pan_number:     localStorage.getItem('borrower_pan')       || '',
        kyc_status:     localStorage.getItem('borrower_kyc_status')|| 'pending',
        credit_score:   parseInt(localStorage.getItem('borrower_score')) || null,
    };
}

// ── State ─────────────────────────────────────────────────────────────────────
let session     = null;
let bankFile    = null;
let salaryFile  = null;
let itrFile    = null;
// ── On load ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
   restoreSidebar();
    // 1. Check session
    session = getSession();
    if (!session || !session.access_token) {
        window.location.href = '/borrower/login';
        return;
    }

    // 2. Fill topbar + sidebar
    const name = session.full_name || 'Borrower';
    const userNameEl   = document.getElementById('userName');
const userAvatarEl = document.getElementById('userAvatar');
const welcomeEl    = document.getElementById('welcomeTitle');
if (userNameEl)   userNameEl.textContent   = name;
if (userAvatarEl) userAvatarEl.textContent = name.charAt(0).toUpperCase();
if (welcomeEl)    welcomeEl.textContent    = `Welcome back, ${name}!`;
    // 3. Load full profile from backend
    await loadProfile();

    // 4. Check if already scored → show verified docs view

    // 5. Load credit score
    await loadCreditScore();
    if (typeof showVerifiedIfDone === 'function') await showVerifiedIfDone();


    // 5. Update journey steps
   await updateJourney();

    // 6. Build next action card
    buildNextAction();

    // 7. Check if docs badge needed
    if (!session.credit_score) {
      const badgeDocs = document.getElementById('badge-docs');
if (badgeDocs) badgeDocs.style.display = 'flex';
    }
});

// ── Load Profile ──────────────────────────────────────────────────────────────
async function loadProfile() {
    try {
        const res  = await apiFetch(`/api/borrower/profile/${session.borrower_id}`);
        const data = await res.json();
        if (!res.ok) return;

        // Update localStorage with latest data
        localStorage.setItem('borrower_email',  data.email  || '');
        localStorage.setItem('borrower_mobile', data.mobile || '');
        session.email  = data.email  || '';
        session.mobile = data.mobile || '';
//        session.credit_score = data.credit_score || null;
//        if (data.credit_score) localStorage.setItem('borrower_score', data.credit_score);
session.credit_score = data.credit_score || null;
        if (data.credit_score) {
            localStorage.setItem('borrower_score', data.credit_score);
        } else {
            localStorage.removeItem('borrower_score');
        }
        // Fill profile rows
        setText('pName',    data.full_name    || '—');
        setText('pMobile',  data.mobile       || '—');
        setText('pEmail',   data.email        || '—');
        setText('pAadhaar', maskAadhaar(data.aadhaar_number));
        setText('pPan',     data.pan_number   || '—');
        setText('pDob',     data.date_of_birth|| '—');
        setText('pGender',  data.gender       || '—');
        setText('pEmployment',  data.employment_type  || '—');
       const sidebarEmailEl = document.getElementById('sidebarEmail');
if (sidebarEmailEl) sidebarEmailEl.textContent = data.email || '—';

        // Save employment type so documents page can read it
        localStorage.setItem('borrower_employment_type', data.employment_type || '');

        // Switch salary/ITR card if on documents page
        if (typeof applyDocMode === 'function') applyDocMode();

    } catch (err) {
        console.error('Profile load error:', err);
    }
}

// ── Load Credit Score ─────────────────────────────────────────────────────────
async function loadCreditScore() {
    try {
        const res  = await apiFetch(`/api/borrower/score/${session.borrower_id}`);
        if (!res.ok) return;
        const data = await res.json();

        if (!data.score) return;

        session.credit_score = data.score;
        localStorage.setItem('borrower_score', data.score);

        // Show score in overview card
        buildScoreCard(data);

        // Show score page
        showScoreDisplay(data);

    } catch {
        // No score yet — expected for new users
    }
}

// ── Build score card in overview ──────────────────────────────────────────────
function buildScoreCard(data) {
    const el = document.getElementById('scoreCardBody');
    if (!el) return;

    const { color, grade, sub } = scoreInfo(data.score);

  const pct = Math.min(100, Math.max(0, ((data.score - 300) / 600) * 100));
el.innerHTML = `
    <div class="score-preview">
        <div class="score-preview-num" style="color:${color};">${data.score}</div>
        <div class="score-preview-info">
            <div class="score-preview-grade" style="color:${color};">${grade}</div>
            <div class="score-preview-sub">${sub}</div>
            <a class="score-preview-link" href="/borrower/score">
                View full breakdown <i class="ti ti-arrow-right"></i>
            </a>
        </div>
    </div>
    <div class="score-bar-wrap">
        <div class="score-bar-labels"><span>300</span><span>Poor</span><span>Fair</span><span>Good</span><span>900</span></div>
        <div class="score-bar-track">
            <div class="score-bar-thumb" style="left:${pct}%;"></div>
        </div>
    </div>`;
}

// ── Show score display page ───────────────────────────────────────────────────
function showScoreDisplay(data) {
if (data.breakdown) session._bd = data.breakdown;
    document.getElementById('no-score-card').style.display  = 'none';
    document.getElementById('score-display').style.display  = 'block';

    const { color, grade, sub } = scoreInfo(data.score);

    // Animate ring
    const pct    = (data.score - 300) / 600;
    const circumference = 2 * Math.PI * 52;
    const offset = circumference * (1 - pct);
    const arc    = document.getElementById('scoreRingArc');
    if (arc) {
        arc.style.stroke           = color;
        arc.style.strokeDashoffset = offset;
    }

    setText('scoreNumber', data.score);
    setText('scoreGrade',  grade);
    setText('scoreGradeSub', sub);

    // Range fill
    const fill = document.getElementById('scoreRangeFill');
    if (fill) {
        fill.style.width      = `${pct * 100}%`;
        fill.style.background = color;
    }

    // Factor breakdown
   // Factor breakdown — map backend breakdown → factors format
    if (data.breakdown) buildFactors(buildFactorsFromBreakdown(data.breakdown));
    else if (data.factors) buildFactors(data.factors);

    // Summary row
    if (data.breakdown) {
        const bd = data.breakdown;
    setText('fsTotalPts',   bd.total_factor_points != null ? bd.total_factor_points : (data.score - 300));
        setText('fsFinalScore', bd.final_score ?? data.score ?? '—');
        const summaryRow = document.getElementById('factorSummaryRow');
        if (summaryRow) summaryRow.style.display = 'flex';
        const dated = document.getElementById('scoreDated');
        if (dated && data.scored_at) dated.textContent = 'Scored on ' + new Date(data.scored_at).toLocaleDateString('en-IN');
    }
}

// ── Map backend step breakdown → factor percentage format ────────────────────
function buildFactorsFromBreakdown(bd) {
    const steps = [
        { key: 'foir',               step: bd.step1_foir,               label: 'FOIR (Fixed Obligation to Income)',  max: 150 },
        { key: 'income_level',       step: bd.step2_income_level,        label: 'Income Level',                      max: 120 },
        { key: 'income_consistency', step: bd.step3_income_consistency,  label: 'Income Consistency',                max: 100 },
        { key: 'bounce_record',      step: bd.step4_bounce_record,       label: 'Bounce Record',                     max: 100 },
        { key: 'avg_balance',        step: bd.step5_average_balance,     label: 'Average Bank Balance',              max: 80  },
        { key: 'loan_to_income',     step: bd.step6_lti,                 label: 'Loan-to-Income Ratio',             max: 30  },
        { key: 'employment_type',    step: bd.step7_employment_type,     label: 'Employment Type',                   max: 20  },
    ];
    const result = {};
steps.forEach(({ key, step, max }) => {
    if (step) result[key] = step.points;  // ← raw points only, no conversion
});
    return result;
}


function buildFactors(factors) {
    const el = document.getElementById('factorBreakdown');
    if (!el) return;

    const maxPts = {
        foir: 150, income_level: 120, income_consistency: 100,
        bounce_record: 100, avg_balance: 80, loan_to_income: 30, employment_type: 20,
    };
    const labels = {
        foir: 'FOIR', income_level: 'Income Level',
        income_consistency: 'Income Consistency', bounce_record: 'Bounce Record',
        avg_balance: 'Average Balance', loan_to_income: 'Loan-to-Income Ratio',
        employment_type: 'Employment Type',
    };
    const icons = {
        foir: 'ti-arrows-exchange', income_level: 'ti-coin-rupee',
        income_consistency: 'ti-chart-line', bounce_record: 'ti-alert-triangle',
        avg_balance: 'ti-wallet', loan_to_income: 'ti-scale',
        employment_type: 'ti-briefcase',
    };

    el.innerHTML = Object.entries(factors).map(([key, pts]) => {
        const max   = maxPts[key] || 100;
        const pct   = Math.round((pts / max) * 100);
        const color = pct >= 70 ? '#0e8c6a' : pct >= 40 ? '#d4820a' : '#c0392b';

return `
    <div class="factor-item">
        <i class="ti ${icons[key] || 'ti-circle'}" style="color:${color};font-size:14px;flex-shrink:0;" aria-hidden="true"></i>
        <span class="factor-name">${labels[key] || key}</span>
        <div class="factor-bar">
            <div class="factor-fill" style="width:${pct}%;background:${color};"></div>
        </div>
       <span></span>
        <span class="factor-score" style="color:${color};">${pts}/${max}</span>
    </div>`;
    }).join('');
}

// ── Update journey steps ──────────────────────────────────────────────────────
async function updateJourney() {
    setJourneyStep('js-register', 'done');

    if (!session.credit_score) {
        setJourneyStep('js-docs', 'active');
        return;
    }
    setJourneyStep('js-docs',  'done');
    setJourneyStep('js-score', 'done');

    let loans = [];
    try {
        const res  = await apiFetch(`/api/borrower/loans/${session.borrower_id}`);
        const data = await res.json();
        loans = data.loans || [];
    } catch (e) {
        console.warn('Could not load loans for journey step:', e);
    }

    const inProgressStatuses = ['active', 'disbursed', 'approved'];
    const isClosed = loans.some(l => l.status === 'closed');
    const isActive = loans.some(l => inProgressStatuses.includes(l.status));

     const isPending = loans.some(l => ['applied','pending','approved'].includes(l.status));

    if (isClosed) {
        setJourneyStep('js-apply',  'done');
        setJourneyStep('js-loan',   'done');
        setJourneyStep('js-closed', 'active');
    }
     else if (isActive) {
        setJourneyStep('js-apply', 'done');
        setJourneyStep('js-loan',  'active');
    } else if (isPending) {
        setJourneyStep('js-apply', 'done');
        setJourneyStep('js-loan',  'active');
    } else {
        setJourneyStep('js-apply', 'active');
    }
    }

function setJourneyStep(id, state) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('done', 'active');
    if (state) el.classList.add(state);

    const circle = el.querySelector('.js-circle');
    if (!circle) return;

    if (state === 'done') {
        circle.innerHTML = '<i class="ti ti-check" style="font-size:13px;"></i>';
    } else if (state === 'active') {
        // Each step gets a relevant icon when active
        const icons = {
            'js-docs':   '<i class="ti ti-upload" style="font-size:14px;"></i>',
            'js-score':  '<i class="ti ti-chart-pie" style="font-size:14px;"></i>',
            'js-apply':  '<i class="ti ti-building-bank" style="font-size:14px;"></i>',
            'js-loan':   '<i class="ti ti-rocket" style="font-size:14px;"></i>',
            'js-closed': '<i class="ti ti-circle-check" style="font-size:14px;"></i>',
        };
        circle.innerHTML = icons[id] || circle.textContent;
    }
}

// ── Build next action card ────────────────────────────────────────────────────
function buildNextAction() {
    const el = document.getElementById('nextActionBody');
    if (!el) return;

if (!session.credit_score) {
    el.innerHTML = `
        <div class="next-action-content">
            <div class="next-action-icon-wrap"><i class="ti ti-upload"></i></div>
            <div class="next-action-text">
                <div class="next-action-title">Upload your documents</div>
                <div class="next-action-sub">Upload your bank statement and salary slip to generate your AI credit score.</div>
            </div>
            <div class="next-action-btn">
                <a href="/borrower/documents" class="btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;width:auto;white-space:nowrap;">
                    <i class="ti ti-upload"></i> Upload Now
                </a>
            </div>
        </div>`;
} else {
    el.innerHTML = `
        <div class="next-action-content">
            <div class="next-action-icon-wrap"><i class="ti ti-building-bank"></i></div>
            <div class="next-action-text">
                <div class="next-action-title">Apply for a loan</div>
                <div class="next-action-sub">Your credit score is ready. Browse NBFCs and apply for the best loan offer.</div>
            </div>
            <div class="next-action-btn">
                <a href="/borrower/nbfcs" class="btn-primary" style="text-decoration:none;display:inline-flex;align-items:center;gap:6px;width:auto;white-space:nowrap;">
                    <i class="ti ti-arrow-right"></i> Browse Lenders
                </a>
            </div>
        </div>`;
}
}

// ── Load NBFC marketplace ─────────────────────────────────────────────────────
async function loadNBFCs() {
    const container = document.getElementById('nbfcCards');
    const warning   = document.getElementById('no-score-warning');

    if (!session.credit_score) {
        warning.style.display   = 'block';
        container.style.display = 'none';
        return;
    }

    warning.style.display   = 'none';
    container.style.display = 'block';
    container.innerHTML     = '<div style="padding:20px;color:var(--text-muted);font-size:13px;">Loading lenders…</div>';

    try {
        const res  = await apiFetch(`/api/borrower/nbfcs?score=${session.credit_score}`);
        const data = await res.json();

        if (!data.nbfcs || data.nbfcs.length === 0) {
            container.innerHTML = `
                <div class="content-card">
                    <div class="card-body-pad" style="text-align:center;padding:40px;">
                        <i class="ti ti-building-bank" style="font-size:40px;color:var(--teal-200);margin-bottom:12px;display:block;"></i>
                        <div style="font-size:15px;font-weight:600;margin-bottom:8px;">No lenders available yet</div>
                        <div style="font-size:13px;color:var(--text-secondary);">
                            No NBFCs currently match your credit score of ${session.credit_score}.
                            Check back soon as more lenders are added.
                        </div>
                    </div>
                </div>`;
            return;
        }

        container.innerHTML = data.nbfcs.map(n => `
            <div class="nbfc-card">
                <div class="nbfc-logo-box">
                    ${n.logo_url
                        ? `<img src="${n.logo_url}" alt="${esc(n.company_name)}"/>`
                        : n.company_name.charAt(0).toUpperCase()
                    }
                </div>
                <div class="nbfc-info">
                    <div class="nbfc-name">${esc(n.company_name)}</div>
                    <div class="nbfc-meta">
                        <div class="nbfc-meta-item">
                            <i class="ti ti-percentage"></i>
                            <strong>${n.interest_rate}%</strong> p.a.
                        </div>
                        <div class="nbfc-meta-item">
                            <i class="ti ti-coin-rupee"></i>
                            Up to <strong>₹${fmtNum(n.max_loan_amount)}</strong>
                        </div>
                        <div class="nbfc-meta-item">
                            <i class="ti ti-calendar"></i>
                            <strong>${n.min_tenure_months}–${n.max_tenure_months}</strong> months
                        </div>
                        <div class="nbfc-meta-item">
                            <i class="ti ti-receipt"></i>
                            Processing fee: <strong>${n.processing_fee}%</strong>
                        </div>
                    </div>
                    <div class="nbfc-eligible">
                        <i class="ti ti-circle-check"></i>
                        You are eligible · Min score required: ${n.min_credit_score}
                    </div>
                </div>
                <button class="nbfc-apply-btn" onclick="applyLoan(${n.id}, '${esc(n.company_name)}', ${n.interest_rate})">
                    <i class="ti ti-arrow-right"></i> Apply
                </button>
            </div>`
        ).join('');

    } catch (err) {
        container.innerHTML = `<div style="padding:20px;color:var(--error);font-size:13px;">Failed to load lenders. Please try again.</div>`;
    }
}

// ── Apply for loan ────────────────────────────────────────────────────────────
function applyLoan(nbfcId, nbfcName, interestRate) {
    // Store selected NBFC for loan application page
    localStorage.setItem('selected_nbfc_id',       nbfcId);
    localStorage.setItem('selected_nbfc_name',     nbfcName);
    localStorage.setItem('selected_nbfc_interest', interestRate);

    // For now redirect to loans page
    // Later: open loan application modal / page
    showPage('loans');
    alert(`Loan application for ${nbfcName} — Coming soon! This will open the EMI calculator and loan application form.`);
}

// ── Upload documents ──────────────────────────────────────────────────────────
function handleFileSelect(input, type) {
    const file = input.files[0];
    if (!file) return;

    const maxSize = 10 * 1024 * 1024;   // 10MB
    const allowed = ['application/pdf','image/png','image/jpeg','image/jpg'];

    if (!allowed.includes(file.type)) {
        showDocsAlert('error', 'Please upload PDF, PNG or JPG files only.');
        input.value = '';
        return;
    }
    if (file.size > maxSize) {
        showDocsAlert('error', 'File too large. Max 10MB allowed.');
        input.value = '';
        return;
    }

if (type === 'bank') {
        bankFile = file;
        document.getElementById('bank-idle').style.display    = 'none';
        document.getElementById('bank-done').style.display    = 'flex';
        document.getElementById('bank-filename').textContent  = file.name;
        document.getElementById('bank-upload-box').classList.add('has-file');
        document.getElementById('e_bank').classList.remove('show');

        // Show password field only for PDF uploads
        const pwGroup = document.getElementById('bank-password-group');
        if (file.type === 'application/pdf') {
            pwGroup.style.display = 'block';
        } else {
            pwGroup.style.display = 'none';
            document.getElementById('bank_statement_password').value = '';
            document.getElementById('e_bank_password').classList.remove('show');
        }
} else if (type === 'salary') {
    salaryFile = file;
    document.getElementById('salary-idle').style.display   = 'none';
    document.getElementById('salary-done').style.display   = 'flex';
    document.getElementById('salary-filename').textContent = file.name;
    document.getElementById('salary-upload-box').classList.add('has-file');
    document.getElementById('e_salary').classList.remove('show');
} else if (type === 'itr') {
    itrFile = file;
    document.getElementById('itr-idle').style.display   = 'none';
    document.getElementById('itr-done').style.display   = 'flex';
    document.getElementById('itr-filename').textContent = file.name;
    document.getElementById('itr-upload-box').classList.add('has-file');
    document.getElementById('e_itr').classList.remove('show');
  const itrPwGroup = document.getElementById('itr-password-group');
        if (file.type === 'application/pdf') {
            itrPwGroup.style.display = 'block';
        } else {
            itrPwGroup.style.display = 'none';
            document.getElementById('itr_password').value = '';
            document.getElementById('e_itr_password').classList.remove('show');
        }
}

}

async function uploadDocuments() {
    let ok = true;

    if (!bankFile) {
        document.getElementById('e_bank').classList.add('show');
        ok = false;
    }

    const isItr = window._incomeDocType === 'itr';
    if (isItr) {
        if (!itrFile) {
            document.getElementById('e_itr').classList.add('show');
            ok = false;
        }
    } else {
        if (!salaryFile) {
            document.getElementById('e_salary').classList.add('show');
            ok = false;
        }
    }

    if (!ok) return;

    const btn = document.getElementById('btn-upload-docs');
    btn.disabled  = true;
    btn.innerHTML = '<div class="spinner"></div> Uploading & scoring…';
    showDocsAlert('', '');

    try {
        const formData = new FormData();
        formData.append('borrower_id',    session.borrower_id);
        formData.append('bank_statement', bankFile);

        // ── Bank statement password ──────────────────────────────────────
        const bankPwInput = document.getElementById('bank_statement_password');
        if (bankPwInput && bankPwInput.value.trim()) {
            formData.append('bank_statement_password', bankPwInput.value.trim());
        }

        // ── Income document: salary slip OR ITR ──────────────────────────
        if (isItr) {
            formData.append('itr', itrFile);
            const itrPwInput = document.getElementById('itr_password');
            if (itrPwInput && itrPwInput.value.trim()) {
                formData.append('itr_password', itrPwInput.value.trim());
            }
        } else {
            formData.append('salary_slip', salaryFile);
        }

        // ── FIX 1: Send requested loan amount for Step 6 LTI scoring ────
        const loanInput = document.getElementById('requested_loan_amount');
        if (loanInput && loanInput.value.trim()) {
            formData.append('requested_loan_amount', loanInput.value.trim());
        }

        const res  = await fetch(`${API}/api/borrower/upload-documents`, {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}` },
            body:    formData,
        });
        const data = await res.json();

//        if (!res.ok) {
//            showDocsAlert('error', data.detail || 'Upload failed. Please try again.');
//            return;
//        }

if (!res.ok) {
            const detail = data.detail;
//            if (detail && typeof detail === 'object' && detail.type === 'bank_statement_quality') {
if (detail && typeof detail === 'object' &&
                (detail.type === 'bank_statement_quality' || detail.type === 'itr_quality')) {
                showDocsAlert('error', detail.message);
            } else if (typeof detail === 'string') {
                showDocsAlert('error', detail);
            } else {
                showDocsAlert('error', 'Upload failed. Please try again.');
            }
            return;
        }

        // ── CONSOLE: Full API response ────────────────────────────────────
        console.group('%c📊 LendOS — Upload & Score Response', 'color:#0d6efd;font-weight:bold;font-size:14px;');
        console.log('%cFull Response JSON:', 'color:gray;font-size:11px;', data);
        console.groupEnd();

        // ── CONSOLE: Bank Statement Summary ──────────────────────────────
        if (data.breakdown) {
            const bd = data.breakdown;

            // Compute totals from monthly_transactions if available in breakdown
            let totalCredit  = 0;
            let totalDebit   = 0;
            let closingBal   = null;
            const monthly    = bd.monthly_transactions || bd.monthly_breakdown || null;

            if (monthly) {
                const months = Object.keys(monthly);
                months.forEach(month => {
                    const txns = Array.isArray(monthly[month])
                        ? monthly[month]
                        : (monthly[month]?.transactions || []);
                    txns.forEach(t => {
                        totalCredit += parseFloat(t.credit || t.amount && t.type === 'credit' ? (t.credit ?? t.amount) : 0) || 0;
                        totalDebit  += parseFloat(t.debit  || t.amount && t.type === 'debit'  ? (t.debit  ?? t.amount) : 0) || 0;
                    });
                    // closing balance = balance of last transaction in last month
                    if (month === months[months.length - 1]) {
                        const lastTxn = txns[txns.length - 1];
                        if (lastTxn) closingBal = lastTxn.balance ?? monthly[month]?.closing_balance ?? null;
                    }
                });
            }

            console.group('%c📄 Bank Statement Summary', 'color:#198754;font-weight:bold;font-size:13px;');
            console.log('%c  Total Credit   :', 'color:green;font-weight:bold;',  `₹${totalCredit.toLocaleString('en-IN', {minimumFractionDigits:2})}`);
            console.log('%c  Total Debit    :', 'color:crimson;font-weight:bold;', `₹${totalDebit.toLocaleString('en-IN', {minimumFractionDigits:2})}`);
            console.log('%c  Net Flow       :', 'color:#0d6efd;font-weight:bold;', `₹${(totalCredit - totalDebit).toLocaleString('en-IN', {minimumFractionDigits:2})}`);
            if (closingBal !== null)
            console.log('%c  Closing Balance:', 'color:#6f42c1;font-weight:bold;', `₹${parseFloat(closingBal).toLocaleString('en-IN', {minimumFractionDigits:2})}`);
            console.groupEnd();

            // ── CONSOLE: Credit Score Breakdown ──────────────────────────
            console.group('%c🏆 Credit Score Breakdown', 'color:#fd7e14;font-weight:bold;font-size:13px;');
            console.log('  Final Score   :', data.credit_score, `(${data.grade})`);
            console.log('  NBFC Action   :', data.nbfc_action);
            console.log('  Step 1 FOIR   :', bd.step1_foir?.foir_pct + '%', '→', bd.step1_foir?.points, 'pts');
            console.log('  Step 2 Income :', '₹' + bd.step2_income_level?.income, '→', bd.step2_income_level?.points, 'pts');
            console.log('  Step 3 Consist:', bd.step3_income_consistency?.variation_pct + '%', '→', bd.step3_income_consistency?.points, 'pts');
            console.log('  Step 4 Bounces:', bd.step4_bounce_record?.total_bounces, '→', bd.step4_bounce_record?.points, 'pts');
            console.log('  Step 5 Balance:', '₹' + bd.step5_average_balance?.avg_balance, '→', bd.step5_average_balance?.points, 'pts');
            console.log('  Step 6 LTI    :', bd.step6_lti?.lti + 'x', '→', bd.step6_lti?.points, 'pts');
            console.log('  Step 7 Employ :', bd.step7_employment_type?.category, '→', bd.step7_employment_type?.points, 'pts');
            console.groupEnd();
        }

        // Save score to session
        if (data.credit_score) {
         session.credit_score = data.credit_score;
            if (data.credit_score) {
                localStorage.setItem('borrower_score', data.credit_score);
            } else {
                localStorage.removeItem('borrower_score');
            }
        }

        // Show verified documents view in-place
        if (data.bank_data || data.income_data) {
            showVerifiedDocs(data.bank_data, data.income_data, true);
        } else {
            showDocsAlert('success',
                `Documents uploaded! Your credit score is ${data.credit_score ?? 'being calculated'}.`
            );
        }

        const badgeDocs = document.getElementById('badge-docs');
        if (badgeDocs) badgeDocs.style.display = 'none';

    } catch {
        showDocsAlert('error', 'Cannot connect to server. Make sure the backend is running.');
    } finally {
        btn.disabled  = false;
        btn.innerHTML = '<i class="ti ti-upload"></i> Upload & Generate Score';
    }
}

// ── Check on page load if already scored ─────────────────────────────────────
//async function showVerifiedIfDone() {
//    // Only run on documents page
//    if (!document.getElementById('verified-docs-view')) return;
//
//    try {
//        const res  = await apiFetch(`/api/borrower/profile/${session.borrower_id}`);
//        if (!res.ok) return;
//        const data = await res.json();
//
//        if (data.kyc_status === 'submitted' && (data.bank_data || data.income_data)) {
//            const bank   = typeof data.bank_data   === 'string' ? JSON.parse(data.bank_data)   : data.bank_data;
//            const income = typeof data.income_data === 'string' ? JSON.parse(data.income_data) : data.income_data;
//            showVerifiedDocs(bank, income, false);
//        }
//    } catch (err) {
//        console.error('showVerifiedIfDone error:', err);
//    }
//}

async function showVerifiedIfDone() {
    // Only run on documents page
    if (!document.getElementById('verified-docs-view')) return;

    try {
        const [profileRes, loansRes] = await Promise.all([
            apiFetch(`/api/borrower/profile/${session.borrower_id}`),
            apiFetch(`/api/borrower/loans/${session.borrower_id}`)
        ]);
        if (!profileRes.ok) return;
        const data = await profileRes.json();

        // If their most recent loan is closed (or they've never had one),
        // let them upload fresh documents instead of showing the locked view.
        let mostRecentLoanClosed = true;
        if (loansRes.ok) {
            const loanData = await loansRes.json();
            const loans = loanData.loans || [];
            if (loans.length > 0) {
                mostRecentLoanClosed = loans[0].status === 'closed';
            }
        }

        if (data.kyc_status === 'submitted' && (data.bank_data || data.income_data) && !mostRecentLoanClosed) {
            const bank   = typeof data.bank_data   === 'string' ? JSON.parse(data.bank_data)   : data.bank_data;
            const income = typeof data.income_data === 'string' ? JSON.parse(data.income_data) : data.income_data;
            showVerifiedDocs(bank, income, false);
        }
        // else: leave the default upload form visible — fresh upload allowed
    } catch (err) {
        console.error('showVerifiedIfDone error:', err);
    }
}

// ── Render verified documents view ────────────────────────────────────────────
function showVerifiedDocs(bankData, incomeData, justUploaded) {
    const uploadForm = document.querySelector('.page-section.active');
    const verifiedView = document.getElementById('verified-docs-view');
    if (!verifiedView) return;

    // Hide upload form, show verified view
    if (uploadForm) uploadForm.style.display = 'none';
    verifiedView.style.display = 'block';

    // Banner text
    const bannerText = document.getElementById('verified-banner-text');
    if (bannerText) {
        bannerText.textContent = justUploaded
            ? 'Both documents verified successfully — AI scoring complete.'
            : 'Your documents are already verified. View your credit score below.';
    }

    // ── Bank statement card ───────────────────────────────────────────────────
    if (bankData) {
        setText('v-bank-name',    bankData.bank_name || 'Bank Statement');
        setText('v-bank-holder',  bankData.account_holder || '—');

        // Mask account number
        const acc = bankData.account_number || '';
        setText('v-bank-acc', acc.length > 4 ? 'XXXXXX' + acc.slice(-4) : acc || '—');
         setText('v-bank-ifsc', bankData.ifsc_code || '—');
        // Period
        const period = bankData.statement_period;
        if (period && period.from && period.to) {
            const fmt = d => { const p = d.split('/'); return p.length === 3 ? `${p[0]}/${p[1]}/${p[2]}` : d; };
            setText('v-bank-period', `${fmt(period.from)} – ${fmt(period.to)}`);
        }

        setText('v-bank-opening', bankData.opening_balance ? `₹${fmtNum(bankData.opening_balance)}` : '—');
        setText('v-bank-credit',  bankData.total_credits   ? `₹${fmtNum(bankData.total_credits)}`   : '—');
        setText('v-bank-debit',   bankData.total_debits    ? `₹${fmtNum(bankData.total_debits)}`    : '—');

        // Bounce tag
        const bounceEl = document.getElementById('v-bank-bounce');
        if (bounceEl) {
const count = bankData.bounce_count ?? 0;
        bounceEl.innerHTML = count === 0
            ? `<span class="bounce-tag-ok"><i class="ti ti-check"></i> 0 bounces</span>`
            : `<span class="bounce-tag-bad"><i class="ti ti-alert-triangle"></i> ${count} bounce${count > 1 ? 's' : ''}</span>`;
        }

       // ── Score impact strip ────────────────────────────────────────────────
        // Monthly income — derive from ITR monthly_equivalent or bank credits
        const monthlyIncome = bankData.avg_monthly_income
            || (incomeData && incomeData.monthly_equivalent)
            || (incomeData && incomeData.net_pay)
            || (incomeData && incomeData.net_salary)
            || 0;
        setText('si-income', monthlyIncome ? `₹${fmtNum(monthlyIncome)}` : '—');
        const incomeEl = document.getElementById('si-income-sub');
        if (incomeEl) {
            if (monthlyIncome >= 75000)      { incomeEl.textContent = 'Excellent tier'; incomeEl.className = 'si-sub si-good'; }
            else if (monthlyIncome >= 50000) { incomeEl.textContent = 'Eligible tier';  incomeEl.className = 'si-sub si-good'; }
            else if (monthlyIncome >= 30000) { incomeEl.textContent = 'Standard tier';  incomeEl.className = 'si-sub si-warn'; }
            else                             { incomeEl.textContent = 'Below threshold'; incomeEl.className = 'si-sub si-bad'; }
        }

        // Avg bank balance
//        const avgBal = bankData.avg_monthly_balance || bankData.opening_balance || 0;
const avgBal = bankData.avg_closing_balance
    || bankData.avg_monthly_balance
    || (session._bd && session._bd.step5_average_balance && session._bd.step5_average_balance.avg_balance)
    || 0;
        setText('si-balance', avgBal ? `₹${fmtNum(avgBal)}` : '—');
        const balEl = document.getElementById('si-balance-sub');
        if (balEl) {
            if (avgBal >= 50000)      { balEl.textContent = 'Strong';    balEl.className = 'si-sub si-good'; }
            else if (avgBal >= 25000) { balEl.textContent = 'Moderate';  balEl.className = 'si-sub si-warn'; }
            else                      { balEl.textContent = 'Low';       balEl.className = 'si-sub si-bad'; }
        }

        // Bounce count
        const bc = bankData.bounce_count ?? 0;
        setText('si-bounces', String(bc));
        const bcEl = document.getElementById('si-bounces-sub');
        if (bcEl) {
            if (bc === 0)     { bcEl.textContent = 'Clean record';     bcEl.className = 'si-sub si-good'; }
            else if (bc <= 2) { bcEl.textContent = 'Manageable';       bcEl.className = 'si-sub si-warn'; }
            else              { bcEl.textContent = 'High — impacts score'; bcEl.className = 'si-sub si-bad'; }
        }
    }

    // ── Income document card ──────────────────────────────────────────────────

    // ── Income document card ──────────────────────────────────────────────────
    const incomeRows = document.getElementById('v-income-rows');
    const incomeTitle = document.getElementById('v-income-doc-title');
    const incomeName  = document.getElementById('v-income-name');

    if (incomeData && incomeRows) {
        const source = incomeData.source || 'salary_slip';

        if (source === 'itr') {
            if (incomeTitle) incomeTitle.textContent = 'ITR (Income Tax Return)';
            if (incomeName)  incomeName.textContent  = `ITR ${incomeData.itr_type || ''} — AY ${incomeData.assessment_year || ''}`.trim();

            incomeRows.innerHTML = `
                <div class="verified-row"><span class="v-label">Taxpayer name</span><span class="v-val">${esc(incomeData.taxpayer_name || '—')}</span></div>
                <div class="verified-row"><span class="v-label">PAN number</span><span class="v-val">${esc(incomeData.pan_number || '—')}</span></div>
                <div class="verified-row"><span class="v-label">Assessment year</span><span class="v-val">${esc(incomeData.assessment_year || '—')}</span></div>
                <div class="verified-row"><span class="v-label">ITR form type</span><span class="v-val">${esc(incomeData.itr_type || '—')}</span></div>
                <div class="verified-row"><span class="v-label">Gross total income</span><span class="v-val">₹${fmtNum(incomeData.gross_total_income)}</span></div>
                <div class="verified-row"><span class="v-label">Net taxable income</span><span class="v-val highlight-green">₹${fmtNum(incomeData.net_taxable_income)}</span></div>
                <div class="verified-row"><span class="v-label">Monthly equivalent</span><span class="v-val">₹${fmtNum(incomeData.monthly_equivalent)}</span></div>
                <div class="verified-row"><span class="v-label">Employment type</span>
                  <span class="emp-tag">${esc(incomeData.employment_type || '—')}</span>
                </div>`;
        } else {
            // Salary slip
            if (incomeTitle) incomeTitle.textContent = 'Salary Slip';
            if (incomeName)  incomeName.textContent  = incomeData.employer_name || 'Employer';

            incomeRows.innerHTML = `
                <div class="verified-row"><span class="v-label">Employee name</span><span class="v-val">${esc(incomeData.employee_name || '—')}</span></div>
                <div class="verified-row"><span class="v-label">Employer</span><span class="v-val">${esc(incomeData.employer_name || '—')}</span></div>
                <div class="verified-row"><span class="v-label">Designation</span><span class="v-val">${esc(incomeData.designation || '—')}</span></div>
                <div class="verified-row"><span class="v-label">Pay period</span><span class="v-val">${esc((incomeData.month || '') + ' ' + (incomeData.year || ''))}</span></div>
                <div class="verified-row"><span class="v-label">Gross salary</span><span class="v-val">₹${fmtNum(incomeData.gross_salary)}</span></div>
                <div class="verified-row"><span class="v-label">Deductions</span><span class="v-val highlight-red">− ₹${fmtNum(incomeData.total_deductions || 0)}</span></div>
                <div class="verified-row"><span class="v-label">Net pay</span><span class="v-val highlight-green">₹${fmtNum(incomeData.net_salary)}</span></div>
                <div class="verified-row"><span class="v-label">Identity match</span>
                  <span class="emp-tag"><i class="ti ti-check"></i> Name matched</span>
                </div>`;
        }
    }
}



function reUploadDocs() {
    const verifiedView = document.getElementById('verified-docs-view');
    const uploadForm   = document.querySelector('.page-section.active') ||
                         document.querySelector('.page-section');
    if (verifiedView) verifiedView.style.display = 'none';
    if (uploadForm)   uploadForm.style.display   = 'block';
}

// ── Load loans ────────────────────────────────────────────────────────────────
async function loadLoans() {
    try {
        const res  = await apiFetch(`/api/borrower/loans/${session.borrower_id}`);
        const data = await res.json();

        if (!res.ok || !data.loans || data.loans.length === 0) {
            document.getElementById('no-loans-card').style.display    = 'block';
            document.getElementById('loans-table-card').style.display = 'none';
            return;
        }

        document.getElementById('no-loans-card').style.display    = 'none';
        document.getElementById('loans-table-card').style.display = 'block';

        const tbody = document.getElementById('loansBody');
        tbody.innerHTML = data.loans.map(l => `
            <tr>
                <td><strong>${esc(l.nbfc_name || '—')}</strong></td>
                <td>₹${fmtNum(l.amount)}</td>
                <td>${l.tenure_months} mo</td>
                <td>${l.emi_amount ? '₹' + fmtNum(l.emi_amount) : '—'}</td>
                <td>${statusBadge(l.status)}</td>
                <td>${formatDate(l.applied_at)}</td>
            </tr>`
        ).join('');

        // Show EMI schedule if active loan exists
        const activeLoan = data.loans.find(l => l.status === 'active');
        if (activeLoan) {
            loadEMISchedule(activeLoan.id);
            showActiveLoanCard(activeLoan);
        }

    } catch (err) {
        console.error('Loans load error:', err);
    }
}

// ── Load EMI schedule ─────────────────────────────────────────────────────────
async function loadEMISchedule(loanId) {
    try {
        const res  = await apiFetch(`/api/borrower/emi-schedule/${loanId}`);
        const data = await res.json();
        if (!res.ok || !data.schedule) return;

        document.getElementById('emi-schedule-card').style.display = 'block';

        const tbody = document.getElementById('emiBody');
        tbody.innerHTML = data.schedule.map(e => `
            <tr>
                <td>${e.emi_number}</td>
                <td>${formatDate(e.due_date)}</td>
                <td>₹${fmtNum(e.amount)}</td>
                <td>₹${fmtNum(e.principal)}</td>
                <td>₹${fmtNum(e.interest)}</td>
                <td>${statusBadge(e.status)}</td>
            </tr>`
        ).join('');

    } catch {}
}

// ── Show active loan in overview ──────────────────────────────────────────────
function showActiveLoanCard(loan) {
    const card = document.getElementById('activeLoanCard');
    const body = document.getElementById('activeLoanBody');
    if (!card || !body) return;

    card.style.display = 'block';
    body.innerHTML = `
        <div class="profile-rows">
            <div class="profile-row">
                <span class="profile-label">Lender</span>
                <span class="profile-val">${esc(loan.nbfc_name || '—')}</span>
            </div>
            <div class="profile-row">
                <span class="profile-label">Loan Amount</span>
                <span class="profile-val">₹${fmtNum(loan.amount)}</span>
            </div>
            <div class="profile-row">
                <span class="profile-label">Monthly EMI</span>
                <span class="profile-val">₹${fmtNum(loan.emi_amount)}</span>
            </div>
            <div class="profile-row">
                <span class="profile-label">Tenure</span>
                <span class="profile-val">${loan.tenure_months} months</span>
            </div>
            <div class="profile-row">
                <span class="profile-label">Status</span>
                <span class="profile-val">${statusBadge('active')}</span>
            </div>
        </div>`;
}

// ── Page navigation ───────────────────────────────────────────────────────────
function showPage(name) {
    document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(`page-${name}`).classList.add('active');
    document.getElementById(`nav-${name}`)?.classList.add('active');

    // Lazy load
    if (name === 'nbfcs') loadNBFCs();
    if (name === 'loans') loadLoans();
}

// ── Logout ────────────────────────────────────────────────────────────────────
function handleLogout() {
    ['borrower_token','borrower_id','borrower_name','borrower_email',
     'borrower_mobile','borrower_aadhaar','borrower_pan',
     'borrower_kyc_status','borrower_score'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/borrower/login';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function apiFetch(url, method = 'GET', body = null) {
    return fetch(`${API}${url}`, {
        method,
        headers: {
            'Authorization': `Bearer ${session.access_token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

function scoreInfo(score) {
    if (score >= 800) return { color: '#0e8c6a', grade: 'Excellent',  sub: 'You qualify for the best loan offers.' };
    if (score >= 750) return { color: '#3da8c0', grade: 'Good',       sub: 'You qualify for most loan offers.' };
    if (score >= 600) return { color: '#d4820a', grade: 'Fair',       sub: 'Limited offers available. Improve your score.' };
    return               { color: '#c0392b', grade: 'Poor',       sub: 'Very few offers. Focus on improving your score.' };
}

function maskAadhaar(n) {
    if (!n) return '—';
//    return 'XXXX XXXX ' + n.slice(-4);
    return  n;

}

function showDocsAlert(type, msg) {
    const err = document.getElementById('docs-alert-err');
    const ok  = document.getElementById('docs-alert-ok');
    err.classList.remove('show');
    ok.classList.remove('show');
    if (!type || !msg) return;
    if (type === 'error') {
        err.innerHTML = `<i class="ti ti-alert-circle"></i> ${msg}`;
        err.classList.add('show');
    } else {
        ok.innerHTML = `<i class="ti ti-circle-check"></i> ${msg}`;
        ok.classList.add('show');
    }
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function statusBadge(status) {
    if (!status || status === 'none') return '—';
    const labels = {
        pending: 'Pending', approved: 'Approved', active: 'Active',
        rejected: 'Rejected', closed: 'Closed', paid: 'Paid',
        overdue: 'Overdue', submitted: 'Submitted', verified: 'Verified',
    };
    return `<span class="badge-status ${status}">${labels[status] || status}</span>`;
}

function formatDate(str) {
    if (!str) return '—';
    const d    = new Date(str);
    const now  = new Date();
    const diff = Math.floor((now - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7)   return `${diff}d ago`;
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'2-digit' });
}

function fmtNum(n) {
    if (!n && n !== 0) return '0';
    return Number(n).toLocaleString('en-IN');
}

function esc(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Show/hide salary vs ITR card based on employment_type ────────────────────
function applyDocMode() {
    const empType    = localStorage.getItem('borrower_employment_type') || '';
    const isSelf     = empType.toLowerCase().includes('self');
    const cardSalary = document.getElementById('card-salary');
    const cardItr    = document.getElementById('card-itr');
    const pageSub    = document.getElementById('page-sub-docs');

    if (!cardSalary && !cardItr) return; // not on documents page

    if (isSelf) {
        if (cardSalary) cardSalary.style.display = 'none';
        if (cardItr)    cardItr.style.display    = 'block';
        if (pageSub)    pageSub.textContent      = 'Upload your bank statement and ITR to generate your credit score.';
        window._incomeDocType = 'itr';
    } else {
        if (cardSalary) cardSalary.style.display = 'block';
        if (cardItr)    cardItr.style.display    = 'none';
        if (pageSub)    pageSub.textContent      = 'Upload your bank statement and salary slip to generate your credit score.';
        window._incomeDocType = 'salary';
    }
}

// ── Loan Amount logic ─────────────────────────────────────────────────────
function setLoanAmount(amount) {
//  document.getElementById('loan-amount-input').value = amount;
document.getElementById('requested_loan_amount').value = amount;
  document.querySelectorAll('.quick-amt-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  onLoanAmountChange();
}

function onLoanAmountChange() {
  document.querySelectorAll('.quick-amt-btn').forEach(b => b.classList.remove('active'));
  const amount  = parseFloat(document.getElementById('requested_loan_amount').value);
  const display = document.getElementById('loan-amount-display');
  const text    = document.getElementById('loan-amount-display-text');
  if (amount && amount >= 10000) {
    text.textContent = '₹' + Number(amount).toLocaleString('en-IN') + ' selected';
    display.style.display = 'flex';
    document.getElementById('e_loan_amount').classList.remove('show');
  } else {
    display.style.display = 'none';
  }
}

// ── Patch uploadDocuments to validate loan amount ──────────────────────────
const _origUpload = uploadDocuments;
uploadDocuments = async function() {
  const amount = parseFloat(document.getElementById('requested_loan_amount').value);
  const errEl  = document.getElementById('e_loan_amount');

  if (!amount || amount < 10000) {
    errEl.classList.add('show');
    errEl.textContent = amount && amount < 10000
      ? 'Minimum loan amount is ₹10,000'
      : 'Please enter the loan amount you need';
    return;
  }
  errEl.classList.remove('show');

  // Save to localStorage so scoring service can use it
  localStorage.setItem('requested_loan_amount', amount);

  await _origUpload();
};


// ── Sidebar toggle ────────────────────────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
        if (overlay) overlay.classList.toggle('show');
    } else {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebar_collapsed',
            sidebar.classList.contains('collapsed') ? '1' : '0'
        );
    }
}

// ── Restore sidebar state on page load ───────────────────────────────────────
function restoreSidebar() {
    if (window.innerWidth <= 768) return; // skip on mobile
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    if (localStorage.getItem('sidebar_collapsed') === '1') {
        sidebar.classList.add('collapsed');
    }
}
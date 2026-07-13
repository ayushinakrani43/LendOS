//// ═══════════════════════════════════════════════════════════════
////  loan-apply.js  —  LendOS Borrower Loan Application
//// ═══════════════════════════════════════════════════════════════
//
//const API = 'http://localhost:8000';
//
//// ── State ─────────────────────────────────────────────────────
//let nbfc             = null;
//let monthlyIncome    = 0;     // from income_data (salary/ITR)
//let existingEmis     = 0;     // from credit score step1_foir
//let safeEmi          = 0;     // (monthlyIncome × NBFC FOIR%) - existingEmis
//
//// ── Session ───────────────────────────────────────────────────
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
//// ── On load ───────────────────────────────────────────────────
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
//    // Read selected NBFC from localStorage
//    const nbfcId       = localStorage.getItem('selected_nbfc_id');
//    const nbfcName     = localStorage.getItem('selected_nbfc_name');
//    const nbfcInterest = parseFloat(localStorage.getItem('selected_nbfc_interest'));
//    const nbfcNotice   = localStorage.getItem('selected_nbfc_notice') || '';
//
//    // All required — if missing redirect back
//    if (!nbfcId || !nbfcName || !nbfcInterest) {
//        window.location.href = '/borrower/nbfcs';
//        return;
//    }
//
//    // Fetch full NBFC details from API to get min/max loan + tenure
//    try {
//        const res  = await fetch(`${API}/api/borrower/nbfcs?score=${session.credit_score || 0}`, {
//            headers: { 'Authorization': `Bearer ${session.access_token}` }
//        });
//        const data = await res.json();
//        nbfc = data.nbfcs?.find(n => String(n.id) === String(nbfcId));
//    } catch (e) {
//        console.error('Failed to load NBFC list', e);
//    }
//
//    // Fallback with localStorage data if API fails
//    if (!nbfc) {
//        nbfc = {
//            id:                parseInt(nbfcId),
//            company_name:      nbfcName,
//            interest_rate:     nbfcInterest,
//            logo_url:          null,
//            processing_fee:    2,
//            min_loan_amount:   10000,
//            max_loan_amount:   5000000,
//            min_tenure_months: 6,
//            max_tenure_months: 60,
//        };
//    }
//
//    // Show rate notice if set
//    if (nbfcNotice) {
//        document.getElementById('rateNoticeBox').style.display  = 'flex';
//        document.getElementById('rateNoticeText').textContent   = nbfcNotice;
//    }
//
//    // Render lender card
//    renderLenderCard();
//
//    // Configure sliders from NBFC limits
//    configureSliders();
//
//    // Fetch borrower profile → get avg_closing_balance
//    await loadBorrowerProfile(session);
//
//    // Attach events
//    attachEvents();
//
//    // Initial calculation
//    recalculate();
//});
//
//// ── Render lender card ────────────────────────────────────────
//function renderLenderCard() {
//    document.getElementById('pageSubtitle').textContent =
//        `Applying with ${nbfc.company_name}`;
//
//    const logoBox = document.getElementById('lenderLogo');
//    const foirLabel = document.getElementById('arSafeEmiLabel');
//
//const foirPct = nbfc.max_foir_percent || 50;
//if (foirLabel) foirLabel.textContent = `Safe EMI Limit (${foirPct}%)`;
//const barLabel = document.getElementById('affordBarLimitLabel');
//if (barLabel) {
//    barLabel.textContent = `Safe ${foirPct}%`;
//    barLabel.style.left = `${foirPct}%`;
//}
//const limitMarker = document.querySelector('.afford-bar-limit');
//if (limitMarker) limitMarker.style.left = `${foirPct}%`;
//    if (nbfc.logo_url) {
//        logoBox.innerHTML = `<img src="${nbfc.logo_url}" alt="${esc(nbfc.company_name)}"/>`;
//    } else {
//        logoBox.textContent = nbfc.company_name.split(' ').slice(0, 2)
//            .map(w => w[0]).join('').toUpperCase();
//    }
//
//    document.getElementById('lenderName').textContent = nbfc.company_name;
//
//    // Inject chip-style meta pills
//    const metaEl = document.getElementById('lenderMeta');
//    if (metaEl) {
//        metaEl.innerHTML = `
//            <span class="lender-chip teal">
//                <i class="ti ti-percentage"></i>${nbfc.interest_rate}% p.a.
//            </span>
//            <span class="lender-chip">Fee ${nbfc.processing_fee}%</span>
//            <span class="lender-chip">${nbfc.min_tenure_months}–${nbfc.max_tenure_months} mo</span>
//            <span class="lender-chip">
//                <i class="ti ti-shield-check"></i>RBI Registered
//            </span>
//        `;
//    }
//
//    document.getElementById('sumRate').textContent = `${nbfc.interest_rate}% p.a.`;
//}
//
//// ── Configure sliders ─────────────────────────────────────────
//function configureSliders() {
//    const loanSlider   = document.getElementById('loanSlider');
//    const tenureSlider = document.getElementById('tenureSlider');
//
//    loanSlider.min   = nbfc.min_loan_amount;
//    loanSlider.max   = nbfc.max_loan_amount;
//    loanSlider.step  = 1000;
//    loanSlider.value = Math.min(100000, nbfc.max_loan_amount);
//
//    tenureSlider.min   = nbfc.min_tenure_months;
//    tenureSlider.max   = nbfc.max_tenure_months;
//    tenureSlider.step  = 1;
//    tenureSlider.value = nbfc.min_tenure_months;
//
//    document.getElementById('loanAmountInput').value = loanSlider.value;
//    document.getElementById('tenureInput').min   = nbfc.min_tenure_months;
//    document.getElementById('tenureInput').max   = nbfc.max_tenure_months;
//    document.getElementById('tenureInput').value = nbfc.min_tenure_months;
//    document.getElementById('sliderMin').textContent  = '₹' + fmtNum(nbfc.min_loan_amount);
//    document.getElementById('sliderMax').textContent  = '₹' + fmtNum(nbfc.max_loan_amount);
//    document.getElementById('tenureMin').textContent  = `${nbfc.min_tenure_months} mo`;
//    document.getElementById('tenureMax').textContent  = `${nbfc.max_tenure_months} mo`;
//    const draftAmount  = parseInt(localStorage.getItem('loan_draft_amount'));
//    const draftTenure  = parseInt(localStorage.getItem('loan_draft_tenure'));
//    const draftPurpose = localStorage.getItem('loan_draft_purpose');
//
//    if (draftAmount && draftAmount >= nbfc.min_loan_amount && draftAmount <= nbfc.max_loan_amount) {
//        loanSlider.value = draftAmount;
//        document.getElementById('loanAmountInput').value = draftAmount;
//    }
//    if (draftTenure && draftTenure >= nbfc.min_tenure_months && draftTenure <= nbfc.max_tenure_months) {
//        tenureSlider.value = draftTenure;
//        document.getElementById('tenureInput').value = draftTenure;
//    }
//    if (draftPurpose) {
//        document.getElementById('loanPurpose').value = draftPurpose;
//    }
//
//
//}
//
//// ── Load borrower profile ─────────────────────────────────────
//async function loadBorrowerProfile(session) {
//    try {
//        // Fetch profile (income_data, bank_data) and score breakdown in parallel
//        const [profileRes, scoreRes] = await Promise.all([
//            fetch(`${API}/api/borrower/profile/${session.borrower_id}`,
//                { headers: { 'Authorization': `Bearer ${session.access_token}` } }),
//            fetch(`${API}/api/borrower/score/${session.borrower_id}`,
//                { headers: { 'Authorization': `Bearer ${session.access_token}` } }),
//        ]);
//
//        const profileData = await profileRes.json();
//        const scoreData   = await scoreRes.json();
//
//        // STEP 1 — Monthly Income (correct FOIR base = net salary or monthly ITR equivalent)
//        const incomeData  = profileData.income_data || {};
//        monthlyIncome = incomeData.net_salary          // salaried: salary slip net pay
//                     || incomeData.monthly_equivalent   // self-employed: ITR ÷ 12
//                     || 0;
//
//        // Fallback: avg monthly credits from bank statement ÷ 3 months
//        if (!monthlyIncome && profileData.bank_data?.total_credits) {
//            monthlyIncome = profileData.bank_data.total_credits / 3;
//        }
//
//        // STEP 2 — Existing EMI obligations detected by credit scoring (step1_foir)
//        const breakdown = scoreData.breakdown || null;
//        existingEmis = breakdown?.step1_foir?.avg_monthly_obligations || 0;
//
//        // STEP 3 — Safe EMI = (Monthly Income × NBFC FOIR limit) − Existing EMI Obligations
//        const foirLimit = (nbfc.max_foir_percent || 50) / 100;
//        safeEmi = (monthlyIncome * foirLimit) - existingEmis;
//        safeEmi = Math.max(safeEmi, 0); // never negative
//
//        // Update affordability card rows
//        document.getElementById('arIncome').textContent =
//            monthlyIncome ? '₹' + fmtINR(Math.round(monthlyIncome)) : '₹—';
//        document.getElementById('arExistingEmi').textContent =
//            '₹' + fmtINR(Math.round(existingEmis));
//        document.getElementById('arSafeEmi').textContent =
//            safeEmi ? '₹' + fmtINR(Math.round(safeEmi)) : '₹—';
//
//    } catch (e) {
//        console.error('Could not load profile', e);
//    }
//}
//
//// ── Attach events ─────────────────────────────────────────────
//function attachEvents() {
//    const loanSlider      = document.getElementById('loanSlider');
//    const loanAmountInput = document.getElementById('loanAmountInput');
//    const tenureSlider    = document.getElementById('tenureSlider');
//    const purposeSelect   = document.getElementById('loanPurpose');
//
//    // Loan slider → input
//    loanSlider.addEventListener('input', () => {
//        loanAmountInput.value = loanSlider.value;
//        recalculate();
//    });
//
//    // Amount input → slider
//// Amount input → slider (free typing; clamp on blur)
//loanAmountInput.addEventListener('input', () => {
//    const raw = parseInt(loanAmountInput.value) || 0;
//    if (raw >= nbfc.min_loan_amount && raw <= nbfc.max_loan_amount) {
//        loanSlider.value = raw;
//        recalculate();
//    }
//});
//
//loanAmountInput.addEventListener('blur', () => {
//    let val = parseInt(loanAmountInput.value);
//    if (isNaN(val) || val === 0) val = nbfc.min_loan_amount;
//    val = Math.max(nbfc.min_loan_amount, Math.min(nbfc.max_loan_amount, val));
//    loanAmountInput.value = val;
//    loanSlider.value = val;
//    recalculate();
//});
//
//    // Tenure input (typed)
//    const tenureInput = document.getElementById('tenureInput');
//    tenureInput.addEventListener('input', () => {
//        let val = parseInt(tenureInput.value) || nbfc.min_tenure_months;
//        val = Math.max(nbfc.min_tenure_months, Math.min(nbfc.max_tenure_months, val));
//        tenureSlider.value = val;
//        recalculate();
//    });
//
//    // Tenure slider → input
//    tenureSlider.addEventListener('input', () => {
//        document.getElementById('tenureInput').value = tenureSlider.value;
//        recalculate();
//    });
//
//    // Purpose → re-check proceed button
////    purposeSelect.addEventListener('change', updateProceedBtn);
//purposeSelect.addEventListener('change', () => updateProceedBtn());
//}
//
//// ── Core: recalculate everything ─────────────────────────────
//function recalculate() {
//    const loanAmount = parseInt(document.getElementById('loanSlider').value) || 0;
//    const tenure     = parseInt(document.getElementById('tenureSlider').value) || 12;
//    const rate       = nbfc.interest_rate;
//    const fee        = nbfc.processing_fee;
//
//    // Sync tenure input with slider
//    document.getElementById('tenureInput').value = tenure;
//
//    // EMI formula
//    const r   = (rate / 100) / 12;
//    const emi = loanAmount > 0
//        ? Math.round(loanAmount * r * Math.pow(1+r, tenure) / (Math.pow(1+r, tenure) - 1))
//        : 0;
//
//    const totalPayable    = emi * tenure;
//    const totalInterest   = totalPayable - loanAmount;
//    const processingFee   = Math.round(loanAmount * (fee / 100));
//    const amountDisbursed = loanAmount - processingFee;
//
//    // Update summary card
//    document.getElementById('emiAmount').textContent    = '₹' + fmtINR(emi);
//    document.getElementById('sumLoanAmt').textContent   = '₹' + fmtINR(loanAmount);
//    document.getElementById('sumTenure').textContent    = `${tenure} months`;
//    document.getElementById('sumInterest').textContent  = '₹' + fmtINR(totalInterest);
//    document.getElementById('sumTotal').textContent     = '₹' + fmtINR(totalPayable);
//    document.getElementById('sumFee').textContent       = '₹' + fmtINR(processingFee);
//    document.getElementById('sumDisbursed').textContent = '₹' + fmtINR(amountDisbursed);
//
//    // Affordability check
//    checkAffordability(emi, loanAmount, tenure, rate);
//
//    // Update slider track fill color
//    updateSliderFill();
//}
//
//// ── Affordability check ───────────────────────────────────────
//function checkAffordability(emi, loanAmount, tenure, rate) {
//    const affordMsg      = document.getElementById('affordMsg');
//    const affordBarFill  = document.getElementById('affordBarFill');
//    const suggestionsWrap = document.getElementById('suggestionsWrap');
//    const arEmi          = document.getElementById('arEmi');
//
//    arEmi.textContent = '₹' + fmtINR(emi);
//
//    // No income data yet
//    if (!monthlyIncome) {
//        affordMsg.className = 'afford-msg';
//        affordMsg.innerHTML = `<i class="ti ti-info-circle afford-msg-icon"></i>
//            <span>Income data not available. Upload salary slip or ITR to enable affordability check.</span>`;
//        affordBarFill.style.width      = '0%';
//        affordBarFill.style.background = '#cbd5e1';
//        suggestionsWrap.style.display  = 'none';
//        updateProceedBtn();
//        return;
//    }
//
//    // No loan amount entered
//    if (loanAmount === 0 || emi === 0) {
//        affordMsg.className = 'afford-msg';
//        affordMsg.innerHTML = `<i class="ti ti-loader afford-msg-icon"></i>
//            <span>Enter loan details to check affordability.</span>`;
//        affordBarFill.style.width      = '0%';
//        affordBarFill.style.background = '#cbd5e1';
//        suggestionsWrap.style.display  = 'none';
//        updateProceedBtn();
//        return;
//    }
//
//    // ✅ CORRECT FOIR formula
//    // FOIR = (existing obligations + new EMI) / monthly income × 100
//    const foirLimit = nbfc.max_foir_percent || 50;
//    const foir      = ((existingEmis + emi) / monthlyIncome) * 100;
//    const barWidth  = Math.min(foir, 100);
//
//
//    affordBarFill.style.width = barWidth + '%';
//    arEmi.style.color = '';
//
//    if (foir <= foirLimit) {
//        // ✅ Safe
//        affordBarFill.style.background = '#10b981';
//        affordMsg.className = 'afford-msg state-safe';
//        affordMsg.innerHTML = `<i class="ti ti-circle-check afford-msg-icon"></i>
//            <span>You can afford this EMI. FOIR: ${foir.toFixed(1)}% (limit: ${foirLimit}%)</span>`;
//        suggestionsWrap.style.display = 'none';
//        arEmi.style.color = '#10b981';
//
//} else if (foir <= foirLimit + 10) {
//    // ⚠️ Tight (within 10% above limit)
//    affordBarFill.style.background = '#f59e0b';
//    affordMsg.className = 'afford-msg state-warn';
//    affordMsg.innerHTML = `<i class="ti ti-alert-triangle afford-msg-icon"></i>
//        <span>EMI is above safe FOIR limit of ${foirLimit}% (yours: ${foir.toFixed(1)}%). Consider reducing amount.</span>`;
//    arEmi.style.color = '#f59e0b';
//    showSuggestions(loanAmount, tenure, rate);   // ← remove the 'none' line and add this
//
//    } else {
//        // ❌ Blocked
//        affordBarFill.style.background = '#ef4444';
//        affordMsg.className = 'afford-msg state-block';
//        affordMsg.innerHTML = `<i class="ti ti-x afford-msg-icon"></i>
//            <span>FOIR ${foir.toFixed(1)}% exceeds limit of ${foirLimit}%. See safe options below.</span>`;
//        arEmi.style.color = '#ef4444';
//        showSuggestions(loanAmount, tenure, rate);
//    }
//
//    updateProceedBtn(foir);
//}
//
//// ── Generate suggestions ──────────────────────────────────────
//function showSuggestions(requestedAmount, requestedTenure, rate) {
//    const suggestionsWrap = document.getElementById('suggestionsWrap');
//    const suggestionsList = document.getElementById('suggestionsList');
//
//    suggestionsWrap.style.display = 'block';
//
//    const r           = (rate / 100) / 12;
//    const tenureOptions = [];
//
//    // Generate options for multiple tenures within NBFC limits
//    const tenuresToTry = [
//        requestedTenure,
//        Math.min(requestedTenure + 12, nbfc.max_tenure_months),
//        Math.min(requestedTenure + 24, nbfc.max_tenure_months),
//    ].filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate
//
//    tenuresToTry.forEach(n => {
//        // Max safe loan for this tenure
//        let maxLoan = safeEmi * (Math.pow(1+r, n) - 1) / (r * Math.pow(1+r, n));
//        maxLoan = Math.round(maxLoan / 100) * 100; // round to nearest 100
//        maxLoan = Math.min(maxLoan, nbfc.max_loan_amount);
//        maxLoan = Math.max(maxLoan, nbfc.min_loan_amount);
//
//        const emiAtSafe = Math.round(
//            maxLoan * r * Math.pow(1+r, n) / (Math.pow(1+r, n) - 1)
//        );
//    const foirAtSafe = (((existingEmis + emiAtSafe) / monthlyIncome) * 100).toFixed(1);
//
//        tenureOptions.push({ tenure: n, maxLoan, emi: emiAtSafe, foir: foirAtSafe });
//    });
//
//    suggestionsList.innerHTML = tenureOptions.map(opt => `
//        <div class="suggestion-row">
//            <div class="suggestion-info">
//                <div class="suggestion-tenure">${opt.tenure} months</div>
//                <div class="suggestion-amount">₹${fmtINR(opt.maxLoan)}</div>
//                <div class="suggestion-emi">EMI ₹${fmtINR(opt.emi)} · FOIR ${opt.foir}% ✅</div>
//            </div>
//            <button class="suggestion-set-btn"
//                onclick="setLoan(${opt.maxLoan}, ${opt.tenure})">
//                Set this
//            </button>
//        </div>
//    `).join('');
//}
//
//// ── Set loan from suggestion ──────────────────────────────────
//function setLoan(amount, tenure) {
//    const loanSlider      = document.getElementById('loanSlider');
//    const loanAmountInput = document.getElementById('loanAmountInput');
//    const tenureSlider    = document.getElementById('tenureSlider');
//
//    loanSlider.value      = amount;
//    loanAmountInput.value = amount;
//    tenureSlider.value    = tenure;
//
//    document.getElementById('tenureInput').value = tenure;
//    recalculate();
//
//    // Scroll to form
//    document.getElementById('loanSlider').scrollIntoView({ behavior: 'smooth', block: 'center' });
//}
//
//// ── Enable/disable proceed button ────────────────────────────
//function updateProceedBtn(foir) {
//    const btn        = document.getElementById('proceedBtn');
//    const purpose    = document.getElementById('loanPurpose').value;
//    const loanAmount = parseInt(document.getElementById('loanSlider').value) || 0;
//
//const foirLimit = nbfc?.max_foir_percent || 50;
////const foirOk    = !foir || foir <= (foirLimit + 10);
//const foirOk = !foir || foir <= foirLimit;
//    const purposeOk = !!purpose;
//    const amountOk  = loanAmount >= nbfc.min_loan_amount;
//
//    btn.disabled = !(foirOk && purposeOk && amountOk);
//}
//
//// ── Submit application ────────────────────────────────────────
//async function submitApplication() {
//    const session    = getSession();
//    const loanAmount = parseInt(document.getElementById('loanSlider').value);
//    const tenure     = parseInt(document.getElementById('tenureSlider').value);
//    const purpose    = document.getElementById('loanPurpose').value;
//    const rate       = nbfc.interest_rate;
//
//    const r   = (rate / 100) / 12;
//    const emi = Math.round(loanAmount * r * Math.pow(1+r, tenure) / (Math.pow(1+r, tenure) - 1));
//
//    // Frontend FOIR guard — block submission if EMI exceeds safe limit
//    if (monthlyIncome > 0) {
//        const foirLimit  = nbfc.max_foir_percent || 50;
//        const foirActual = ((existingEmis + emi) / monthlyIncome) * 100;
//        if (foirActual > foirLimit) {
//            alert(`❌ Your EMI of ₹${fmtINR(emi)} exceeds the safe FOIR limit of ${foirLimit}%.\n\nPlease select a lower amount or longer tenure from the suggestions below.`);
//            return;
//        }
//    }
//
//    const totalPayable    = emi * tenure;
//    const totalInterest   = totalPayable - loanAmount;
//    const processingFee   = Math.round(loanAmount * (nbfc.processing_fee / 100));
//    const amountDisbursed = loanAmount - processingFee;
//const foir = monthlyIncome ? ((existingEmis + emi) / monthlyIncome) * 100 : null;
//
//    const btn = document.getElementById('proceedBtn');
//    btn.disabled   = true;
//    btn.innerHTML  = '<i class="ti ti-loader-2"></i> Submitting…';
//
//    try {
//        const res = await fetch(`${API}/api/borrower/loan-application`, {
//            method:  'POST',
//            headers: {
//                'Content-Type':  'application/json',
//                'Authorization': `Bearer ${session.access_token}`
//            },
//            body: JSON.stringify({
//                borrower_id:          session.borrower_id,
//                nbfc_id:              nbfc.id,
//                loan_amount:          loanAmount,
//                tenure_months:        tenure,
//                purpose:              purpose,
//                interest_rate:        rate,
//                emi_amount:           emi,
//                total_interest:       totalInterest,
//                total_payable:        totalPayable,
//                processing_fee_amount: processingFee,
//                amount_disbursed:     amountDisbursed,
//               monthly_income:       Math.round(monthlyIncome),
//                existing_emis:        Math.round(existingEmis),
//                safe_emi:             Math.round(safeEmi),
//                foir_at_application:  foir ? parseFloat(foir.toFixed(1)) : null,
//            })
//        });
//
//        const data = await res.json();
//
//   if (!res.ok) {
//    // data.detail may be a string, object, or missing entirely
//    // data.error is set directly for already_applied / emi_too_high
//    const errCode = data.error
//        || (typeof data.detail === 'object' ? data.detail?.error : null)
//        || '';
//
////    if (errCode === 'already_applied') {
////        const appId = data.application_id
////            || (typeof data.detail === 'object' ? data.detail?.application_id : null);
////        if (appId) {
////            window.location.href = `/borrower/loans/agreement?id=${appId}`;
////            return;
////        }
////    }
//if (errCode === 'already_applied') {
//        const appId = data.application_id
//            || (typeof data.detail === 'object' ? data.detail?.application_id : null);
//        if (appId) {
//            // Save current form values as draft before redirecting
//            localStorage.setItem('loan_draft_amount',  document.getElementById('loanSlider').value);
//            localStorage.setItem('loan_draft_tenure',  document.getElementById('tenureSlider').value);
//            localStorage.setItem('loan_draft_purpose', document.getElementById('loanPurpose').value);
//            window.location.href = `/borrower/loans/agreement?id=${appId}`;
//            return;
//        }
//    }
//
//    if (errCode === 'emi_too_high') {
//        const maxLoan = data.max_safe_loan
//            || (typeof data.detail === 'object' ? data.detail?.max_safe_loan : 0);
//        const msg = (typeof data.detail === 'object' ? data.detail?.detail : data.detail)
//            || 'EMI too high.';
//        alert(`❌ ${msg}\n\nMax safe loan: ₹${fmtINR(maxLoan)}`);
//    } else {
//        const msg = typeof data.detail === 'string'
//            ? data.detail
//            : typeof data.detail === 'object'
//                ? JSON.stringify(data.detail)
//                : data.message || data.error || 'Submission failed. Please try again.';
//        alert(msg);
//    }
//
//    btn.disabled  = false;
//    btn.innerHTML = '<i class="ti ti-file-check"></i> Proceed to Agreement';
//    return;
//}
//
//        // Save application_id and redirect to agreement
////        localStorage.setItem('loan_application_id', data.application_id);
////                localStorage.setItem('loan_draft_amount', loanAmount);
////        localStorage.setItem('loan_draft_tenure', tenure);
////        localStorage.setItem('loan_draft_purpose', purpose);
////        window.location.href = `/borrower/loans/agreement?id=${data.application_id}`;
//// Save draft so borrower can see their values if they come back
//        localStorage.setItem('loan_application_id',  data.application_id);
//        localStorage.setItem('loan_draft_amount',     loanAmount);
//        localStorage.setItem('loan_draft_tenure',     tenure);
//        localStorage.setItem('loan_draft_purpose',    purpose);
//        // Clear only after a brand new successful application
//        localStorage.removeItem('loan_draft_amount');
//        localStorage.removeItem('loan_draft_tenure');
//        localStorage.removeItem('loan_draft_purpose');
//        window.location.href = `/borrower/loans/agreement?id=${data.application_id}`;
//    } catch (err) {
//        alert('Cannot connect to server. Please try again.');
//        btn.disabled  = false;
//        btn.innerHTML = '<i class="ti ti-file-check"></i> Proceed to Agreement';
//    }
//}
//
//// ── Slider fill color (progress fill visual) ─────────────────
//function updateSliderFill() {
//    const slider = document.getElementById('loanSlider');
//    const pct    = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
//    slider.style.background =
//        `linear-gradient(to right, var(--teal-400) ${pct}%, var(--border) ${pct}%)`;
//
//    const tSlider = document.getElementById('tenureSlider');
//    const tPct    = ((tSlider.value - tSlider.min) / (tSlider.max - tSlider.min)) * 100;
//    tSlider.style.background =
//        `linear-gradient(to right, var(--teal-400) ${tPct}%, var(--border) ${tPct}%)`;
//}
//
//// ── Helpers ───────────────────────────────────────────────────
//function fmtINR(n) {
//    if (!n && n !== 0) return '0';
//    return Math.round(n).toLocaleString('en-IN');
//}
//
//function fmtNum(n) {
//    if (!n && n !== 0) return '0';
//    const num = Number(n);
//    if (num >= 10000000) return (num / 10000000).toFixed(num % 10000000 === 0 ? 0 : 1) + 'Cr';
//    if (num >= 100000)   return (num / 100000).toFixed(num % 100000 === 0 ? 0 : 1) + 'L';
//    if (num >= 1000)     return (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + 'K';
//    return num.toLocaleString('en-IN');
//}
//
//function esc(str) {
//    if (!str) return '';
//    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
//}
//
//// ── Sidebar + Logout ──────────────────────────────────────────
//function toggleSidebar() {
//    const sidebar = document.getElementById('sidebar');
//    const overlay = document.getElementById('sidebarOverlay');
//    if (window.innerWidth <= 768) {
//        sidebar.classList.toggle('mobile-open');
//        if (overlay) overlay.classList.toggle('show');
//    } else {
//        sidebar.classList.toggle('collapsed');
//        localStorage.setItem('sidebar_collapsed',
//            sidebar.classList.contains('collapsed') ? '1' : '0');
//    }
//}
//
//function handleLogout() {
//    ['borrower_token','borrower_id','borrower_name','borrower_email',
//     'borrower_mobile','borrower_aadhaar','borrower_pan',
//     'borrower_kyc_status','borrower_score',
//     'selected_nbfc_id','selected_nbfc_name',
//     'selected_nbfc_interest','selected_nbfc_notice'].forEach(k => localStorage.removeItem(k));
//    window.location.href = '/borrower/login';
//}

// ═══════════════════════════════════════════════════════════════
//  loan-apply.js  —  LendOS Borrower Loan Application
// ═══════════════════════════════════════════════════════════════

const API = 'http://localhost:8000';

// ── State ─────────────────────────────────────────────────────
let nbfc             = null;
let monthlyIncome    = 0;     // from income_data (salary/ITR)
let existingEmis     = 0;     // from credit score step1_foir
let safeEmi          = 0;     // (monthlyIncome × NBFC FOIR%) - existingEmis

// ── Session ───────────────────────────────────────────────────
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

// ── On load ───────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    const session = getSession();
    if (!session) { window.location.href = '/borrower/login'; return; }

    // Fill topbar
    const name = session.full_name || 'Borrower';
    const userNameEl   = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    if (userNameEl)   userNameEl.textContent   = name;
    if (userAvatarEl) userAvatarEl.textContent = name.charAt(0).toUpperCase();

    // Read selected NBFC from localStorage
    const nbfcId       = localStorage.getItem('selected_nbfc_id');
    const nbfcName     = localStorage.getItem('selected_nbfc_name');
    const nbfcInterest = parseFloat(localStorage.getItem('selected_nbfc_interest'));
    const nbfcNotice   = localStorage.getItem('selected_nbfc_notice') || '';

    // All required — if missing redirect back
    if (!nbfcId || !nbfcName || !nbfcInterest) {
        window.location.href = '/borrower/nbfcs';
        return;
    }

    // Fetch full NBFC details from API to get min/max loan + tenure
    try {
        const res  = await fetch(`${API}/api/borrower/nbfcs?score=${session.credit_score || 0}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        const data = await res.json();
        nbfc = data.nbfcs?.find(n => String(n.id) === String(nbfcId));
    } catch (e) {
        console.error('Failed to load NBFC list', e);
    }

    // Fallback with localStorage data if API fails
    if (!nbfc) {
        nbfc = {
            id:                parseInt(nbfcId),
            company_name:      nbfcName,
            interest_rate:     nbfcInterest,
            logo_url:          null,
            processing_fee:    2,
            min_loan_amount:   10000,
            max_loan_amount:   5000000,
            min_tenure_months: 6,
            max_tenure_months: 60,
        };
    }

    // Show rate notice if set
    if (nbfcNotice) {
        document.getElementById('rateNoticeBox').style.display  = 'flex';
        document.getElementById('rateNoticeText').textContent   = nbfcNotice;
    }

    // Render lender card
    renderLenderCard();

    // Configure sliders from NBFC limits
    configureSliders();

    // Fetch borrower profile → get avg_closing_balance
    await loadBorrowerProfile(session);

    // Attach events
    attachEvents();

    // Initial calculation
    recalculate();
});

// ── Render lender card ────────────────────────────────────────
function renderLenderCard() {
    document.getElementById('pageSubtitle').textContent =
        `Applying with ${nbfc.company_name}`;

    const logoBox = document.getElementById('lenderLogo');
    const foirLabel = document.getElementById('arSafeEmiLabel');

const foirPct = nbfc.max_foir_percent || 50;
if (foirLabel) foirLabel.textContent = `Safe EMI Limit (${foirPct}%)`;
const barLabel = document.getElementById('affordBarLimitLabel');
if (barLabel) {
    barLabel.textContent = `Safe ${foirPct}%`;
    barLabel.style.left = `${foirPct}%`;
}
const limitMarker = document.querySelector('.afford-bar-limit');
if (limitMarker) limitMarker.style.left = `${foirPct}%`;
    if (nbfc.logo_url) {
        logoBox.innerHTML = `<img src="${nbfc.logo_url}" alt="${esc(nbfc.company_name)}"/>`;
    } else {
        logoBox.textContent = nbfc.company_name.split(' ').slice(0, 2)
            .map(w => w[0]).join('').toUpperCase();
    }

    document.getElementById('lenderName').textContent = nbfc.company_name;

    // Inject chip-style meta pills
    const metaEl = document.getElementById('lenderMeta');
    if (metaEl) {
        metaEl.innerHTML = `
            <span class="lender-chip teal">
                <i class="ti ti-percentage"></i>${nbfc.interest_rate}% p.a.
            </span>
            <span class="lender-chip">Fee ${nbfc.processing_fee}%</span>
            <span class="lender-chip">${nbfc.min_tenure_months}–${nbfc.max_tenure_months} mo</span>
            <span class="lender-chip">
                <i class="ti ti-shield-check"></i>RBI Registered
            </span>
        `;
    }

    document.getElementById('sumRate').textContent = `${nbfc.interest_rate}% p.a.`;
}

// ── Configure sliders ─────────────────────────────────────────
function configureSliders() {
    const loanSlider   = document.getElementById('loanSlider');
    const tenureSlider = document.getElementById('tenureSlider');

    loanSlider.min   = nbfc.min_loan_amount;
    loanSlider.max   = nbfc.max_loan_amount;
    loanSlider.step  = 1000;
const savedAmount = parseInt(localStorage.getItem('requested_loan_amount')) || 100000;
const preAmount   = Math.min(Math.max(savedAmount, nbfc.min_loan_amount), nbfc.max_loan_amount);
loanSlider.value  = preAmount;

    tenureSlider.min   = nbfc.min_tenure_months;
    tenureSlider.max   = nbfc.max_tenure_months;
    tenureSlider.step  = 1;
    tenureSlider.value = nbfc.min_tenure_months;

 document.getElementById('loanAmountInput').value = preAmount;
    document.getElementById('tenureInput').min   = nbfc.min_tenure_months;
    document.getElementById('tenureInput').max   = nbfc.max_tenure_months;
    document.getElementById('tenureInput').value = nbfc.min_tenure_months;
    document.getElementById('sliderMin').textContent  = '₹' + fmtNum(nbfc.min_loan_amount);
    document.getElementById('sliderMax').textContent  = '₹' + fmtNum(nbfc.max_loan_amount);
    document.getElementById('tenureMin').textContent  = `${nbfc.min_tenure_months} mo`;
    document.getElementById('tenureMax').textContent  = `${nbfc.max_tenure_months} mo`;
    const draftAmount     = parseInt(localStorage.getItem('loan_draft_amount'));
    const draftTenure     = parseInt(localStorage.getItem('loan_draft_tenure'));
    const draftPurpose    = localStorage.getItem('loan_draft_purpose');
    const requestedAmount = parseInt(localStorage.getItem('requested_loan_amount')); // entered during document upload

    // Priority: an in-progress draft on THIS page > the amount entered at document-upload step > default
    if (draftAmount && draftAmount >= nbfc.min_loan_amount && draftAmount <= nbfc.max_loan_amount) {
        loanSlider.value = draftAmount;
        document.getElementById('loanAmountInput').value = draftAmount;
    } else if (requestedAmount && requestedAmount >= nbfc.min_loan_amount && requestedAmount <= nbfc.max_loan_amount) {
        loanSlider.value = requestedAmount;
        document.getElementById('loanAmountInput').value = requestedAmount;
    }
    if (draftTenure && draftTenure >= nbfc.min_tenure_months && draftTenure <= nbfc.max_tenure_months) {
        tenureSlider.value = draftTenure;
        document.getElementById('tenureInput').value = draftTenure;
    }
    if (draftPurpose) {
        document.getElementById('loanPurpose').value = draftPurpose;
    }


}

// ── Load borrower profile ─────────────────────────────────────
async function loadBorrowerProfile(session) {
    try {
        // Fetch profile (income_data, bank_data) and score breakdown in parallel
        const [profileRes, scoreRes] = await Promise.all([
            fetch(`${API}/api/borrower/profile/${session.borrower_id}`,
                { headers: { 'Authorization': `Bearer ${session.access_token}` } }),
            fetch(`${API}/api/borrower/score/${session.borrower_id}`,
                { headers: { 'Authorization': `Bearer ${session.access_token}` } }),
        ]);

        const profileData = await profileRes.json();
        const scoreData   = await scoreRes.json();

        // STEP 1 — Monthly Income (correct FOIR base = net salary or monthly ITR equivalent)
        const incomeData  = profileData.income_data || {};
        monthlyIncome = incomeData.net_salary          // salaried: salary slip net pay
                     || incomeData.monthly_equivalent   // self-employed: ITR ÷ 12
                     || 0;

        // Fallback: avg monthly credits from bank statement ÷ 3 months
        if (!monthlyIncome && profileData.bank_data?.total_credits) {
            monthlyIncome = profileData.bank_data.total_credits / 3;
        }

        // STEP 2 — Existing EMI obligations detected by credit scoring (step1_foir)
        const breakdown = scoreData.breakdown || null;
        existingEmis = breakdown?.step1_foir?.avg_monthly_obligations || 0;

        // STEP 3 — Safe EMI = (Monthly Income × NBFC FOIR limit) − Existing EMI Obligations
        const foirLimit = (nbfc.max_foir_percent || 50) / 100;
        safeEmi = (monthlyIncome * foirLimit) - existingEmis;
        safeEmi = Math.max(safeEmi, 0); // never negative

        // Update affordability card rows
        document.getElementById('arIncome').textContent =
            monthlyIncome ? '₹' + fmtINR(Math.round(monthlyIncome)) : '₹—';
        document.getElementById('arExistingEmi').textContent =
            '₹' + fmtINR(Math.round(existingEmis));
        document.getElementById('arSafeEmi').textContent =
            safeEmi ? '₹' + fmtINR(Math.round(safeEmi)) : '₹—';

    } catch (e) {
        console.error('Could not load profile', e);
    }
}

// ── Attach events ─────────────────────────────────────────────
function attachEvents() {
    const loanSlider      = document.getElementById('loanSlider');
    const loanAmountInput = document.getElementById('loanAmountInput');
    const tenureSlider    = document.getElementById('tenureSlider');
    const purposeSelect   = document.getElementById('loanPurpose');

    // Loan slider → input
    loanSlider.addEventListener('input', () => {
        loanAmountInput.value = loanSlider.value;
        recalculate();
    });

    // Amount input → slider
// Amount input → slider (free typing; clamp on blur)
loanAmountInput.addEventListener('input', () => {
    const raw = parseInt(loanAmountInput.value) || 0;
    if (raw >= nbfc.min_loan_amount && raw <= nbfc.max_loan_amount) {
        loanSlider.value = raw;
        recalculate();
    }
});

loanAmountInput.addEventListener('blur', () => {
    let val = parseInt(loanAmountInput.value);
    if (isNaN(val) || val === 0) val = nbfc.min_loan_amount;
    val = Math.max(nbfc.min_loan_amount, Math.min(nbfc.max_loan_amount, val));
    loanAmountInput.value = val;
    loanSlider.value = val;
    recalculate();
});

    // Tenure input (typed)
    const tenureInput = document.getElementById('tenureInput');
    tenureInput.addEventListener('input', () => {
        let val = parseInt(tenureInput.value) || nbfc.min_tenure_months;
        val = Math.max(nbfc.min_tenure_months, Math.min(nbfc.max_tenure_months, val));
        tenureSlider.value = val;
        recalculate();
    });

    // Tenure slider → input
    tenureSlider.addEventListener('input', () => {
        document.getElementById('tenureInput').value = tenureSlider.value;
        recalculate();
    });

    // Purpose → re-check proceed button
//    purposeSelect.addEventListener('change', updateProceedBtn);
purposeSelect.addEventListener('change', () => updateProceedBtn());
}

// ── Core: recalculate everything ─────────────────────────────
function recalculate() {
    const loanAmount = parseInt(document.getElementById('loanSlider').value) || 0;
    const tenure     = parseInt(document.getElementById('tenureSlider').value) || 12;
    const rate       = nbfc.interest_rate;
    const fee        = nbfc.processing_fee;

    // Sync tenure input with slider
    document.getElementById('tenureInput').value = tenure;

    // EMI formula
    const r   = (rate / 100) / 12;
    const emi = loanAmount > 0
        ? Math.round(loanAmount * r * Math.pow(1+r, tenure) / (Math.pow(1+r, tenure) - 1))
        : 0;

    const totalPayable    = emi * tenure;
    const totalInterest   = totalPayable - loanAmount;
    const processingFee   = Math.round(loanAmount * (fee / 100));
    const amountDisbursed = loanAmount - processingFee;

    // Update summary card
    document.getElementById('emiAmount').textContent    = '₹' + fmtINR(emi);
    document.getElementById('sumLoanAmt').textContent   = '₹' + fmtINR(loanAmount);
    document.getElementById('sumTenure').textContent    = `${tenure} months`;
    document.getElementById('sumInterest').textContent  = '₹' + fmtINR(totalInterest);
    document.getElementById('sumTotal').textContent     = '₹' + fmtINR(totalPayable);
    document.getElementById('sumFee').textContent       = '₹' + fmtINR(processingFee);
    document.getElementById('sumDisbursed').textContent = '₹' + fmtINR(amountDisbursed);

    // Affordability check
    checkAffordability(emi, loanAmount, tenure, rate);

    // Update slider track fill color
    updateSliderFill();
}

// ── Affordability check ───────────────────────────────────────
function checkAffordability(emi, loanAmount, tenure, rate) {
    const affordMsg      = document.getElementById('affordMsg');
    const affordBarFill  = document.getElementById('affordBarFill');
    const suggestionsWrap = document.getElementById('suggestionsWrap');
    const arEmi          = document.getElementById('arEmi');

    arEmi.textContent = '₹' + fmtINR(emi);

    // No income data yet
    if (!monthlyIncome) {
        affordMsg.className = 'afford-msg';
        affordMsg.innerHTML = `<i class="ti ti-info-circle afford-msg-icon"></i>
            <span>Income data not available. Upload salary slip or ITR to enable affordability check.</span>`;
        affordBarFill.style.width      = '0%';
        affordBarFill.style.background = '#cbd5e1';
        suggestionsWrap.style.display  = 'none';
        updateProceedBtn();
        return;
    }

    // No loan amount entered
    if (loanAmount === 0 || emi === 0) {
        affordMsg.className = 'afford-msg';
        affordMsg.innerHTML = `<i class="ti ti-loader afford-msg-icon"></i>
            <span>Enter loan details to check affordability.</span>`;
        affordBarFill.style.width      = '0%';
        affordBarFill.style.background = '#cbd5e1';
        suggestionsWrap.style.display  = 'none';
        updateProceedBtn();
        return;
    }

    // ✅ CORRECT FOIR formula
    // FOIR = (existing obligations + new EMI) / monthly income × 100
    const foirLimit = nbfc.max_foir_percent || 50;
    const foir      = ((existingEmis + emi) / monthlyIncome) * 100;
    const barWidth  = Math.min(foir, 100);


    affordBarFill.style.width = barWidth + '%';
    arEmi.style.color = '';

    if (foir <= foirLimit) {
        // ✅ Safe
        affordBarFill.style.background = '#10b981';
        affordMsg.className = 'afford-msg state-safe';
        affordMsg.innerHTML = `<i class="ti ti-circle-check afford-msg-icon"></i>
            <span>You can afford this EMI. FOIR: ${foir.toFixed(1)}% (limit: ${foirLimit}%)</span>`;
        suggestionsWrap.style.display = 'none';
        arEmi.style.color = '#10b981';

} else if (foir <= foirLimit + 10) {
    // ⚠️ Tight (within 10% above limit)
    affordBarFill.style.background = '#f59e0b';
    affordMsg.className = 'afford-msg state-warn';
    affordMsg.innerHTML = `<i class="ti ti-alert-triangle afford-msg-icon"></i>
        <span>EMI is above safe FOIR limit of ${foirLimit}% (yours: ${foir.toFixed(1)}%). Consider reducing amount.</span>`;
    arEmi.style.color = '#f59e0b';
    showSuggestions(loanAmount, tenure, rate);   // ← remove the 'none' line and add this

    } else {
        // ❌ Blocked
        affordBarFill.style.background = '#ef4444';
        affordMsg.className = 'afford-msg state-block';
        affordMsg.innerHTML = `<i class="ti ti-x afford-msg-icon"></i>
            <span>FOIR ${foir.toFixed(1)}% exceeds limit of ${foirLimit}%. See safe options below.</span>`;
        arEmi.style.color = '#ef4444';
        showSuggestions(loanAmount, tenure, rate);
    }

    updateProceedBtn(foir);
}

// ── Generate suggestions ──────────────────────────────────────
function showSuggestions(requestedAmount, requestedTenure, rate) {
    const suggestionsWrap = document.getElementById('suggestionsWrap');
    const suggestionsList = document.getElementById('suggestionsList');

    suggestionsWrap.style.display = 'block';

    const r           = (rate / 100) / 12;
    const tenureOptions = [];

    // Generate options for multiple tenures within NBFC limits
    const tenuresToTry = [
        requestedTenure,
        Math.min(requestedTenure + 12, nbfc.max_tenure_months),
        Math.min(requestedTenure + 24, nbfc.max_tenure_months),
    ].filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate

    tenuresToTry.forEach(n => {
        // Max safe loan for this tenure
        let maxLoan = safeEmi * (Math.pow(1+r, n) - 1) / (r * Math.pow(1+r, n));
        maxLoan = Math.round(maxLoan / 100) * 100; // round to nearest 100
        maxLoan = Math.min(maxLoan, nbfc.max_loan_amount);
        maxLoan = Math.max(maxLoan, nbfc.min_loan_amount);

        const emiAtSafe = Math.round(
            maxLoan * r * Math.pow(1+r, n) / (Math.pow(1+r, n) - 1)
        );
    const foirAtSafe = (((existingEmis + emiAtSafe) / monthlyIncome) * 100).toFixed(1);

        tenureOptions.push({ tenure: n, maxLoan, emi: emiAtSafe, foir: foirAtSafe });
    });

    suggestionsList.innerHTML = tenureOptions.map(opt => `
        <div class="suggestion-row">
            <div class="suggestion-info">
                <div class="suggestion-tenure">${opt.tenure} months</div>
                <div class="suggestion-amount">₹${fmtINR(opt.maxLoan)}</div>
                <div class="suggestion-emi">EMI ₹${fmtINR(opt.emi)} · FOIR ${opt.foir}% ✅</div>
            </div>
            <button class="suggestion-set-btn"
                onclick="setLoan(${opt.maxLoan}, ${opt.tenure})">
                Set this
            </button>
        </div>
    `).join('');
}

// ── Set loan from suggestion ──────────────────────────────────
function setLoan(amount, tenure) {
    const loanSlider      = document.getElementById('loanSlider');
    const loanAmountInput = document.getElementById('loanAmountInput');
    const tenureSlider    = document.getElementById('tenureSlider');

    loanSlider.value      = amount;
    loanAmountInput.value = amount;
    tenureSlider.value    = tenure;

    document.getElementById('tenureInput').value = tenure;
    recalculate();

    // Scroll to form
    document.getElementById('loanSlider').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Enable/disable proceed button ────────────────────────────
function updateProceedBtn(foir) {
    const btn        = document.getElementById('proceedBtn');
    const purpose    = document.getElementById('loanPurpose').value;
    const loanAmount = parseInt(document.getElementById('loanSlider').value) || 0;

const foirLimit = nbfc?.max_foir_percent || 50;
//const foirOk    = !foir || foir <= (foirLimit + 10);
const foirOk = !foir || foir <= foirLimit;
    const purposeOk = !!purpose;
    const amountOk  = loanAmount >= nbfc.min_loan_amount;

    btn.disabled = !(foirOk && purposeOk && amountOk);
}

// ── Submit application ────────────────────────────────────────
async function submitApplication() {
    const session    = getSession();
    const loanAmount = parseInt(document.getElementById('loanSlider').value);
    const tenure     = parseInt(document.getElementById('tenureSlider').value);
    const purpose    = document.getElementById('loanPurpose').value;
    const rate       = nbfc.interest_rate;

    const r   = (rate / 100) / 12;
    const emi = Math.round(loanAmount * r * Math.pow(1+r, tenure) / (Math.pow(1+r, tenure) - 1));

    // Frontend FOIR guard — block submission if EMI exceeds safe limit
    if (monthlyIncome > 0) {
        const foirLimit  = nbfc.max_foir_percent || 50;
        const foirActual = ((existingEmis + emi) / monthlyIncome) * 100;
        if (foirActual > foirLimit) {
            alert(`❌ Your EMI of ₹${fmtINR(emi)} exceeds the safe FOIR limit of ${foirLimit}%.\n\nPlease select a lower amount or longer tenure from the suggestions below.`);
            return;
        }
    }

    const totalPayable    = emi * tenure;
    const totalInterest   = totalPayable - loanAmount;
    const processingFee   = Math.round(loanAmount * (nbfc.processing_fee / 100));
    const amountDisbursed = loanAmount - processingFee;
const foir = monthlyIncome ? ((existingEmis + emi) / monthlyIncome) * 100 : null;

    const btn = document.getElementById('proceedBtn');
    btn.disabled   = true;
    btn.innerHTML  = '<i class="ti ti-loader-2"></i> Submitting…';

    try {
        const res = await fetch(`${API}/api/borrower/loan-application`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                borrower_id:          session.borrower_id,
                nbfc_id:              nbfc.id,
                loan_amount:          loanAmount,
                tenure_months:        tenure,
                purpose:              purpose,
                interest_rate:        rate,
                emi_amount:           emi,
                total_interest:       totalInterest,
                total_payable:        totalPayable,
                processing_fee_amount: processingFee,
                amount_disbursed:     amountDisbursed,
               monthly_income:       Math.round(monthlyIncome),
                existing_emis:        Math.round(existingEmis),
                safe_emi:             Math.round(safeEmi),
                foir_at_application:  foir ? parseFloat(foir.toFixed(1)) : null,
            })
        });

        const data = await res.json();

   if (!res.ok) {
    // data.detail may be a string, object, or missing entirely
    // data.error is set directly for already_applied / emi_too_high
    const errCode = data.error
        || (typeof data.detail === 'object' ? data.detail?.error : null)
        || '';

//    if (errCode === 'already_applied') {
//        const appId = data.application_id
//            || (typeof data.detail === 'object' ? data.detail?.application_id : null);
//        if (appId) {
//            window.location.href = `/borrower/loans/agreement?id=${appId}`;
//            return;
//        }
//    }
if (errCode === 'already_applied') {
        const appId = data.application_id
            || (typeof data.detail === 'object' ? data.detail?.application_id : null);
        if (appId) {
            // Save current form values as draft before redirecting
            localStorage.setItem('loan_draft_amount',  document.getElementById('loanSlider').value);
            localStorage.setItem('loan_draft_tenure',  document.getElementById('tenureSlider').value);
            localStorage.setItem('loan_draft_purpose', document.getElementById('loanPurpose').value);
            window.location.href = `/borrower/loans/agreement?id=${appId}`;
            return;
        }
    }

    if (errCode === 'emi_too_high') {
        const maxLoan = data.max_safe_loan
            || (typeof data.detail === 'object' ? data.detail?.max_safe_loan : 0);
        const msg = (typeof data.detail === 'object' ? data.detail?.detail : data.detail)
            || 'EMI too high.';
        alert(`❌ ${msg}\n\nMax safe loan: ₹${fmtINR(maxLoan)}`);
    } else {
        const msg = typeof data.detail === 'string'
            ? data.detail
            : typeof data.detail === 'object'
                ? JSON.stringify(data.detail)
                : data.message || data.error || 'Submission failed. Please try again.';
        alert(msg);
    }

    btn.disabled  = false;
    btn.innerHTML = '<i class="ti ti-file-check"></i> Proceed to Agreement';
    return;
}

        // Save application_id and redirect to agreement
//        localStorage.setItem('loan_application_id', data.application_id);
//                localStorage.setItem('loan_draft_amount', loanAmount);
//        localStorage.setItem('loan_draft_tenure', tenure);
//        localStorage.setItem('loan_draft_purpose', purpose);
//        window.location.href = `/borrower/loans/agreement?id=${data.application_id}`;
// Save draft so borrower can see their values if they come back
        localStorage.setItem('loan_application_id',  data.application_id);
        localStorage.setItem('loan_draft_amount',     loanAmount);
        localStorage.setItem('loan_draft_tenure',     tenure);
        localStorage.setItem('loan_draft_purpose',    purpose);
        // Clear only after a brand new successful application
        localStorage.removeItem('loan_draft_amount');
        localStorage.removeItem('loan_draft_tenure');
        localStorage.removeItem('loan_draft_purpose');
        window.location.href = `/borrower/loans/agreement?id=${data.application_id}`;
    } catch (err) {
        alert('Cannot connect to server. Please try again.');
        btn.disabled  = false;
        btn.innerHTML = '<i class="ti ti-file-check"></i> Proceed to Agreement';
    }
}

// ── Slider fill color (progress fill visual) ─────────────────
function updateSliderFill() {
    const slider = document.getElementById('loanSlider');
    const pct    = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.background =
        `linear-gradient(to right, var(--teal-400) ${pct}%, var(--border) ${pct}%)`;

    const tSlider = document.getElementById('tenureSlider');
    const tPct    = ((tSlider.value - tSlider.min) / (tSlider.max - tSlider.min)) * 100;
    tSlider.style.background =
        `linear-gradient(to right, var(--teal-400) ${tPct}%, var(--border) ${tPct}%)`;
}

// ── Helpers ───────────────────────────────────────────────────
function fmtINR(n) {
    if (!n && n !== 0) return '0';
    return Math.round(n).toLocaleString('en-IN');
}

function fmtNum(n) {
    if (!n && n !== 0) return '0';
    const num = Number(n);
    if (num >= 10000000) return (num / 10000000).toFixed(num % 10000000 === 0 ? 0 : 1) + 'Cr';
    if (num >= 100000)   return (num / 100000).toFixed(num % 100000 === 0 ? 0 : 1) + 'L';
    if (num >= 1000)     return (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + 'K';
    return num.toLocaleString('en-IN');
}

function esc(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Sidebar + Logout ──────────────────────────────────────────
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
     'selected_nbfc_interest','selected_nbfc_notice'].forEach(k => localStorage.removeItem(k));
    window.location.href = '/borrower/login';
}
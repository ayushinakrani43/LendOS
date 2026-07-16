
const API   = window.location.origin;
const T_KEY = 'borrower_token';

let state   = { nextStep: 'kyc' };
let currentStep = 1;

window.addEventListener('DOMContentLoaded', () => {
  // Always clear session on login page visit — user must login every time
  clearSession();
});


// ── Live duplicate checks ─────────────────────────────────────────────────────
const _debounce = (fn, ms=600) => { let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };

async function checkEmailAvail(input) {
  const email = input.value.trim();
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return;
  try {
    const res  = await fetch(`${API}/api/borrower/check-email/${encodeURIComponent(email)}`);
    const data = await res.json();
    if (!data.available) { setErr('email', true, 'This email is already registered. Sign in instead.'); }
    else { setErr('email', false); }
  } catch {}
}

async function checkMobileAvail(input) {
  const m = input.value.trim();
//  if (!/^[6-9]\d{9}$/.test(m)) return;
if (!/^\d{10}$/.test(m)) return;
  try {
    const res  = await fetch(`${API}/api/borrower/check-mobile/${m}`);
    const data = await res.json();
    if (!data.available) { setErr('mobile', true, 'This mobile number is already registered.'); }
    else { setErr('mobile', false); }
  } catch {}
}

async function checkAadhaarAvail(input) {
  const raw = input.value.replace(/\s/g,'');
  if (raw.length !== 12) return;
  try {
    const res  = await fetch(`${API}/api/borrower/check-aadhaar/${raw}`);
    const data = await res.json();
    if (!data.available) { setErr('aadhaar_number', true, 'This Aadhaar number is already registered.'); }
    else { setErr('aadhaar_number', false); }
  } catch {}
}

async function checkPANAvail(input) {
  const pan = input.value.trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) return;
  try {
    const res  = await fetch(`${API}/api/borrower/check-pan/${pan}`);
    const data = await res.json();
    if (!data.available) { setErr('pan_number', true, 'This PAN number is already registered.'); }
    else { setErr('pan_number', false); }
  } catch {}
}

const debouncedEmail   = _debounce(checkEmailAvail);
const debouncedMobile  = _debounce(checkMobileAvail);
const debouncedAadhaar = _debounce(checkAadhaarAvail);
const debouncedPAN     = _debounce(checkPANAvail);

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.getElementById('panel-register').style.display = tab==='register' ? 'block' : 'none';
  document.getElementById('panel-login').style.display    = tab==='login'    ? 'block' : 'none';
  document.getElementById('tab-register').classList.toggle('active', tab==='register');
  document.getElementById('tab-login').classList.toggle('active', tab==='login');

  // Update card header
  if (tab === 'login') {
    document.getElementById('cardHeaderIcon').innerHTML = '<i class="ti ti-login"></i>';
    document.getElementById('cardHeaderTitle').textContent = 'Sign in to your account';
    document.getElementById('cardHeaderSub').textContent = 'Enter your credentials to continue';
  } else {
    document.getElementById('cardHeaderIcon').innerHTML = '<i class="ti ti-user-plus"></i>';
    document.getElementById('cardHeaderTitle').textContent = 'Create your account';
    document.getElementById('cardHeaderSub').textContent = 'Fill in the details below to get started';
  }
}

// ── Step navigation ───────────────────────────────────────────────────────────
function goStep(n) {
  document.querySelectorAll('.step-section').forEach((s,i) => {
    s.classList.toggle('active', i+1===n);
  });
  ['bar1','bar2','bar3'].forEach((id,i) => {
    const bar = document.getElementById(id);
    bar.className = 'step-bar';
    if (i+1 < n)  bar.classList.add('done');
    else if (i+1===n) bar.classList.add('active');
  });
const labels = ['Account setup', 'Upload documents', 'Confirm details'];
  document.getElementById('step-meta').innerHTML = `<span>Step ${n} / 3</span> — ${labels[n-1]}`;
  currentStep = n;
}

// ── Step 1 validation ─────────────────────────────────────────────────────────
function goStep2() {
  clearErrs(['mobile','email','employment_type','password','confirm_password']);
  let ok = true;

  const mob            = v('mobile');
  const email          = v('email');
  const employmentType = document.getElementById('employment_type').value;
  const pw             = v('password');
  const conf           = v('confirm_password');
  const terms          = document.getElementById('terms').checked;

  if (!/^\d{10}$/.test(mob))              { setErr('mobile',           true, 'Enter a valid 10-digit mobile number.'); ok=false; }
  if (!/^\S+@\S+\.\S+$/.test(email))      { setErr('email',            true, 'Enter a valid email address.'); ok=false; }
  if (!employmentType)                     { setErr('employment_type',  true, 'Please select your employment type.'); ok=false; }
  if (pw.length < 8)                       { setErr('password',         true, 'Password must be at least 8 characters.'); ok=false; }
  if (pw !== conf)                         { setErr('confirm_password', true, 'Passwords do not match.'); ok=false; }
  if (!terms)                              { showAlert('alert-reg', 'Please accept the Terms of Service to continue.'); ok=false; }
  if (!ok) return;

  const dupe = document.querySelector('#e_email.show, #e_mobile.show');
  if (dupe) { dupe.scrollIntoView({behavior:'smooth',block:'center'}); return; }

  goStep(2);
}

// ── Document upload handler ───────────────────────────────────────────────────
let aadhaarFile = null;
let panFile     = null;

function handleDocUpload(input, type) {
  const file = input.files[0];
  if (!file) return;

  if (!['image/png','image/jpeg','image/jpg'].includes(file.type)) {
    alert('Please upload PNG or JPG only.'); return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert('File too large. Max 5MB.'); return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    if (type === 'aadhaar') {
      aadhaarFile = file;
      document.getElementById('aadhaar-idle').style.display   = 'none';
      document.getElementById('aadhaar-preview').src          = e.target.result;
      document.getElementById('aadhaar-preview').style.display = 'block';
      document.getElementById('aadhaar-done').style.display   = 'flex';
      document.getElementById('aadhaar-filename').textContent = '✓ ' + file.name;
      document.getElementById('aadhaar-upload-box').classList.add('has-file');
      setErr('aadhaar_upload', false);
    } else {
      panFile = file;
      document.getElementById('pan-idle').style.display   = 'none';
      document.getElementById('pan-preview').src          = e.target.result;
      document.getElementById('pan-preview').style.display = 'block';
      document.getElementById('pan-done').style.display   = 'flex';
      document.getElementById('pan-filename').textContent = '✓ ' + file.name;
      document.getElementById('pan-upload-box').classList.add('has-file');
      setErr('pan_upload', false);
    }
  };
  reader.readAsDataURL(file);
}

function namesMatchClient(nameA, nameB, threshold = 0.5) {
  if (!nameA || !nameB) return false;
  const wordsA = new Set(nameA.trim().toUpperCase().split(/\s+/));
  const wordsB = new Set(nameB.trim().toUpperCase().split(/\s+/));
  if (wordsA.size === 0) return false;
  let matched = 0;
  wordsA.forEach(w => { if (wordsB.has(w)) matched++; });
  return (matched / wordsA.size) >= threshold;
}

// ── Run OCR and go to step 3 ──────────────────────────────────────────────────
async function runOCRAndNext() {
  clearErrs(['aadhaar_upload','pan_upload']);
  let ok = true;

  if (!aadhaarFile) { setErr('aadhaar_upload', true, 'Please upload your Aadhaar card photo.'); ok=false; }
  if (!panFile)     { setErr('pan_upload',     true, 'Please upload your PAN card photo.'); ok=false; }
  if (!ok) return;

  // Show scanning state
  const btn    = document.getElementById('btn-scan');
  const status = document.getElementById('ocr-status');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Scanning…';
  status.style.display = 'flex';
  document.getElementById('ocr-status-text').textContent = 'Reading Aadhaar card…';


try {
    // ── OCR Aadhaar + PAN in PARALLEL ──────────────────────────────────────
    document.getElementById('ocr-status-text').textContent = 'Scanning Aadhaar & PAN simultaneously…';

    const aadhaarForm = new FormData();
    aadhaarForm.append('aadhaar_image', aadhaarFile);

    const panForm = new FormData();
    panForm.append('pan_image', panFile);

    // Fire both requests at the same time
    const [aRes, pRes] = await Promise.all([
        fetch(`${API}/api/kyc/extract-aadhaar`, { method: 'POST', body: aadhaarForm }),
        fetch(`${API}/api/kyc/extract-pan`,     { method: 'POST', body: panForm }),
    ]);

    const [aData, pData] = await Promise.all([aRes.json(), pRes.json()]);

    // ── Handle errors — show both errors at once if both fail ──────────────
    if (!aRes.ok || !pRes.ok) {
        status.style.display = 'none';
        btn.disabled  = false;
        btn.innerHTML = 'Scan & Continue <i class="ti ti-arrow-right" style="font-size:15px;"></i>';
        if (!aRes.ok) setErr('aadhaar_upload', true, aData.detail || 'Aadhaar card could not be verified. Please upload a valid Aadhaar card photo.');
        if (!pRes.ok) setErr('pan_upload',     true, pData.detail || 'PAN card could not be verified. Please upload a valid PAN card photo.');
        return;
    }

    // ── Debug logs ──────────────────────────────────────────────────────────
    console.log('=== AADHAAR OCR RESPONSE ===', aData);
    console.log('=== PAN OCR RESPONSE ===',     pData);

    status.style.display = 'none';

    // ── Auto-fill Step 3 fields ──
    if (aData.name)           document.getElementById('full_name').value    = aData.name;
    if (aData.dob)            document.getElementById('date_of_birth').value = aData.dob;
    if (aData.gender)         document.getElementById('gender').value        = aData.gender;
    if (aData.aadhaar_number) {
      const n = aData.aadhaar_number;
      document.getElementById('aadhaar_number').value = `${n.slice(0,4)} ${n.slice(4,8)} ${n.slice(8,12)}`;
    }
    if (aData.address)        document.getElementById('address').value       = aData.address;
    if (pData.pan_number)     document.getElementById('pan_number').value    = pData.pan_number;

// ADD before goStep(3):
console.log('=== FIELDS AUTO-FILLED INTO STEP 3 ===');
console.log('full_name field:', document.getElementById('full_name').value);
console.log('date_of_birth field:', document.getElementById('date_of_birth').value);
console.log('gender field:', document.getElementById('gender').value);
console.log('aadhaar_number field:', document.getElementById('aadhaar_number').value);
console.log('pan_number field:', document.getElementById('pan_number').value);
console.log('address field:', document.getElementById('address').value);
// Block Step 3 if Aadhaar number or PAN number could not be extracted
    if (!aData.aadhaar_number) {
        setErr('aadhaar_upload', true, 'Could not read Aadhaar number. Please upload a clearer photo of your Aadhaar card front side.');
        return;
    }
//    if (!pData.pan_number) {
//        setErr('pan_upload', true, 'Could not read PAN number. Please upload a clearer photo of your PAN card.');
//        return;
//    }
//
//    goStep(3);

if (!pData.pan_number) {
        setErr('pan_upload', true, 'Could not read PAN number. Please upload a clearer photo of your PAN card.');
        return;
    }

    // ── Cross-check: do the Aadhaar and PAN belong to the same person? ──────
    if (aData.name && pData.name && !namesMatchClient(aData.name, pData.name)) {
        status.style.display = 'none';
        setErr('pan_upload', true,
            `The name on your PAN card ("${pData.name}") doesn't match the name on your Aadhaar card ("${aData.name}"). ` +
            `Please make sure both documents belong to you and re-upload if needed.`
        );
        return;
    }

    goStep(3);

} catch {
    status.style.display = 'none';
    showAlert('alert-upload', 'Could not connect to server. Please check your connection and try again.');
    // ← do NOT goStep(3) — user must upload valid documents
  }
  finally {
    btn.disabled = false;
    btn.innerHTML = 'Scan & Continue <i class="ti ti-arrow-right" style="font-size:15px;"></i>';
  }
}

// ── Register submit ───────────────────────────────────────────────────────────
async function submitRegister() {

  setBtnLoading('btn-register', true, 'Create account <i class="ti ti-arrow-right"></i>');

  // Step 3 validation
clearErrs(['full_name','date_of_birth','gender','aadhaar_number','pan_number']);
let ok3 = true;
if (!v('full_name'))                                                            { setErr('full_name',     true, 'Please enter your full name.'); ok3=false; }
if (!v('date_of_birth'))                                                        { setErr('date_of_birth', true, 'Please enter date of birth.'); ok3=false; }
if (!document.getElementById('gender').value)                                   { setErr('gender',        true, 'Please select gender.'); ok3=false; }
if (!/^\d{12}$/.test(v('aadhaar_number').replace(/\s/g,'')))                  { setErr('aadhaar_number',true, 'Enter valid 12-digit Aadhaar number.'); ok3=false; }
if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v('pan_number').toUpperCase()))       { setErr('pan_number',    true, 'Enter valid PAN number.'); ok3=false; }
if (!ok3) return;

const aadhaar = v('aadhaar_number').replace(/\s/g,'');
const body = {
  full_name:      v('full_name'),
  mobile:         v('mobile'),
  email:          v('email'),
  password:       v('password'),
  aadhaar_number: aadhaar,
  pan_number:     v('pan_number').toUpperCase(),
  date_of_birth:  v('date_of_birth'),
  gender:         document.getElementById('gender').value,
  address:        v('address'),
  employment_type: document.getElementById('employment_type').value,
};

  try {
    const res  = await fetch(`${API}/api/borrower/register`, {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      showAlert('alert-submit', data.detail || 'Registration failed. Please try again.');
      return;
    }

    saveSession(data);
    state.nextStep = "dashboard";  // always redirect to KYC after new registration

    // Hide form steps, show success
    document.querySelectorAll('.step-section.active').forEach(s => s.style.display='none');
    document.querySelector('.step-bar-row').style.display  = 'none';
    document.getElementById('step-meta').style.display     = 'none';
    document.getElementById('register-signin-link').style.display = 'none';
    document.getElementById('success-msg').textContent =
  `Welcome, ${data.full_name}! Your account is ready. Redirecting to dashboard…`;
    document.getElementById('success-screen').style.display = 'block';
    setTimeout(redirectAfterAuth, 2000);

  } catch {
    showAlert('alert-submit', 'Cannot connect to server. Make sure the backend is running.');
  } finally {
    setBtnLoading('btn-register', false, 'Create account <i class="ti ti-arrow-right"></i>');
  }
}

// ── Login submit ──────────────────────────────────────────────────────────────
async function submitLogin() {

  clearErrs(['login_email','login_password']);
  let ok = true;

  const email = v('login_email');
  const pw    = v('login_password');

  if (!/^\S+@\S+\.\S+$/.test(email)) { setErr('login_email',    true, 'Enter a valid email address.'); ok=false; }
  if (!pw)                            { setErr('login_password', true, 'Please enter your password.'); ok=false; }
  if (!ok) return;

  setBtnLoading('btn-login', true, 'Sign in <i class="ti ti-arrow-right"></i>');

  try {
    const res  = await fetch(`${API}/api/borrower/login`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email, password:pw})
    });
    const data = await res.json();

    if (!res.ok) {
      showLoginAlert('alert-login', data.detail || 'Invalid email or password.');
      return;
    }

    saveSession(data);
    state.nextStep = data.next_step;
    showLoginAlertOk('alert-login-ok', `Welcome back, ${data.full_name}! Redirecting…`);
    setTimeout(redirectAfterAuth, 1500);

  } catch {
    showLoginAlert('alert-login', 'Cannot connect to server. Make sure the backend is running.');
  } finally {
    setBtnLoading('btn-login', false, 'Sign in <i class="ti ti-arrow-right"></i>');
  }
}

// ── Redirect ──────────────────────────────────────────────────────────────────
function redirectAfterAuth() { window.location.href = getRedirectURL(state.nextStep); }
//function getRedirectURL(step) { return '/borrower/dashboard'; }
function getRedirectURL(step) { return '/borrower/overview'; }
// ── Aadhaar formatting ────────────────────────────────────────────────────────
function fmtAadhaar(input) {
  let v2 = input.value.replace(/\D/g,'').slice(0,12);
  input.value = v2.replace(/(\d{4})(?=\d)/g,'$1 ').trim();
}

// ── Password strength ─────────────────────────────────────────────────────────
function checkStr(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const cls = ['','weak','fair','good','strong'];
  const lbl = ['Enter a password','Weak — too short','Fair — add numbers','Good — add symbols','Strong password'];
  ['pb1','pb2','pb3','pb4'].forEach((id,i) => {
    document.getElementById(id).className = 'pw-bar ' + (i < s ? cls[s] : '');
  });
  document.getElementById('pw-lbl').textContent = lbl[s];
}

// ── Toggle password ───────────────────────────────────────────────────────────
function togglePw(id, btn) {
  const inp = document.getElementById(id);
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.innerHTML = show ? '<i class="ti ti-eye-off"></i>' : '<i class="ti ti-eye"></i>';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const v = id => document.getElementById(id)?.value?.trim() ?? '';

function setErr(id, show, msg='') {
  const inp = document.getElementById(id);
  const err = document.getElementById('e_'+id);
  if (inp) inp.classList.toggle('has-error', show);
  if (err) { if (show && msg) err.textContent = msg; err.classList.toggle('show', show); }
}

function clearErrs(ids) { ids.forEach(id => setErr(id, false)); }

function showAlert(alertId, msg) {
  const box = document.getElementById(alertId);
  box.innerHTML = `<i class="ti ti-alert-circle" style="font-size:16px;flex-shrink:0;"></i> ${msg}`;
  box.className = 'alert error show';
  setTimeout(() => box.classList.remove('show'), 5000);
}

function showLoginAlert(alertId, msg) {
  const box = document.getElementById(alertId);
  box.innerHTML = `<i class="ti ti-alert-circle" style="font-size:16px;flex-shrink:0;"></i> ${msg}`;
  box.className = 'alert error show';
}

function showLoginAlertOk(alertId, msg) {
  const box = document.getElementById(alertId);
  box.innerHTML = `<i class="ti ti-circle-check" style="font-size:16px;flex-shrink:0;"></i> ${msg}`;
  box.className = 'alert success show';
}

function setBtnLoading(btnId, loading, restoreHTML='') {
  const btn = document.getElementById(btnId);
  btn.disabled = loading;
  if (loading) { btn._html = btn.innerHTML; btn.innerHTML = '<div class="spinner"></div> Please wait…'; }
  else { btn.innerHTML = restoreHTML || btn._html; }
}

function clearSession() {
  ['borrower_token','borrower_id','borrower_name','borrower_email',
   'borrower_mobile','borrower_aadhaar','borrower_pan',
   'borrower_kyc_status','borrower_score','borrower_employment_type']
    .forEach(k => localStorage.removeItem(k));
}

function saveSession(data) {
  localStorage.setItem('borrower_token',      data.access_token   || '');
  localStorage.setItem('borrower_id',         data.borrower_id    || '');
  localStorage.setItem('borrower_name',       data.full_name      || '');
  localStorage.setItem('borrower_aadhaar',    data.aadhaar_number || '');
  localStorage.setItem('borrower_pan',        data.pan_number     || '');
  localStorage.setItem('borrower_kyc_status', data.kyc_status     || 'pending');
   localStorage.setItem('borrower_employment_type', data.employment_type || '');
}

function getSession() {
  const token = localStorage.getItem('borrower_token');
  if (!token) return null;
  return {
    access_token:   token,
    borrower_id:    parseInt(localStorage.getItem('borrower_id')),
    full_name:      localStorage.getItem('borrower_name'),
    aadhaar_number: localStorage.getItem('borrower_aadhaar'),
    pan_number:     localStorage.getItem('borrower_pan'),
    kyc_status:     localStorage.getItem('borrower_kyc_status'),
  };
}

// Verify token with backend before redirecting
// Always clear session on register page — require fresh login every time
['nbfc_token','nbfc_id','nbfc_name','nbfc_email']
    .forEach(k => localStorage.removeItem(k));

  let currentStep = 1;

  // ── Live duplicate checks ──────────────────────────────────────────────────
  const _debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  async function checkEmailAvail(input) {
    const email = input.value.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return;
    try {
      const res = await fetch(`${CONFIG.BASE_URL}/api/nbfc/check-email/${encodeURIComponent(email)}`);
      const data = await res.json();
      if (!data.available) {
        setErr('email', true);
        document.getElementById('e_email').textContent = 'This email is already registered. Sign in instead.';
      } else {
        setErr('email', false);
      }
    } catch {}
  }

  async function checkRegAvail(input) {
    const reg = input.value.trim();
    if (!reg || reg.length < 4) return;
    try {
      const res = await fetch(`${CONFIG.BASE_URL}/api/nbfc/check-reg/${encodeURIComponent(reg)}`);
      const data = await res.json();
      if (!data.available) {
        setErr('reg_number', true);
        document.getElementById('e_reg_number').textContent = 'This registration number is already on LendOS.';
      } else {
        setErr('reg_number', false);
      }
    } catch {}
  }

  const debouncedEmail     = _debounce(checkEmailAvail);
  const debouncedReg       = _debounce(checkRegAvail);

  async function checkGstAvail(input) {
    const gst = input.value.trim();
    if (!gst || gst.length < 15) return;
    try {
        const res  = await fetch(`${CONFIG.BASE_URL}/api/nbfc/check-gst/${encodeURIComponent(gst)}`);
        const data = await res.json();
        if (!data.available) {
            setErr('gst_number', true);
            document.getElementById('e_gst_number').textContent = 'This GST number is already registered.';
        } else {
            setErr('gst_number', false);
        }
    } catch {}
  }

  const debouncedGst = _debounce(checkGstAvail);

  // ── Tab switching ──────────────────────────────────────────────────────────
  function switchTab(tab) {
    document.getElementById('panel-register').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('panel-login').style.display    = tab === 'login'    ? 'block' : 'none';
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  }

  // ── Step navigation ────────────────────────────────────────────────────────
  function goStep(n) {
    document.querySelectorAll('.step-section').forEach((s, i) => {
      s.classList.toggle('active', i + 1 === n);
    });
    ['bar1','bar2'].forEach((id, i) => {
      const bar = document.getElementById(id);
      bar.className = 'step-bar';
      if (i + 1 < n) bar.classList.add('done');
      else if (i + 1 === n) bar.classList.add('active');
    });
    const labels = ['Company details', 'Portal setup & Password'];
    document.getElementById('step-meta').innerHTML = `<span>Step ${n} / 2</span> — ${labels[n-1]}`;
    currentStep = n;
  }

  // ── Validation helpers ─────────────────────────────────────────────────────
  function setErr(id, show) {
    const el = document.getElementById('e_' + id);
    const inp = document.getElementById(id);
    if (el)  el.classList.toggle('show', show);
    if (inp) inp.classList.toggle('has-error', show);
  }

  function clearErrs(ids) { ids.forEach(id => setErr(id, false)); }

  // ── Password toggle ────────────────────────────────────────────────────────
  function togglePw(id, btn) {
    const inp = document.getElementById(id);
    const isText = inp.type === 'text';
    inp.type = isText ? 'password' : 'text';
    btn.innerHTML = isText ? '<i class="ti ti-eye"></i>' : '<i class="ti ti-eye-off"></i>';
  }

function goStep2() {
    const fields = ['company_name','email','mobile','reg_number','gst_number','city','state'];
    clearErrs(fields);
    let ok = true;

    const regNumber = document.getElementById('reg_number').value.trim().toUpperCase();
    const gstNumber = document.getElementById('gst_number').value.trim().toUpperCase();

    // NBFC Registration Number — strict RBI format: N-14.03112
    const NBFC_REG_REGEX = /^[A-Z]-\d{2}\.\d{5}$/;

    // GSTIN — strict 15-character format: 22AAAAA0000A1Z5
    const GST_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

    if (!document.getElementById('company_name').value.trim()) { setErr('company_name', true); ok = false; }
    if (!Utils.isValidEmail(document.getElementById('email').value.trim())) { setErr('email', true); ok = false; }
    if (!Utils.isValidMobile(document.getElementById('mobile').value.trim())) { setErr('mobile', true); ok = false; }

    if (!NBFC_REG_REGEX.test(regNumber)) {
        setErr('reg_number', true);
        document.getElementById('e_reg_number').textContent = 'Enter a valid NBFC reg. number (e.g. N-14.03112).';
        ok = false;
    }

    if (!gstNumber) {
        setErr('gst_number', true);
        document.getElementById('e_gst_number').textContent = 'GSTIN is required.';
        ok = false;
    } else if (!GST_REGEX.test(gstNumber)) {
        setErr('gst_number', true);
        document.getElementById('e_gst_number').textContent = 'Enter a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5).';
        ok = false;
    }

    if (!document.getElementById('city').value.trim()) { setErr('city', true); ok = false; }
    if (!document.getElementById('state').value) { setErr('state', true); ok = false; }

    if (!ok) return;

    // ── Re-run all 3 duplicate checks before allowing Continue ──
    const emailInput  = document.getElementById('email');
    const regInput    = document.getElementById('reg_number');
    const gstInput    = document.getElementById('gst_number');

    let duplicateFound = false;

    const checks = [
        { el: emailInput, errId: 'e_email',      msg: 'This email is already registered. Sign in instead.' },
        { el: regInput,   errId: 'e_reg_number', msg: 'This registration number is already on LendOS.' },
        { el: gstInput,   errId: 'e_gst_number', msg: 'This GST number is already registered.' },
    ];

    for (const c of checks) {
        const errEl = document.getElementById(c.errId);
        if (errEl && errEl.classList.contains('show')) {
            duplicateFound = true;
            c.el.classList.add('has-error');
            c.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            break;
        }
    }

    if (duplicateFound) return;

    goStep(2);
  }

  // ── Logo preview ───────────────────────────────────────────────────────────
  function previewLogo(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      document.getElementById('e_logo').classList.add('show');
      input.value = '';
      return;
    }
    document.getElementById('e_logo').classList.remove('show');
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('logo-preview-wrap').style.display = 'none';
      const img = document.getElementById('logo-img-preview');
      img.src = e.target.result;
      img.style.display = 'block';
      document.getElementById('logo-upload-box').classList.add('has-file');
      const fname = document.getElementById('logo-filename');
      fname.textContent = '✓ ' + file.name;
      fname.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }

  // ── Register submit ────────────────────────────────────────────────────────
  async function submitRegister() {
    clearErrs(['password','confirm_password']);
    let ok = true;
    const password  = document.getElementById('password').value;
    const confirm   = document.getElementById('confirm_password').value;
    if (!password || password.length < 8)   { setErr('password', true); ok = false; }
    if (password !== confirm)               { setErr('confirm_password', true); ok = false; }
    if (!ok) return;

    Utils.setButtonLoading('btn-register', true, 'Create account <i class="ti ti-arrow-right"></i>');

    const formData = new FormData();
    formData.append('company_name',        document.getElementById('company_name').value.trim());
    formData.append('company_type', 'NBFC – Personal loan');
    formData.append('registration_number', document.getElementById('reg_number').value.trim());
    formData.append('gst_number',          document.getElementById('gst_number').value.trim());
    formData.append('email',               document.getElementById('email').value.trim());
    formData.append('mobile',              document.getElementById('mobile').value.trim());
    formData.append('city',                document.getElementById('city').value.trim());
    formData.append('state',               document.getElementById('state').value);
    formData.append('password',            password);

    const logoFile = document.getElementById('logo_file').files[0];
    if (logoFile) formData.append('logo', logoFile);

    const res = await AuthService.registerWithLogo(formData);

    if (res.ok) {
      document.querySelectorAll('.step-section.active').forEach(s => s.style.display = 'none');
      document.getElementById('step-bar-row')?.remove();
      document.getElementById('step-meta').style.display = 'none';
      const sbr = document.querySelector('.step-bar-row'); if(sbr) sbr.style.display = 'none';
      document.getElementById('success-screen').style.display = 'block';
      const footerLink = document.getElementById('register-signin-link');
      if (footerLink) footerLink.style.display = 'none';
    } else {
      showFormAlert('alert-reg', res.data.detail || 'Registration failed. Please try again.', 'error');
      Utils.setButtonLoading('btn-register', false, 'Create account <i class="ti ti-arrow-right"></i>');
    }
  }

  // ── Login submit ───────────────────────────────────────────────────────────
  async function submitLogin() {
    clearErrs(['login_email','login_password']);
    let ok = true;

    const email    = document.getElementById('login_email').value.trim();
    const password = document.getElementById('login_password').value;

    if (!Utils.isValidEmail(email)) { setErr('login_email', true); ok = false; }
    if (!password) { setErr('login_password', true); ok = false; }
    if (!ok) return;

    Utils.setButtonLoading('btn-login', true, 'Sign in <i class="ti ti-arrow-right"></i>');

    const res = await AuthService.login(email, password);

    if (res.ok) {
      window.location.href = '/nbfc/dashboard';
    } else {
      showFormAlert('alert-login', res.data.detail || 'Invalid email or password.', 'error');
      Utils.setButtonLoading('btn-login', false, 'Sign in <i class="ti ti-arrow-right"></i>');
    }
  }

  // ── Alert helper ───────────────────────────────────────────────────────────
  function showFormAlert(id, msg, type) {
    const box = document.getElementById(id);
    box.innerHTML = `<i class="ti ti-alert-circle" style="font-size:16px;flex-shrink:0;"></i> ${msg}`;
    box.className = `alert ${type} show`;
    setTimeout(() => box.classList.remove('show'), 5000);
  }

  // Enter key on login
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('panel-login').style.display !== 'none') {
      submitLogin();
    }
  });

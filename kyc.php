<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>KYC Verification — Tesla Trade Inc</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="stylesheet" href="/assets/trace-fund-experience.css" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0a0a;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      font-size: 16px;
      min-height: 100vh;
    }
    nav {
      background: #111;
      border-bottom: 1px solid #222;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
    .logo-icon { width: 36px; height: 36px; background: #0a0a0a; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
    .logo-text { font-size: 17px; font-weight: 800; color: #fff; }
    .logo-text span { color: #e31937; }
    .nav-back {
      background: #1a1a1a; border: 1px solid #333; color: #ccc;
      padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600;
      text-decoration: none;
    }
    .page-wrap {
      max-width: 680px; margin: 0 auto; padding: 48px 20px 80px;
    }
    .page-header { text-align: center; margin-bottom: 40px; }
    .badge {
      display: inline-block;
      background: #0a1a2d; border: 1px solid #3b82f633;
      border-radius: 20px; color: #60a5fa;
      font-size: 11px; font-weight: 700; letter-spacing: .8px;
      text-transform: uppercase; padding: 4px 14px; margin-bottom: 16px;
    }
    .page-header h1 { font-size: 28px; font-weight: 900; color: #fff; margin-bottom: 10px; }
    .page-header p { color: #888; font-size: 14px; max-width: 480px; margin: 0 auto; }

    /* Status messages */
    #statusBox {
      display: none;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 24px;
      font-size: 14px;
      line-height: 1.5;
    }
    #statusBox.info    { background: #0a1a2d; border: 1px solid #3b82f633; color: #93c5fd; }
    #statusBox.success { background: #002d12; border: 1px solid #22c55e44; color: #4ade80; }
    #statusBox.error   { background: #1a0005; border: 1px solid #e3193733; color: #f87171; }
    #statusBox.pending { background: #2d2000; border: 1px solid #f59e0b44; color: #fbbf24; }

    /* Already verified box */
    .verified-box {
      display: none;
      text-align: center;
      background: #002d12;
      border: 1px solid #22c55e44;
      border-radius: 16px;
      padding: 48px 32px;
      margin-bottom: 24px;
    }
    .verified-box .v-icon { font-size: 56px; margin-bottom: 16px; }
    .verified-box h2 { color: #22c55e; font-size: 22px; font-weight: 800; margin-bottom: 8px; }
    .verified-box p { color: #aaa; font-size: 14px; }
    .verified-box a { color: #22c55e; }

    /* Pending box */
    .pending-box {
      display: none;
      text-align: center;
      background: #2d2000;
      border: 1px solid #f59e0b44;
      border-radius: 16px;
      padding: 40px 32px;
      margin-bottom: 24px;
    }
    .pending-box .p-icon { font-size: 48px; margin-bottom: 16px; }
    .pending-box h2 { color: #f59e0b; font-size: 20px; font-weight: 800; margin-bottom: 8px; }
    .pending-box p { color: #aaa; font-size: 14px; }

    /* Form */
    .form-card {
      background: #111;
      border: 1px solid #222;
      border-radius: 16px;
      overflow: hidden;
    }
    .form-section {
      padding: 24px 24px 0;
      border-bottom: 1px solid #1a1a1a;
      margin-bottom: 0;
    }
    .form-section:last-of-type { border-bottom: none; }
    .section-label {
      color: #555; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .8px;
      margin-bottom: 18px;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .form-row.full { grid-template-columns: 1fr; }
    .form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
    label { font-size: 12px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: .5px; }
    input, select, textarea {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 10px;
      color: #fff;
      font-size: 14px;
      padding: 12px 14px;
      width: 100%;
      outline: none;
      transition: border-color .15s;
    }
    input:focus, select:focus, textarea:focus { border-color: #e31937; }
    input::placeholder, textarea::placeholder { color: #444; }
    textarea { resize: vertical; min-height: 80px; }
    select option { background: #1a1a1a; }

    /* File upload zones */
    .upload-zone {
      border: 2px dashed #2a2a2a;
      border-radius: 12px;
      padding: 28px 20px;
      text-align: center;
      cursor: pointer;
      transition: all .15s;
      position: relative;
      margin-bottom: 16px;
    }
    .upload-zone:hover, .upload-zone.has-file { border-color: #e31937; background: #1a0005; }
    .upload-zone input[type=file] {
      position: absolute; inset: 0; opacity: 0; cursor: pointer;
      width: 100%; height: 100%;
    }
    .upload-icon { font-size: 28px; margin-bottom: 8px; }
    .upload-label { font-size: 14px; font-weight: 700; color: #aaa; margin-bottom: 4px; }
    .upload-hint  { font-size: 12px; color: #555; }
    .upload-zone.has-file .upload-label { color: #22c55e; }
    .upload-zone.has-file .upload-hint  { color: #4ade80; }

    /* Steps indicator */
    .steps {
      display: flex;
      gap: 0;
      margin-bottom: 32px;
    }
    .step {
      flex: 1;
      text-align: center;
      position: relative;
    }
    .step::after {
      content: '';
      position: absolute;
      top: 16px;
      left: 50%;
      right: -50%;
      height: 2px;
      background: #1a1a1a;
    }
    .step:last-child::after { display: none; }
    .step-dot {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: #1a1a1a;
      border: 2px solid #2a2a2a;
      color: #555;
      font-size: 13px;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 6px;
      position: relative;
      z-index: 1;
    }
    .step.done .step-dot  { background: #002d12; border-color: #22c55e; color: #22c55e; }
    .step.active .step-dot { background: #e31937; border-color: #e31937; color: #fff; }
    .step-name { font-size: 11px; color: #555; }
    .step.active .step-name { color: #e31937; }
    .step.done  .step-name  { color: #22c55e; }

    /* Info callout */
    .info-box {
      background: #0a1a2d;
      border: 1px solid #3b82f633;
      border-radius: 10px;
      padding: 12px 14px;
      margin: 16px 0;
      font-size: 13px;
      color: #93c5fd;
      line-height: 1.6;
    }

    .form-footer { padding: 20px 24px 24px; }
    .submit-btn {
      width: 100%;
      background: #e31937;
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 16px;
      font-size: 16px;
      font-weight: 800;
      cursor: pointer;
      transition: opacity .15s;
    }
    .submit-btn:hover { opacity: .85; }
    .submit-btn:disabled { opacity: .5; cursor: not-allowed; }

    .spinner {
      display: inline-block;
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,.4);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin .6s linear infinite;
      vertical-align: middle;
      margin-right: 6px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 520px) {
      .form-row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
<a class="trace-skip-link" href="#main-content">Skip to content</a>
<div class="trace-disclosure" role="note"></div>

<nav>
  <a href="/" class="logo">
    <div class="logo-icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="24" height="24">
        <rect x="4" y="6" width="28" height="6" rx="2.5" fill="#e31937"/>
        <rect x="15" y="6" width="6" height="24" rx="2.5" fill="#e31937"/>
        <rect x="10" y="28" width="16" height="2.5" rx="1.25" fill="#c0102a"/>
      </svg>
    </div>
    <div class="logo-text">Tesla <span>Trade</span> Inc</div>
  </a>
  <a href="/kyc" class="nav-back">← Go to KYC</a>
</nav>

<div class="page-wrap" id="main-content">
  <div class="page-header">
    <div class="badge">🪪 Identity Verification</div>
    <h1>KYC Verification</h1>
    <p>Required to unlock withdrawals. Your documents are stored securely and reviewed within 24–48 hours.</p>
  </div>

  <!-- Status indicator -->
  <div id="statusBox"></div>

  <!-- Already verified -->
  <div class="verified-box" id="verifiedBox">
    <div class="v-icon">✅</div>
    <h2>You're Already Verified!</h2>
    <p>Your identity has been confirmed and your account is fully verified. You can now request withdrawals from your <a href="/">dashboard</a>.</p>
  </div>

  <!-- Pending review -->
  <div class="pending-box" id="pendingBox">
    <div class="p-icon">⏳</div>
    <h2>KYC Under Review</h2>
    <p>Your documents have been submitted and are currently being reviewed by our team. You will receive an email notification once the review is complete (typically within 24–48 hours).</p>
  </div>

  <!-- Steps -->
  <div class="steps" id="stepsEl">
    <div class="step active" id="step1"><div class="step-dot">1</div><div class="step-name">Personal Info</div></div>
    <div class="step"        id="step2"><div class="step-dot">2</div><div class="step-name">ID Document</div></div>
    <div class="step"        id="step3"><div class="step-dot">3</div><div class="step-name">Selfie &amp; Video</div></div>
  </div>

  <!-- KYC FORM -->
  <form id="kycForm" enctype="multipart/form-data" class="form-card" novalidate>
    <input type="hidden" id="investmentId" name="investmentId"/>
    <input type="hidden" id="userEmail"    name="userEmail"/>
    <input type="hidden" id="userName"     name="userName"/>

    <!-- STEP 1: Personal Info -->
    <div class="form-section" id="formStep1">
      <div class="section-label">Step 1 — Personal Information</div>
      <div class="form-row">
        <div class="form-group">
          <label for="fullName">Full Legal Name</label>
          <input type="text" id="fullName" name="fullName" placeholder="As on your ID" required/>
        </div>
        <div class="form-group">
          <label for="dateOfBirth">Date of Birth</label>
          <input type="date" id="dateOfBirth" name="dateOfBirth" required/>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="nationality">Nationality</label>
          <input type="text" id="nationality" name="nationality" placeholder="e.g. American" required/>
        </div>
      </div>
      <div class="form-group">
        <label for="address">Full Residential Address</label>
        <textarea id="address" name="address" placeholder="Street address, city, state/province, postal code, country" rows="3" required></textarea>
      </div>
    </div>

    <!-- STEP 2: ID Document -->
    <div class="form-section" id="formStep2">
      <div class="section-label">Step 2 — Government-Issued ID</div>
      <div class="form-row">
        <div class="form-group">
          <label for="idType">ID Document Type</label>
          <select id="idType" name="idType" required>
            <option value="">Select type…</option>
            <option value="Passport">Passport</option>
            <option value="National ID Card">National ID Card</option>
            <option value="Driver's License">Driver's License</option>
            <option value="Residence Permit">Residence Permit</option>
          </select>
        </div>
        <div class="form-group">
          <label for="idNumber">ID Number</label>
          <input type="text" id="idNumber" name="idNumber" placeholder="Document number" required/>
        </div>
      </div>
      <label style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:8px">Upload ID Document (front &amp; back)</label>
      <div class="upload-zone" id="idDocZone">
        <input type="file" name="id_doc" id="idDocFile" accept=".jpg,.jpeg,.png,.webp,.heic,.pdf"/>
        <div class="upload-icon">🪪</div>
        <div class="upload-label" id="idDocLabel">Click to upload or drag &amp; drop</div>
        <div class="upload-hint">JPG, PNG, WEBP or PDF · Max 10MB</div>
      </div>
      <div class="info-box">
        💡 Your document must be <strong>clearly readable</strong>. Both sides if it's a card, or the photo page if it's a passport. Ensure no glare, no cropping, and all text is visible.
      </div>
    </div>

    <!-- STEP 3: Selfie & Video -->
    <div class="form-section" id="formStep3" style="padding-bottom:24px">
      <div class="section-label">Step 3 — Selfie &amp; Verification Video</div>

      <label style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:8px">Selfie Photo with ID</label>
      <div class="upload-zone" id="selfieZone">
        <input type="file" name="selfie" id="selfieFile" accept=".jpg,.jpeg,.png,.webp,.heic" capture="user"/>
        <div class="upload-icon">🤳</div>
        <div class="upload-label" id="selfieLabel">Click to upload or take selfie</div>
        <div class="upload-hint">Hold your ID next to your face · JPG or PNG · Max 10MB</div>
      </div>

      <label style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:8px;margin-top:4px">Verification Video</label>
      <div class="upload-zone" id="videoZone">
        <input type="file" name="video" id="videoFile" accept=".mp4,.mov,.webm,.avi,.3gp,.m4v" capture="user"/>
        <div class="upload-icon">📹</div>
        <div class="upload-label" id="videoLabel">Click to record or upload video</div>
        <div class="upload-hint">Say your name and today's date · MP4/MOV · Max 100MB</div>
      </div>

      <div class="info-box">
        📹 <strong>Video instructions:</strong> Record a short clip (10–30 seconds) of yourself facing the camera. Say clearly: <em>"My name is [your full name] and today is [today's date]."</em> Hold your ID document visible in the frame.
      </div>
    </div>

    <div class="form-footer">
      <button type="submit" class="submit-btn" id="submitBtn">Submit KYC Verification →</button>
    </div>
  </form>
</div>

<script>
(function() {
  // ── Read investment ID from URL or localStorage ──────────────
  const urlParams = new URLSearchParams(window.location.search);
  let savedAuth = null;
  try {
    savedAuth = JSON.parse(localStorage.getItem('ttinc_auth') || 'null');
  } catch (error) {}
  let invId = urlParams.get('id')
    || localStorage.getItem('ttinc_investment_id')
    || localStorage.getItem('investmentId')
    || '';
  const userEmail = urlParams.get('email')
    || (savedAuth && savedAuth.email)
    || localStorage.getItem('userEmail')
    || '';
  const userName = urlParams.get('name')
    || (savedAuth && savedAuth.name)
    || localStorage.getItem('userName')
    || '';
  const API_BASE    = '/api';

  function setKycIdentity(investmentId) {
    invId = investmentId || '';
    document.getElementById('investmentId').value = invId;
  }

  setKycIdentity(invId);
  document.getElementById('userEmail').value    = userEmail;
  document.getElementById('userName').value     = userName;

  function showStatus(msg, type) {
    const box = document.getElementById('statusBox');
    box.textContent = msg;
    box.className   = type;
    box.style.display = 'block';
  }
  function hideStatus() {
    document.getElementById('statusBox').style.display = 'none';
  }

  // ── Resolve the signed-in investor's account when the page is opened
  // directly. The page must remain usable instead of flashing and redirecting.
  function checkExistingKyc() {
    if (!invId && userEmail) {
      return fetch(`${API_BASE}/investments?email=${encodeURIComponent(userEmail)}`, {
        credentials: 'same-origin',
        cache: 'no-store'
      })
        .then(r => r.ok ? r.json() : [])
        .then(rows => {
          if (Array.isArray(rows) && rows.length) {
            const selected = rows.find(row => row.status === 'active') || rows[0];
            if (selected && selected.id) {
              setKycIdentity(selected.id);
              try { localStorage.setItem('ttinc_investment_id', selected.id); } catch (error) {}
            }
          }
          return invId;
        })
        .catch(() => invId);
    }
    return Promise.resolve(invId);
  }

  // ── Check existing KYC status ─────────────────────────────────
  checkExistingKyc().then(resolvedId => {
    if (resolvedId) {
    fetch(`${API_BASE}/kyc?investmentId=${encodeURIComponent(invId)}`, { credentials: 'same-origin' })
      .then(r => { if (!r.ok) throw new Error('Status check failed'); return r.json(); })
      .then(data => {
        if (data.status === 'verified') {
          document.getElementById('verifiedBox').style.display = 'block';
          document.getElementById('kycForm').style.display   = 'none';
          document.getElementById('stepsEl').style.display   = 'none';
        } else if (data.status === 'pending') {
          document.getElementById('pendingBox').style.display = 'block';
          document.getElementById('kycForm').style.display    = 'none';
          document.getElementById('stepsEl').style.display    = 'none';
        } else if (data.status === 'rejected' && data.adminNote) {
          showStatus('⚠️ Your previous KYC submission was rejected: ' + data.adminNote + ' — Please resubmit below with corrected documents.', 'error');
        }
      })
      .catch(() => {});
    } else if (!userEmail) {
      showStatus('Complete KYC from your signed-in investor account so we can attach your verification to the correct portfolio.', 'error');
    } else {
      showStatus('We could not find an investment account for this email yet. You can keep this page open and return after your account is activated.', 'error');
    }
  });

  // ── File upload zones ─────────────────────────────────────────
  function setupZone(inputId, zoneId, labelId) {
    const input = document.getElementById(inputId);
    const zone  = document.getElementById(zoneId);
    const label = document.getElementById(labelId);
    input.addEventListener('change', function() {
      const f = this.files[0];
      if (f) {
        label.textContent = '✓ ' + f.name + ' (' + (f.size / 1024 / 1024).toFixed(1) + ' MB)';
        zone.classList.add('has-file');
      }
    });
  }
  setupZone('selfieFile', 'selfieZone', 'selfieLabel');
  setupZone('videoFile',  'videoZone',  'videoLabel');
  setupZone('idDocFile',  'idDocZone',  'idDocLabel');

  // ── Step progress indicator ────────────────────────────────────
  function updateSteps() {
    const s1done = document.getElementById('fullName').value.trim() &&
                   document.getElementById('dateOfBirth').value &&
                   document.getElementById('nationality').value.trim() &&
                   document.getElementById('address').value.trim();
    const s2done = document.getElementById('idType').value &&
                   document.getElementById('idNumber').value.trim() &&
                   document.getElementById('idDocFile').files.length;
    const s3done = document.getElementById('selfieFile').files.length &&
                   document.getElementById('videoFile').files.length;

    setStep(1, s1done ? 'done' : 'active');
    setStep(2, s2done ? 'done' : (s1done ? 'active' : ''));
    setStep(3, s3done ? 'done' : (s2done ? 'active' : ''));
  }
  function setStep(n, state) {
    const el = document.getElementById('step' + n);
    el.classList.remove('done','active');
    if (state === 'done')   el.classList.add('done');
    if (state === 'active') el.classList.add('active');
  }
  document.querySelectorAll('#kycForm input, #kycForm select, #kycForm textarea')
    .forEach(el => el.addEventListener('change', updateSteps));
  document.querySelectorAll('#kycForm input[type=text], #kycForm textarea')
    .forEach(el => el.addEventListener('input', updateSteps));

  // ── Form submit ───────────────────────────────────────────────
  document.getElementById('kycForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    hideStatus();

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Uploading…';

    const formData = new FormData(this);

    // Validate
    const required = { fullName:'Full name', dateOfBirth:'Date of birth', nationality:'Nationality', address:'Address', idType:'ID type', idNumber:'ID number' };
    for (const [k, label] of Object.entries(required)) {
      const val = document.getElementById(k).value.trim();
      if (!val) {
        showStatus('Please fill in: ' + label, 'error');
        btn.disabled = false;
        btn.innerHTML = 'Submit KYC Verification →';
        return;
      }
    }
    if (!document.getElementById('idDocFile').files.length) {
      showStatus('Please upload a government-issued ID document.', 'error');
      btn.disabled = false; btn.innerHTML = 'Submit KYC Verification →'; return;
    }
    if (!document.getElementById('selfieFile').files.length) {
      showStatus('Please upload a selfie photo.', 'error');
      btn.disabled = false; btn.innerHTML = 'Submit KYC Verification →'; return;
    }
    if (!document.getElementById('videoFile').files.length) {
      showStatus('Please upload a verification video.', 'error');
      btn.disabled = false; btn.innerHTML = 'Submit KYC Verification →'; return;
    }

    try {
      const res  = await fetch(API_BASE + '/kyc', { method: 'POST', body: formData, credentials: 'same-origin' });
      const data = await res.json();
      if (data.success) {
        document.getElementById('kycForm').style.display  = 'none';
        document.getElementById('stepsEl').style.display  = 'none';
        document.getElementById('pendingBox').style.display = 'block';
        showStatus('✅ KYC submitted successfully! Our team will review within 24–48 hours and email you the result.', 'success');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        showStatus('❌ ' + (data.error || 'Submission failed. Please try again.'), 'error');
        btn.disabled = false;
        btn.innerHTML = 'Submit KYC Verification →';
      }
    } catch (err) {
      showStatus('❌ Network error. Check your connection and try again.', 'error');
      btn.disabled = false;
      btn.innerHTML = 'Submit KYC Verification →';
    }
  });
})();
</script>
</body>
</html>

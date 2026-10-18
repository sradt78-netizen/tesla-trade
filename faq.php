<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>FAQ — Tesla Trade Inc</title>
  <meta name="description" content="Frequently asked questions about Tesla Trade Inc investment platform, plans, deposits, withdrawals, and KYC verification."/>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="stylesheet" href="/assets/trace-fund-experience.css" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0a0a0a;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
    }
    a { color: #e31937; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* ── NAV ───────────────────────────────────────── */
    nav {
      background: #111;
      border-bottom: 1px solid #222;
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
    }
    .logo-icon {
      width: 38px;
      height: 38px;
      background: #0a0a0a;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .logo-text { font-size: 18px; font-weight: 800; color: #fff; }
    .logo-text span { color: #e31937; }
    .nav-back {
      background: #1a1a1a;
      border: 1px solid #333;
      color: #ccc;
      padding: 8px 18px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      transition: background .15s;
    }
    .nav-back:hover { background: #222; text-decoration: none; }

    /* ── HERO ──────────────────────────────────────── */
    .hero {
      text-align: center;
      padding: 72px 24px 48px;
      background: radial-gradient(ellipse at 50% 0%, #1a0408 0%, #0a0a0a 70%);
    }
    .hero-badge {
      display: inline-block;
      background: #1a0005;
      border: 1px solid #e3193733;
      border-radius: 20px;
      color: #e31937;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .8px;
      text-transform: uppercase;
      padding: 4px 14px;
      margin-bottom: 20px;
    }
    .hero h1 {
      font-size: clamp(28px, 5vw, 48px);
      font-weight: 900;
      color: #fff;
      line-height: 1.2;
      margin-bottom: 16px;
    }
    .hero h1 span { color: #e31937; }
    .hero p {
      color: #888;
      font-size: 16px;
      max-width: 520px;
      margin: 0 auto;
    }

    /* ── SEARCH ────────────────────────────────────── */
    .search-wrap {
      max-width: 600px;
      margin: 36px auto 0;
      padding: 0 24px;
    }
    .search-wrap input {
      width: 100%;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 14px 20px 14px 46px;
      color: #fff;
      font-size: 15px;
      outline: none;
      transition: border-color .15s;
    }
    .search-wrap input:focus { border-color: #e31937; }
    .search-wrap input::placeholder { color: #555; }
    .search-wrap { position: relative; }
    .search-icon {
      position: absolute;
      left: 40px;
      top: 50%;
      transform: translateY(-50%);
      color: #555;
      font-size: 18px;
      pointer-events: none;
    }

    /* ── CONTENT ───────────────────────────────────── */
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 56px 24px 80px;
    }

    /* ── CATEGORY NAV ──────────────────────────────── */
    .cat-nav {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 40px;
    }
    .cat-btn {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      color: #aaa;
      padding: 8px 18px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all .15s;
    }
    .cat-btn:hover, .cat-btn.active {
      background: #e31937;
      border-color: #e31937;
      color: #fff;
    }

    /* ── SECTION ───────────────────────────────────── */
    .faq-section { margin-bottom: 48px; }
    .section-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
    }
    .section-icon {
      width: 40px;
      height: 40px;
      background: #1a0005;
      border: 1px solid #e3193733;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
    }
    .section-title {
      font-size: 18px;
      font-weight: 800;
      color: #fff;
    }

    /* ── FAQ ITEM ──────────────────────────────────── */
    .faq-item {
      background: #111;
      border: 1px solid #222;
      border-radius: 14px;
      margin-bottom: 10px;
      overflow: hidden;
      transition: border-color .15s;
    }
    .faq-item.open { border-color: #e3193744; }
    .faq-item:hover { border-color: #333; }

    .faq-q {
      padding: 18px 20px;
      cursor: pointer;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      user-select: none;
    }
    .faq-q-text {
      font-size: 15px;
      font-weight: 700;
      color: #e0e0e0;
      flex: 1;
      line-height: 1.4;
    }
    .faq-item.open .faq-q-text { color: #fff; }
    .faq-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #1a1a1a;
      border: 1px solid #333;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
      transition: all .2s;
      font-size: 14px;
      font-weight: 700;
      color: #aaa;
    }
    .faq-item.open .faq-icon {
      background: #e31937;
      border-color: #e31937;
      color: #fff;
      transform: rotate(45deg);
    }

    .faq-a {
      display: none;
      padding: 0 20px 20px;
      color: #999;
      font-size: 14px;
      line-height: 1.75;
    }
    .faq-item.open .faq-a { display: block; }
    .faq-a strong { color: #e0e0e0; }
    .faq-a ul { padding-left: 20px; margin: 8px 0; }
    .faq-a ul li { margin-bottom: 6px; }
    .faq-a .highlight-box {
      background: #0a1a2d;
      border: 1px solid #3b82f633;
      border-radius: 8px;
      padding: 12px 14px;
      margin-top: 10px;
      color: #9bb8d9;
      font-size: 13px;
    }
    .faq-a .warning-box {
      background: #1a0005;
      border: 1px solid #e3193733;
      border-radius: 8px;
      padding: 12px 14px;
      margin-top: 10px;
      color: #e31937;
      font-size: 13px;
    }
    .faq-a .success-box {
      background: #002d12;
      border: 1px solid #22c55e33;
      border-radius: 8px;
      padding: 12px 14px;
      margin-top: 10px;
      color: #4ade80;
      font-size: 13px;
    }

    /* ── BADGE TABLE ───────────────────────────────── */
    .plan-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }
    .plan-table th {
      background: #1a1a1a;
      color: #888;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .8px;
      padding: 10px 12px;
      text-align: left;
    }
    .plan-table td {
      padding: 12px;
      border-bottom: 1px solid #1a1a1a;
      color: #ccc;
      font-size: 14px;
    }
    .plan-table tr:last-child td { border-bottom: none; }
    .plan-table .roi { color: #22c55e; font-weight: 800; }
    .plan-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 700;
    }
    .badge-starter { background: #1a2000; color: #a3e635; }
    .badge-growth  { background: #0a1a2d; color: #60a5fa; }
    .badge-elite   { background: #2d0a00; color: #fb923c; }

    @media (max-width: 600px) {
      nav { padding: 12px 16px; }
      .logo-text { font-size: 16px; }
      .nav-back { padding: 7px 12px; font-size: 12px; }
      .container { padding: 40px 14px 64px; }
      .plan-table { table-layout: fixed; }
      .plan-table th,
      .plan-table td {
        padding: 9px 6px;
        font-size: 11px;
        overflow-wrap: anywhere;
      }
      .plan-table th { font-size: 9px; letter-spacing: .35px; }
      .plan-badge { padding: 3px 6px; font-size: 9px; }
    }

    /* ── NO RESULTS ────────────────────────────────── */
    .no-results {
      text-align: center;
      padding: 60px 24px;
      color: #555;
      display: none;
    }
    .no-results svg { opacity: .4; margin-bottom: 16px; }
    .no-results p { font-size: 15px; }

    /* ── CTA ───────────────────────────────────────── */
    .cta-card {
      background: linear-gradient(135deg, #1a0005 0%, #0a0a0a 100%);
      border: 1px solid #e3193733;
      border-radius: 16px;
      padding: 40px 32px;
      text-align: center;
      margin-top: 56px;
    }
    .cta-card h2 { font-size: 22px; font-weight: 900; color: #fff; margin-bottom: 10px; }
    .cta-card p  { color: #888; font-size: 14px; margin-bottom: 24px; }
    .cta-btn {
      display: inline-block;
      background: #e31937;
      color: #fff;
      font-size: 15px;
      font-weight: 800;
      padding: 14px 32px;
      border-radius: 10px;
      text-decoration: none;
      transition: opacity .15s;
    }
    .cta-btn:hover { opacity: .85; text-decoration: none; }

    /* ── FOOTER ────────────────────────────────────── */
    footer {
      border-top: 1px solid #1a1a1a;
      padding: 28px 24px;
      text-align: center;
      color: #333;
      font-size: 12px;
    }

    /* ── HIDDEN for filter ─────────────────────────── */
    .faq-section.hidden { display: none; }
    .faq-item.hidden    { display: none; }
  </style>
</head>
<body>
<a class="trace-skip-link" href="#main-content">Skip to content</a>
<div class="trace-disclosure" role="note"></div>

<nav>
  <a href="/" class="logo">
    <div class="logo-icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="26" height="26">
        <rect x="4" y="6" width="28" height="6" rx="2.5" fill="#e31937"/>
        <rect x="15" y="6" width="6" height="24" rx="2.5" fill="#e31937"/>
        <rect x="10" y="28" width="16" height="2.5" rx="1.25" fill="#c0102a"/>
      </svg>
    </div>
    <div class="logo-text">Tesla <span>Trade</span> Inc</div>
  </a>
  <a href="/" class="nav-back">← Back to Platform</a>
</nav>

<div class="hero">
  <div class="hero-badge">Support Center</div>
  <h1>Frequently Asked<br/><span>Questions</span></h1>
  <p>Everything you need to know about Tesla Trade Inc — from getting started to managing your returns.</p>
</div>

<div class="search-wrap">
  <span class="search-icon">🔍</span>
  <input type="text" id="searchInput" placeholder="Search questions..." autocomplete="off"/>
</div>

<div class="container" id="main-content">
  <!-- CATEGORY NAV -->
  <div class="cat-nav">
    <button class="cat-btn active" data-cat="all">All Questions</button>
    <button class="cat-btn" data-cat="getting-started">Getting Started</button>
    <button class="cat-btn" data-cat="plans">Investment Plans</button>
    <button class="cat-btn" data-cat="deposits">Deposits & Funds</button>
    <button class="cat-btn" data-cat="kyc">KYC Verification</button>
    <button class="cat-btn" data-cat="withdrawals">Withdrawals</button>
    <button class="cat-btn" data-cat="referral">Referral Program</button>
    <button class="cat-btn" data-cat="security">Security</button>
  </div>

  <!-- ═══════════════════════════════════════════════════════ -->
  <!--  GETTING STARTED                                        -->
  <!-- ═══════════════════════════════════════════════════════ -->
  <div class="faq-section" data-cat="getting-started">
    <div class="section-header">
      <div class="section-icon">🚀</div>
      <div class="section-title">Getting Started</div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">What is Tesla Trade Inc?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Tesla Trade Inc is an AI-powered investment platform that uses advanced algorithmic trading strategies to generate consistent returns for investors. Our proprietary AI engine monitors global financial markets 24/7 — including Tesla (TSLA), SpaceX, xAI, and other high-growth assets — to maximize portfolio performance while managing risk.
        <div class="success-box">✅ Founded by a team of quant traders and AI engineers, Tesla Trade Inc has delivered consistent returns across all market conditions.</div>
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">How do I create an account?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Creating an account is simple and takes less than 5 minutes:
        <ul>
          <li>Visit our platform and enter your name and email address</li>
          <li>Verify your email using the OTP (one-time password) sent to your inbox</li>
          <li>Select your investment plan and deposit amount</li>
          <li>Choose your preferred payment method and send funds</li>
          <li>Our team reviews and activates your account within 1–24 hours</li>
        </ul>
        <div class="highlight-box">💡 If you don't receive the OTP email, check your spam/junk folder — or click <strong>"Resend OTP"</strong> on the sign-in page to get a fresh code.</div>
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">How long does it take for my account to be approved?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Our team typically reviews and approves accounts within <strong>1 to 24 hours</strong> of receiving a confirmed deposit. You will receive an email notification as soon as your account is approved and your investment is active. During high volume periods, approval may take up to 48 hours.
        <div class="highlight-box">📧 Make sure the email address you registered with is correct and check your spam folder for approval notifications.</div>
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">I didn't receive my OTP email. What should I do?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        If your OTP email hasn't arrived within a few minutes:
        <ul>
          <li><strong>Check your spam / junk folder</strong> — our emails may be filtered initially</li>
          <li>On the sign-in page, click <strong>"Resend OTP"</strong> to request a fresh code (valid for 10 minutes)</li>
          <li>Make sure you entered your email address correctly — even one typo will send the email to the wrong inbox</li>
          <li>Add <em>noreply@teslawealths.org</em> to your contacts/safe senders list</li>
        </ul>
        You can request a new OTP up to 5 times per hour. If you still cannot receive emails, contact our support team via live chat.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">Is Tesla Trade Inc regulated?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Tesla Trade Inc operates as a private investment management firm. We maintain strict internal compliance policies modelled on institutional investment standards. Our KYC (Know Your Customer) verification process is mandatory for all withdrawal requests and ensures the security and legitimacy of all investor accounts.
        <div class="warning-box">⚠️ Past performance is not a guarantee of future results. All investments carry inherent risk.</div>
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════ -->
  <!--  INVESTMENT PLANS                                       -->
  <!-- ═══════════════════════════════════════════════════════ -->
  <div class="faq-section" data-cat="plans">
    <div class="section-header">
      <div class="section-icon">📊</div>
      <div class="section-title">Investment Plans &amp; Returns</div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">What investment plans are available?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        We offer five AI-managed portfolio options, each with its own allocation range, cycle, and projected return target:
        <table class="plan-table">
          <thead>
            <tr>
              <th>Plan</th>
              <th>Minimum Deposit</th>
              <th>Projected ROI</th>
              <th>Cycle</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="plan-badge badge-starter">Explorer</span></td>
              <td>$30 – $1,000</td>
              <td class="roi">50%</td>
              <td>30 days</td>
            </tr>
            <tr>
              <td><span class="plan-badge badge-growth">Pioneer</span></td>
              <td>$1,000 – $10,000</td>
              <td class="roi">80%</td>
              <td>60 days</td>
            </tr>
            <tr>
              <td><span class="plan-badge badge-elite">Visionary</span></td>
              <td>$10,000 – $25,000</td>
              <td class="roi">120%</td>
              <td>90 days</td>
            </tr>
            <tr>
              <td><span class="plan-badge badge-elite">Pioneer Plus</span></td>
              <td>$25,000 – $55,000</td>
              <td class="roi">180%</td>
              <td>180 days</td>
            </tr>
            <tr>
              <td><span class="plan-badge badge-growth">Dogecoin Reserve Fund</span></td>
              <td>$1,000 – $25,000</td>
              <td class="roi">40% – 120%</td>
              <td>90 days</td>
            </tr>
          </tbody>
        </table>
        <div class="highlight-box">📈 Projected ROI is applied to your invested principal and reflected in your dashboard after an update by our team. Projections are estimates and are not guaranteed.</div>
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">How is my ROI calculated and when is it applied?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Your return on investment (ROI) is set by our portfolio management team based on current market conditions and your chosen plan. The projected percentage is applied to your total invested principal to compute your current portfolio value and total earnings.
        <br/><br/>
        For example: if you invest <strong>$10,000</strong> in the <strong>Visionary</strong> plan and the configured projected ROI is <strong>120%</strong>, the projected portfolio value is <strong>$22,000</strong> — a projected gain of $12,000. You will receive an email notification each time your ROI is updated by the admin team. Projections are estimates, not guarantees.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">Can I upgrade my plan after depositing?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Yes. You can add additional funds to your account at any time to increase your investment. Contact our support team via live chat or email to discuss upgrading your portfolio tier if your balance meets the minimum for a higher-tier plan.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">What assets does the AI trade?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Our AI engine trades across multiple asset classes, with a heavy focus on Elon Musk's portfolio of companies and adjacent high-growth technology assets, including:
        <ul>
          <li><strong>TSLA</strong> — Tesla, Inc. (NASDAQ listed)</li>
          <li><strong>SpaceX</strong> — Pre-IPO shares and derivatives</li>
          <li><strong>xAI / Grok</strong> — Artificial intelligence ventures</li>
          <li><strong>Neuralink</strong> — Neurotechnology</li>
          <li><strong>X Corp.</strong> — Technology and media</li>
          <li><strong>The Boring Company</strong> — Infrastructure tech</li>
        </ul>
        The AI also holds diversified positions in S&P 500 components and crypto assets to balance portfolio volatility.
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════ -->
  <!--  DEPOSITS                                               -->
  <!-- ═══════════════════════════════════════════════════════ -->
  <div class="faq-section" data-cat="deposits">
    <div class="section-header">
      <div class="section-icon">💰</div>
      <div class="section-title">Deposits &amp; Funding</div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">What payment methods are accepted?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        We accept a wide range of payment methods for maximum convenience:
        <ul>
          <li>🪙 <strong>USDT (TRC-20)</strong> — Tether stablecoin on the TRON network</li>
          <li>⬡ <strong>Ethereum (ERC-20)</strong> — ETH on the Ethereum network</li>
          <li>₿ <strong>Bitcoin (BTC)</strong> — Bitcoin network</li>
          <li>🏦 <strong>Bank Transfer</strong> — Wire/ACH transfer</li>
          <li>📱 <strong>Venmo</strong> — US-based peer payments</li>
          <li>💵 <strong>Cash App</strong> — Cash App payments</li>
          <li>🅿️ <strong>PayPal</strong> — International payments</li>
          <li>🔷 <strong>Alipay</strong> — Chinese payment platform</li>
          <li>💬 <strong>WeChat Pay</strong> — WeChat payment</li>
        </ul>
        <div class="highlight-box">💡 Visit your dashboard for the current wallet addresses and payment handles. Do not use saved addresses from previous transactions — always check the dashboard for the latest.</div>
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">How long does a deposit take to be reflected in my account?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        <ul>
          <li><strong>Crypto (USDT/ETH/BTC):</strong> 10–60 minutes for network confirmation</li>
          <li><strong>Bank Transfer:</strong> 1–3 business days</li>
          <li><strong>Venmo / PayPal:</strong> Same day to 24 hours</li>
          <li><strong>Alipay / WeChat Pay:</strong> Same day</li>
        </ul>
        After your payment is confirmed, our team manually activates your account (1–24 hours). You will receive an email confirmation for your first deposit and each subsequent deposit.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">Is there a minimum or maximum deposit?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        The minimum deposit depends on your chosen plan:
        <ul>
          <li>Explorer — <strong>$30 minimum</strong></li>
          <li>Pioneer — <strong>$1,000 minimum</strong></li>
          <li>Visionary — <strong>$10,000 minimum</strong></li>
          <li>Pioneer Plus — <strong>$25,000 minimum</strong></li>
          <li>Dogecoin Reserve Fund — <strong>$1,000 minimum</strong></li>
        </ul>
        Each plan also has a configured maximum allocation shown in the plan selector. Additional deposits can be made at any time to grow your portfolio.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">Will I receive a confirmation email after depositing?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Yes. You will receive email confirmations at each step:
        <ul>
          <li>📧 <strong>Registration email</strong> — when you first sign up</li>
          <li>📧 <strong>First deposit email</strong> — when your first payment is received</li>
          <li>📧 <strong>Account approved email</strong> — when our team activates your account</li>
          <li>📧 <strong>Additional deposit emails</strong> — for each subsequent deposit</li>
          <li>📧 <strong>ROI update emails</strong> — when your portfolio returns are updated</li>
        </ul>
        If you are not receiving emails, check your spam folder and add our sender address to your safe list.
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════ -->
  <!--  KYC                                                    -->
  <!-- ═══════════════════════════════════════════════════════ -->
  <div class="faq-section" data-cat="kyc">
    <div class="section-header">
      <div class="section-icon">🪪</div>
      <div class="section-title">KYC Identity Verification</div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">What is KYC and why is it required?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        KYC stands for <strong>Know Your Customer</strong>. It is a standard identity verification process used by all regulated financial institutions to:
        <ul>
          <li>Confirm your identity and protect your account from unauthorized access</li>
          <li>Comply with anti-money laundering (AML) and financial fraud prevention policies</li>
          <li>Ensure the security of our investment platform</li>
        </ul>
        <div class="warning-box">⚠️ KYC verification is mandatory before any withdrawal can be processed. You will not be able to withdraw funds without a verified KYC status.</div>
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">What documents do I need for KYC?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        You will need to provide:
        <ul>
          <li><strong>Personal information:</strong> full legal name, date of birth, nationality, and residential address</li>
          <li><strong>Government-issued photo ID:</strong> passport, national ID card, or driver's license (front and back)</li>
          <li><strong>Selfie photo:</strong> a clear photo of yourself holding your ID document</li>
          <li><strong>Short verification video:</strong> a brief video (10–30 seconds) of yourself stating your name and the date</li>
        </ul>
        <div class="highlight-box">📋 All images must be clear, unobstructed, and in colour. Blurry, cropped, or low-quality photos will be rejected.</div>
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">How long does KYC verification take?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Our team reviews KYC submissions within <strong>1–48 hours</strong>. You will receive an email notification with the result:
        <ul>
          <li>✅ <strong>Approved:</strong> Your account is fully verified and you can proceed with withdrawals</li>
          <li>❌ <strong>Rejected:</strong> The email will explain why and what to resubmit</li>
        </ul>
        During high volume periods, review may take up to 72 hours.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">My KYC was rejected — what do I do?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        If your KYC is rejected, you will receive an email explaining the reason. Common reasons include:
        <ul>
          <li>Blurry or low-resolution ID document photos</li>
          <li>Mismatched name (ID name doesn't match registered name)</li>
          <li>Expired ID document</li>
          <li>Video was too short or couldn't clearly see your face</li>
        </ul>
        Simply visit the KYC page from your dashboard, correct the issues, and resubmit. There is no limit on the number of resubmissions.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">Is my personal information safe?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Your personal information and documents are stored securely on our encrypted servers and are only accessible to authorized verification staff. We do not sell, share, or use your KYC data for any purpose other than identity verification. All documents are protected by access restrictions at the server level — they cannot be accessed via a web browser directly.
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════ -->
  <!--  WITHDRAWALS                                            -->
  <!-- ═══════════════════════════════════════════════════════ -->
  <div class="faq-section" data-cat="withdrawals">
    <div class="section-header">
      <div class="section-icon">💸</div>
      <div class="section-title">Withdrawals</div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">How do I withdraw my funds?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        To withdraw your funds:
        <ul>
          <li>Log in to your dashboard</li>
          <li>Ensure your KYC is verified (mandatory)</li>
          <li>Ensure withdrawal access has been enabled on your account by our team</li>
          <li>Click on your investment and select "Withdraw"</li>
          <li>Enter the withdrawal amount and your payment destination</li>
          <li>Submit the request — our team will process it within 1–3 business days</li>
        </ul>
        You will receive email confirmations when your request is received and when it is processed.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">Why is my withdrawal button not available?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        There are two requirements for withdrawals:
        <ul>
          <li><strong>1. KYC verification</strong> — You must have a verified identity on file</li>
          <li><strong>2. Withdrawal access enabled</strong> — Our team enables withdrawals on your account when your investment term has matured</li>
        </ul>
        If either condition is not met, the withdrawal button will be inactive. Contact our support team via live chat if you believe your account should be eligible for withdrawal.
        <div class="highlight-box">💡 Completing KYC early ensures you won't face delays when your investment matures.</div>
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">How long do withdrawals take to process?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Processing times depend on the withdrawal method:
        <ul>
          <li><strong>Crypto (USDT/ETH/BTC):</strong> 1–24 hours after admin approval</li>
          <li><strong>Bank Wire:</strong> 1–5 business days</li>
          <li><strong>Venmo / PayPal:</strong> Same day to 2 business days</li>
          <li><strong>Alipay / WeChat Pay:</strong> 1–2 business days</li>
        </ul>
        All withdrawals are reviewed by our compliance team before being processed to ensure account security.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">Are there withdrawal fees?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Tesla Trade Inc does not charge internal withdrawal fees. However, depending on your payment method, standard network or platform fees may apply:
        <ul>
          <li>Crypto withdrawals may incur blockchain network (gas) fees</li>
          <li>Bank wires may incur a fee from your receiving bank</li>
          <li>PayPal/Venmo international transfers may be subject to their platform fees</li>
        </ul>
        These fees are external and outside our control.
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════ -->
  <!--  REFERRAL                                               -->
  <!-- ═══════════════════════════════════════════════════════ -->
  <div class="faq-section" data-cat="referral">
    <div class="section-header">
      <div class="section-icon">🎁</div>
      <div class="section-title">Referral Program</div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">How does the Tesla Trade Inc referral program work?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Our referral program rewards both you and your friends:
        <ul>
          <li><strong>You (the referrer):</strong> Earn a <strong>20% commission</strong> on every deposit your referred investor makes — automatically credited to your account</li>
          <li><strong>Your friend (the referred user):</strong> Receives a <strong>$100 welcome bonus</strong> when they make their first deposit using your referral code</li>
        </ul>
        <div class="success-box">✅ There is no limit to the number of referrals. The more people you refer, the more you earn.</div>
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">How do I share my referral code?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Your unique referral code and link are displayed on your dashboard in the <strong>Referral</strong> section. You can:
        <ul>
          <li>Share the direct link — anyone who registers through it automatically gets your referral code applied</li>
          <li>Share your 8-character referral code — your friend can enter it manually when signing up</li>
        </ul>
        Share on social media, email, messaging apps — wherever your network is.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">When do I receive my referral bonus?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        <ul>
          <li><strong>Referrer commission (20%):</strong> Credited automatically when your referred investor makes a deposit. It is added directly to your active portfolio balance.</li>
          <li><strong>Referred user bonus ($100):</strong> Credited to your account when you make your first deposit using a referral code. The bonus has a <strong>maturity period</strong> (typically 30 days) before it can be withdrawn — this is to prevent abuse of the referral system.</li>
        </ul>
        <div class="highlight-box">💡 Your referral bonus starts generating returns from the moment it is credited — it is part of your active portfolio.</div>
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">What is the referral bonus maturity period?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        The referral bonus ($100) credited to a newly referred investor has a <strong>maturity period</strong> — typically 30 days — before it becomes withdrawable. This is a security measure to prevent fraudulent referral activity.
        <br/><br/>
        During the maturity period, the bonus is part of your active portfolio and earns returns alongside your main investment. The exact maturity date is shown in your referral dashboard and was included in the bonus notification email you received.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">Can I refer myself or use multiple accounts?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        <div class="warning-box">⚠️ Self-referrals and multi-account abuse are strictly prohibited and are automatically detected by our system. Accounts found abusing the referral program will have their bonuses forfeited and may be suspended.</div>
        The referral program is designed to reward genuine investor referrals only.
      </div>
    </div>
  </div>

  <!-- ═══════════════════════════════════════════════════════ -->
  <!--  SECURITY                                               -->
  <!-- ═══════════════════════════════════════════════════════ -->
  <div class="faq-section" data-cat="security">
    <div class="section-header">
      <div class="section-icon">🔒</div>
      <div class="section-title">Security &amp; Account Safety</div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">How is my account secured?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        Tesla Trade Inc uses multiple layers of security:
        <ul>
          <li><strong>OTP (One-Time Password) authentication</strong> — every login requires a fresh code sent to your email</li>
          <li><strong>KYC verification</strong> — your identity is confirmed before withdrawals are allowed</li>
          <li><strong>Encrypted data storage</strong> — all personal information and documents are stored securely</li>
          <li><strong>No passwords stored</strong> — we use email-based OTP login only, so there's no password to steal</li>
          <li><strong>Server-level access control</strong> — uploaded documents are not accessible via the web directly</li>
        </ul>
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">Will Tesla Trade Inc ever ask for my password or OTP?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        <div class="warning-box">⚠️ <strong>Never share your OTP with anyone.</strong> Tesla Trade Inc staff will NEVER ask for your OTP code, your wallet private keys, your bank login, or any other sensitive credentials. Any communication asking for these is fraudulent.</div>
        If you receive a suspicious message claiming to be from Tesla Trade Inc, contact us immediately through the official live chat on the platform.
      </div>
    </div>

    <div class="faq-item">
      <div class="faq-q">
        <span class="faq-q-text">What should I do if I suspect unauthorized access to my account?</span>
        <span class="faq-icon">+</span>
      </div>
      <div class="faq-a">
        <ul>
          <li>Contact our support team immediately via <strong>live chat</strong> on the platform</li>
          <li>If you believe your email account was compromised, secure your email first</li>
          <li>Do not share any account details until you have confirmed you are speaking with official Tesla Trade Inc support</li>
        </ul>
        Since we use OTP login (no passwords), the risk of account takeover is significantly reduced compared to password-based systems.
      </div>
    </div>
  </div>

  <!-- NO RESULTS -->
  <div class="no-results" id="noResults">
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" stroke="#555" stroke-width="2"/><path d="m21 21-4.35-4.35" stroke="#555" stroke-width="2" stroke-linecap="round"/></svg>
    <p>No results found for your search. Try different keywords or <a href="#" onclick="clearSearch()">clear the search</a>.</p>
  </div>

  <!-- CTA CARD -->
  <div class="cta-card" id="ctaCard">
    <h2>Still have questions?</h2>
    <p>Our support team is available 24/7 through the live chat on your dashboard.</p>
    <a href="/" class="cta-btn">Open Live Chat →</a>
  </div>
</div>

<footer>
  &copy; <?= date('Y') ?> Tesla Trade Inc — Secure Investment Platform. All rights reserved.
</footer>

<script>
// ── Accordion ────────────────────────────────────────────────
document.querySelectorAll('.faq-q').forEach(q => {
  q.addEventListener('click', function() {
    const item = this.parentElement;
    const isOpen = item.classList.contains('open');
    // Close all
    document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
    // Toggle clicked
    if (!isOpen) item.classList.add('open');
  });
});

// ── Category filter ──────────────────────────────────────────
document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    const cat = this.dataset.cat;
    document.querySelectorAll('.faq-section').forEach(sec => {
      if (cat === 'all' || sec.dataset.cat === cat) {
        sec.classList.remove('hidden');
      } else {
        sec.classList.add('hidden');
      }
    });
    // Clear search
    document.getElementById('searchInput').value = '';
    document.getElementById('noResults').style.display = 'none';
    document.getElementById('ctaCard').style.display = 'block';
  });
});

// ── Search ───────────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', function() {
  const q = this.value.trim().toLowerCase();
  if (!q) {
    document.querySelectorAll('.faq-section').forEach(sec => sec.classList.remove('hidden'));
    document.querySelectorAll('.faq-item').forEach(item => item.classList.remove('hidden'));
    document.getElementById('noResults').style.display = 'none';
    document.getElementById('ctaCard').style.display = 'block';
    // Reset category buttons
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-cat="all"]').classList.add('active');
    return;
  }
  let anyVisible = false;
  document.querySelectorAll('.faq-section').forEach(sec => {
    let secHasMatch = false;
    sec.querySelectorAll('.faq-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      if (text.includes(q)) {
        item.classList.remove('hidden');
        secHasMatch = true;
        anyVisible = true;
      } else {
        item.classList.add('hidden');
      }
    });
    if (secHasMatch) {
      sec.classList.remove('hidden');
    } else {
      sec.classList.add('hidden');
    }
  });
  document.getElementById('noResults').style.display = anyVisible ? 'none' : 'block';
  document.getElementById('ctaCard').style.display = anyVisible ? 'block' : 'none';
  // Reset cat buttons
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
});

function clearSearch() {
  document.getElementById('searchInput').value = '';
  document.getElementById('searchInput').dispatchEvent(new Event('input'));
  return false;
}

// Open first item on load as a teaser
document.querySelector('.faq-item').classList.add('open');
</script>
</body>
</html>

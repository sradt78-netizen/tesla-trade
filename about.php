<?php
/**
 * Tesla Trade Inc — About Us
 */
$year = date('Y');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>About Us — Tesla Trade Inc</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="stylesheet" href="/assets/trace-fund-experience.css" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #060606;
      color: #d4d4d4;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif;
      font-size: 15px;
      line-height: 1.8;
    }

    /* ── Nav ── */
    .nav {
      position: sticky; top: 0; z-index: 100;
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 24px;
      background: rgba(6,6,6,0.96);
      border-bottom: 1px solid #151515;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .nav-logo {
      display: flex; align-items: center; gap: 10px;
      text-decoration: none; color: #fff;
      font-size: 15px; font-weight: 800; letter-spacing: -.2px;
    }
    .nav-back {
      background: #111; border: 1px solid #252525; border-radius: 9px;
      padding: 8px 16px; color: #888; font-size: 13px; font-weight: 600;
      cursor: pointer; text-decoration: none;
      display: inline-flex; align-items: center; gap: 6px;
      transition: border-color .15s, color .15s;
    }
    .nav-back:hover { border-color: #3a3a3a; color: #fff; }

    /* ── Hero ── */
    .hero {
      background: linear-gradient(160deg, #0d0d0d 0%, #080808 100%);
      border-bottom: 1px solid #131313;
      padding: 60px 24px 50px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    .hero::before {
      content: '';
      position: absolute; inset: 0;
      background: radial-gradient(ellipse 60% 50% at 50% 0%, rgba(227,25,55,0.07) 0%, transparent 70%);
      pointer-events: none;
    }
    .hero-badge {
      display: inline-block;
      background: #1a0005; color: #e31937; border: 1px solid #e3193733;
      border-radius: 30px; padding: 5px 18px;
      font-size: 11px; font-weight: 800; letter-spacing: 1px;
      text-transform: uppercase; margin-bottom: 20px;
    }
    .hero h1 { font-size: 36px; font-weight: 800; color: #fff; margin-bottom: 14px; line-height: 1.2; }
    .hero h1 span { color: #e31937; }
    .hero p  { font-size: 15px; color: #666; max-width: 580px; margin: 0 auto; line-height: 1.75; }

    /* ── Wrapper ── */
    .wrapper { max-width: 900px; margin: 0 auto; padding: 52px 24px 80px; }

    /* ── Stats bar ── */
    .stats-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin-bottom: 56px;
    }
    .stat-card {
      background: #0d0d0d;
      border: 1px solid #1a1a1a;
      border-radius: 14px;
      padding: 20px 14px;
      text-align: center;
    }
    .stat-num  { font-size: 26px; font-weight: 800; color: #fff; margin-bottom: 4px; }
    .stat-num span { color: #e31937; }
    .stat-label { font-size: 11px; color: #444; text-transform: uppercase; letter-spacing: .6px; }

    /* ── Section ── */
    .section { margin-bottom: 52px; }
    .section-label {
      font-size: 11px; color: #e31937; font-weight: 800;
      text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;
    }
    .section h2 {
      font-size: 26px; font-weight: 800; color: #fff; margin-bottom: 16px; line-height: 1.25;
    }
    .section p  { color: #777; font-size: 14px; margin-bottom: 14px; line-height: 1.8; }
    .section ul { padding-left: 22px; color: #777; font-size: 14px; }
    .section li { margin-bottom: 10px; line-height: 1.7; }
    .section li strong { color: #bbb; }

    /* ── Two-column grid ── */
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 28px;
    }

    /* ── Feature cards ── */
    .feature-card {
      background: #0d0d0d;
      border: 1px solid #1a1a1a;
      border-radius: 16px;
      padding: 22px 20px;
      transition: border-color .2s;
    }
    .feature-card:hover { border-color: #2a2a2a; }
    .feature-icon  { font-size: 28px; margin-bottom: 12px; }
    .feature-title { font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 6px; }
    .feature-desc  { font-size: 13px; color: #555; line-height: 1.65; }

    /* ── Values ── */
    .values-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 28px;
    }
    .value-card {
      background: #0a0a0a;
      border: 1px solid #141414;
      border-radius: 14px;
      padding: 20px;
      text-align: center;
    }
    .value-icon  { font-size: 32px; margin-bottom: 12px; }
    .value-title { font-size: 14px; font-weight: 800; color: #ddd; margin-bottom: 6px; }
    .value-desc  { font-size: 12px; color: #555; line-height: 1.6; }

    /* ── Mission highlight ── */
    .mission-block {
      background: linear-gradient(135deg, #0d0005 0%, #0a0a0a 100%);
      border: 1px solid #1e0005;
      border-radius: 20px;
      padding: 36px 32px;
      margin-bottom: 52px;
      position: relative;
      overflow: hidden;
    }
    .mission-block::before {
      content: '';
      position: absolute;
      top: -30px; right: -30px;
      width: 200px; height: 200px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(227,25,55,0.08) 0%, transparent 70%);
    }
    .mission-block blockquote {
      font-size: 20px;
      font-weight: 700;
      color: #ccc;
      line-height: 1.55;
      font-style: italic;
      position: relative;
    }
    .mission-block blockquote::before {
      content: '"';
      font-size: 72px;
      color: #e31937;
      opacity: .3;
      position: absolute;
      top: -24px; left: -10px;
      line-height: 1;
      font-family: Georgia, serif;
      pointer-events: none;
    }
    .mission-block .mission-attr {
      margin-top: 16px;
      font-size: 12px;
      color: #444;
      font-style: normal;
    }

    /* ── Contact block ── */
    .contact-block {
      background: #0d0d0d;
      border: 1px solid #1a1a1a;
      border-radius: 20px;
      padding: 32px;
      text-align: center;
    }
    .contact-block h3 { font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 8px; }
    .contact-block p  { font-size: 14px; color: #555; margin-bottom: 24px; }
    .contact-btn {
      display: inline-block;
      background: #e31937;
      color: #fff;
      text-decoration: none;
      border-radius: 10px;
      padding: 13px 28px;
      font-size: 14px;
      font-weight: 700;
      margin: 0 6px 10px;
      transition: opacity .15s;
    }
    .contact-btn:hover { opacity: .88; }
    .contact-btn.secondary {
      background: transparent;
      border: 1px solid #2a2a2a;
      color: #888;
    }
    .contact-btn.secondary:hover { border-color: #444; color: #fff; }

    /* ── Divider ── */
    hr { border: none; border-top: 1px solid #111; margin: 48px 0; }

    /* ── Footer ── */
    .page-footer {
      text-align: center;
      border-top: 1px solid #111;
      padding: 28px 24px;
      font-size: 12px;
      color: #333;
    }
    .page-footer a { color: #555; text-decoration: none; margin: 0 10px; }
    .page-footer a:hover { color: #888; }

    @media (max-width: 640px) {
      .stats-bar    { grid-template-columns: 1fr 1fr; }
      .two-col      { grid-template-columns: 1fr; }
      .values-grid  { grid-template-columns: 1fr; }
      .hero h1      { font-size: 26px; }
    }
  </style>
</head>
<body>
<a class="trace-skip-link" href="#main-content">Skip to content</a>
<div class="trace-disclosure" role="note"></div>

<!-- Nav -->
<nav class="nav">
  <a href="/" class="nav-logo">
    <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
      <path d="M50 5 L95 27V73L50 95L5 73V27L50 5Z" fill="#e31937"/>
      <path d="M35 38H65V44H54V68H46V44H35V38Z" fill="#fff"/>
    </svg>
    Tesla Trade Inc
  </a>
  <a href="javascript:history.back()" class="nav-back">← Back</a>
</nav>

<!-- Hero -->
<div class="hero">
  <div class="hero-badge">Company</div>
  <h1>We are <span>Tesla Trade Inc</span></h1>
  <p>A premier investment platform built on transparency, security, and consistent performance. Empowering investors worldwide to grow wealth through intelligent, technology-driven strategies.</p>
</div>

<div class="wrapper" id="main-content">

  <!-- Stats -->
  <div class="stats-bar">
    <div class="stat-card">
      <div class="stat-num">$<span>2.4</span>B+</div>
      <div class="stat-label">Assets Managed</div>
    </div>
    <div class="stat-card">
      <div class="stat-num"><span>85</span>K+</div>
      <div class="stat-label">Registered Investors</div>
    </div>
    <div class="stat-card">
      <div class="stat-num"><span>140</span>+</div>
      <div class="stat-label">Countries Served</div>
    </div>
    <div class="stat-card">
      <div class="stat-num"><span>99.8</span>%</div>
      <div class="stat-label">Platform Uptime</div>
    </div>
  </div>

  <!-- Mission -->
  <div class="section">
    <div class="section-label">Our Mission</div>
    <h2>Democratizing wealth creation, one investor at a time</h2>

    <div class="mission-block">
      <blockquote>
        To provide every investor — regardless of background or geography — with access to world-class investment opportunities that were once reserved only for institutions and the ultra-wealthy.
      </blockquote>
      <div class="mission-attr">— Tesla Trade Inc, Founding Charter</div>
    </div>

    <p>Founded with the belief that financial freedom should be accessible to all, Tesla Trade Inc was established as a bridge between retail investors and high-performance investment vehicles. We leverage cutting-edge technology, deep market expertise, and a commitment to transparency to deliver consistent, sustainable returns to our growing community of global investors.</p>

    <p>Every decision we make — from the investment programs we offer to the technology we build — is guided by a singular purpose: to help our investors build real, lasting wealth.</p>
  </div>

  <hr />

  <!-- What We Do -->
  <div class="section">
    <div class="section-label">What We Do</div>
    <h2>Managed investing, engineered for results</h2>
    <p>Tesla Trade Inc combines quantitative analysis, algorithmic strategies, and expert portfolio management to deliver diversified investment programs across crypto assets and financial markets. Our proprietary systems monitor markets around the clock, executing strategies designed to maximize returns while managing downside risk.</p>

    <div class="two-col">
      <div class="feature-card">
        <div class="feature-icon">⚡</div>
        <div class="feature-title">Tesla-Linked Portfolio</div>
        <div class="feature-desc">Exposure to Tesla's ecosystem — equity, technology ventures, and clean energy initiatives — combined with dynamic rebalancing strategies.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🪙</div>
        <div class="feature-title">Cryptocurrency Programs</div>
        <div class="feature-desc">Bitcoin, Ethereum, USDT, and blue-chip altcoin investment plans managed by our dedicated crypto desk with deep liquidity access.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">📊</div>
        <div class="feature-title">Algorithmic Trading</div>
        <div class="feature-desc">Systematic, data-driven trading strategies powered by our proprietary algorithms — executing thousands of trades with precision and discipline.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🌐</div>
        <div class="feature-title">Global Market Access</div>
        <div class="feature-desc">Our investors gain exposure to opportunities across North America, Europe, Asia, and emerging markets, all from a single platform.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🤝</div>
        <div class="feature-title">Referral Ecosystem</div>
        <div class="feature-desc">Our community grows when our investors grow. Earn 20% commission on every deposit made by investors you introduce to the platform.</div>
      </div>
      <div class="feature-card">
        <div class="feature-icon">🔒</div>
        <div class="feature-title">Cold-Storage Security</div>
        <div class="feature-desc">The majority of crypto assets are held in multi-signature cold storage, protected by institutional-grade custodial practices.</div>
      </div>
    </div>
  </div>

  <hr />

  <!-- Our Values -->
  <div class="section">
    <div class="section-label">Our Values</div>
    <h2>The principles that guide everything we do</h2>

    <div class="values-grid">
      <div class="value-card">
        <div class="value-icon">🔍</div>
        <div class="value-title">Transparency</div>
        <div class="value-desc">We provide clear, honest reporting on platform performance, fees, and risk factors — no hidden agendas, no misleading claims.</div>
      </div>
      <div class="value-card">
        <div class="value-icon">🛡️</div>
        <div class="value-title">Security First</div>
        <div class="value-desc">Investor funds and data are protected by industry-leading security infrastructure, including multi-factor authentication and encrypted storage.</div>
      </div>
      <div class="value-card">
        <div class="value-icon">🌱</div>
        <div class="value-title">Long-Term Thinking</div>
        <div class="value-desc">We build for the long term — sustainable strategies, responsible growth, and decisions that protect investor capital over the years.</div>
      </div>
      <div class="value-card">
        <div class="value-icon">🤝</div>
        <div class="value-title">Investor-Centric</div>
        <div class="value-desc">Every feature, policy, and process is designed with the investor's best interest as the primary consideration.</div>
      </div>
      <div class="value-card">
        <div class="value-icon">⚡</div>
        <div class="value-title">Innovation</div>
        <div class="value-desc">We continuously invest in technology and research to stay ahead of market trends and deliver better outcomes for our community.</div>
      </div>
      <div class="value-card">
        <div class="value-icon">🌍</div>
        <div class="value-title">Global Inclusion</div>
        <div class="value-desc">We believe in equal access to financial opportunity, serving investors from over 140 countries with no geographic discrimination.</div>
      </div>
    </div>
  </div>

  <hr />

  <!-- Security -->
  <div class="section">
    <div class="section-label">Security &amp; Trust</div>
    <h2>Your funds. Your data. Protected at every layer.</h2>
    <p>Security is not an afterthought at Tesla Trade Inc — it is the foundation on which our entire platform is built. We employ multiple layers of protection to ensure your assets and personal information remain safe at all times.</p>
    <ul>
      <li><strong>Multi-Signature Cold Storage:</strong> Crypto assets are held in air-gapped, multi-signature cold wallets. Private keys are never stored on internet-connected systems.</li>
      <li><strong>256-bit TLS Encryption:</strong> All data transmitted between your device and our servers is encrypted using industry-standard TLS protocols.</li>
      <li><strong>Multi-Factor Authentication (MFA):</strong> Account access requires email OTP verification, adding a critical second layer of protection.</li>
      <li><strong>Real-Time Fraud Monitoring:</strong> Our systems continuously monitor for suspicious activity, flagging and freezing accounts at the first sign of compromise.</li>
      <li><strong>KYC / AML Compliance:</strong> All investors undergo identity verification to prevent money laundering and protect the integrity of the platform.</li>
      <li><strong>Regular Security Audits:</strong> Our infrastructure undergoes periodic penetration testing and security audits by independent third-party firms.</li>
      <li><strong>GDPR-Aligned Data Practices:</strong> We handle all personal data in accordance with international privacy standards.</li>
    </ul>
  </div>

  <hr />

  <!-- Why Tesla Trade Inc -->
  <div class="section">
    <div class="section-label">Why Choose Us</div>
    <h2>What sets Tesla Trade Inc apart</h2>
    <p>There are thousands of investment platforms competing for your attention. Here is why our investors choose — and stay with — Tesla Trade Inc:</p>
    <ul>
      <li><strong>Proven Track Record:</strong> Years of consistent performance across diverse market conditions, with documented results available to all registered investors.</li>
      <li><strong>Professional Management:</strong> A seasoned team of financial analysts, algorithmic traders, and blockchain specialists manage your portfolio.</li>
      <li><strong>Flexible Investment Plans:</strong> Multiple tiers designed to suit every investor — from those just starting out to high-net-worth individuals seeking institutional-grade access.</li>
      <li><strong>24/7 Investor Support:</strong> Our dedicated support team is available around the clock via live chat, email, and phone to assist with any questions or concerns.</li>
      <li><strong>Rapid Withdrawals:</strong> Withdrawal requests are processed within 1–5 business days, with no unnecessary holding periods for verified accounts.</li>
      <li><strong>Referral Program:</strong> Our industry-leading 20% referral commission rewards investors who help grow the Tesla Trade Inc community.</li>
    </ul>
  </div>

  <hr />

  <!-- Contact -->
  <div class="contact-block">
    <h3>Get in Touch</h3>
    <p>Have questions about our platform, investment plans, or partnership opportunities? Our team is here to help — 24 hours a day, 7 days a week.</p>
    <a href="mailto:support@teslatradeinc.com" class="contact-btn">📧 Email Support</a>
    <a href="/faq.php" class="contact-btn secondary">❓ Read FAQ</a>
  </div>

</div><!-- /wrapper -->

<footer class="page-footer">
  <div style="margin-bottom:12px;">
    <a href="/faq.php">FAQ</a>
    <a href="/terms.php">Terms &amp; Conditions</a>
    <a href="/about.php">About Us</a>
  </div>
  &copy; <?= $year ?> Tesla Trade Inc. All rights reserved.
</footer>

</body>
</html>

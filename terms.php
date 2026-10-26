<?php
/**
 * Tesla Trade Inc — Terms and Conditions
 */
$year = date('Y');
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Terms &amp; Conditions — Tesla Trade Inc</title>
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
      padding: 56px 24px 44px;
      text-align: center;
    }
    .hero-badge {
      display: inline-block;
      background: #1a0005; color: #e31937; border: 1px solid #e3193733;
      border-radius: 30px; padding: 5px 18px;
      font-size: 11px; font-weight: 800; letter-spacing: 1px;
      text-transform: uppercase; margin-bottom: 20px;
    }
    .hero h1 { font-size: 32px; font-weight: 800; color: #fff; margin-bottom: 12px; }
    .hero p  { font-size: 14px; color: #555; max-width: 560px; margin: 0 auto; }

    /* ── Layout ── */
    .wrapper {
      max-width: 820px;
      margin: 0 auto;
      padding: 40px 24px 80px;
    }

    /* ── Effective date ── */
    .effective {
      background: #0d0d0d;
      border: 1px solid #1a1a1a;
      border-radius: 12px;
      padding: 14px 18px;
      font-size: 13px;
      color: #555;
      margin-bottom: 36px;
      display: flex; align-items: center; gap: 10px;
    }
    .effective strong { color: #888; }

    /* ── Sections ── */
    .section {
      margin-bottom: 40px;
    }
    .section-num {
      display: inline-block;
      background: #e31937;
      color: #fff;
      font-size: 11px;
      font-weight: 800;
      border-radius: 6px;
      padding: 2px 9px;
      margin-bottom: 10px;
      letter-spacing: .5px;
    }
    .section h2 {
      font-size: 20px;
      font-weight: 800;
      color: #fff;
      margin-bottom: 14px;
    }
    .section p {
      color: #888;
      margin-bottom: 12px;
      font-size: 14px;
    }
    .section ul, .section ol {
      padding-left: 22px;
      margin-bottom: 12px;
      color: #888;
      font-size: 14px;
    }
    .section li { margin-bottom: 8px; }

    /* ── Highlight box ── */
    .highlight {
      background: #0d0d0d;
      border-left: 3px solid #e31937;
      border-radius: 0 10px 10px 0;
      padding: 14px 18px;
      margin: 14px 0;
      font-size: 13px;
      color: #777;
      line-height: 1.7;
    }
    .highlight strong { color: #ccc; }

    /* ── Warning box ── */
    .warn-box {
      background: #1a0005;
      border: 1px solid #e3193733;
      border-radius: 12px;
      padding: 16px 18px;
      font-size: 13px;
      color: #e89090;
      margin: 18px 0;
      line-height: 1.7;
    }
    .warn-box strong { color: #e31937; }

    /* ── Divider ── */
    hr { border: none; border-top: 1px solid #111; margin: 36px 0; }

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
  <div class="hero-badge">Legal</div>
  <h1>Terms &amp; Conditions</h1>
  <p>Please read these terms carefully before using our platform. By accessing Tesla Trade Inc, you agree to be bound by these terms.</p>
</div>

<div class="wrapper" id="main-content">

  <div class="effective">
    <span>📅</span>
    <span><strong>Effective Date:</strong> January 1, 2024 &nbsp;|&nbsp; <strong>Last Updated:</strong> <?= $year ?></span>
  </div>

  <div class="warn-box">
    ⚠️ <strong>Important Notice:</strong> Tesla Trade Inc offers investment services that carry inherent financial risks. You may lose part or all of your invested capital. Participation is entirely voluntary and at your own risk. Past performance does not guarantee future results.
  </div>

  <!-- 1 -->
  <div class="section">
    <div class="section-num">01</div>
    <h2>Acceptance of Terms</h2>
    <p>By accessing or using the Tesla Trade Inc platform (the "Platform"), creating an account, or making any investment, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions ("Terms"), our Privacy Policy, and all applicable laws and regulations.</p>
    <p>If you do not agree with any part of these Terms, you must immediately cease using the Platform. These Terms constitute a legally binding agreement between you ("User," "Investor," "you") and Tesla Trade Inc ("Company," "we," "us," "our").</p>
    <div class="highlight">
      <strong>Your continued use of the Platform after any modification to these Terms constitutes your acceptance of the updated Terms.</strong> We recommend reviewing these Terms periodically.
    </div>
  </div>

  <hr />

  <!-- 2 -->
  <div class="section">
    <div class="section-num">02</div>
    <h2>Description of Services</h2>
    <p>Tesla Trade Inc provides an online investment platform that enables registered investors to participate in managed investment programs. Our services include, but are not limited to:</p>
    <ul>
      <li>Managed investment portfolios with tiered return structures</li>
      <li>Cryptocurrency investment programs (Bitcoin, Ethereum, USDT, and others)</li>
      <li>Portfolio tracking and real-time performance dashboards</li>
      <li>Secure deposit and withdrawal processing</li>
      <li>Referral commission programs</li>
      <li>24/7 investor support via live chat</li>
      <li>KYC (Know Your Customer) identity verification services</li>
    </ul>
    <p>We reserve the right to modify, suspend, or discontinue any service at any time with or without prior notice. The Company shall not be liable for any losses arising from such modifications.</p>
  </div>

  <hr />

  <!-- 3 -->
  <div class="section">
    <div class="section-num">03</div>
    <h2>Eligibility Requirements</h2>
    <p>To use the Platform, you must meet all of the following eligibility criteria:</p>
    <ul>
      <li>Be at least <strong>18 years of age</strong> (or the age of legal majority in your jurisdiction, whichever is higher)</li>
      <li>Have the full legal capacity to enter into binding contracts</li>
      <li>Not be a resident of any jurisdiction where such services are prohibited, restricted, or require licensing not held by the Company</li>
      <li>Not be subject to any sanctions imposed by the United Nations, European Union, U.S. Office of Foreign Assets Control (OFAC), or any other applicable government authority</li>
      <li>Provide accurate, complete, and up-to-date personal information during registration and KYC verification</li>
    </ul>
    <p>By registering on the Platform, you represent and warrant that you meet all of the above requirements. The Company reserves the right to terminate any account that fails to meet eligibility criteria at any time.</p>
  </div>

  <hr />

  <!-- 4 -->
  <div class="section">
    <div class="section-num">04</div>
    <h2>Account Registration &amp; Security</h2>
    <p>To access investment features, you must create a registered account. During registration, you agree to:</p>
    <ul>
      <li>Provide truthful, accurate, and complete information</li>
      <li>Keep your account credentials strictly confidential</li>
      <li>Immediately notify us at <strong>support@teslatradeinc.com</strong> of any suspected unauthorized access to your account</li>
      <li>Not share your login details with any third party</li>
      <li>Not create multiple accounts for the same individual</li>
      <li>Complete the KYC verification process when requested</li>
    </ul>
    <div class="highlight">
      <strong>You are solely responsible for all activities that occur under your account.</strong> The Company cannot and will not be liable for any loss or damage arising from your failure to protect your account credentials.
    </div>
    <p>We reserve the right to suspend or permanently terminate accounts that show signs of fraud, abuse, identity misrepresentation, or violation of these Terms.</p>
  </div>

  <hr />

  <!-- 5 -->
  <div class="section">
    <div class="section-num">05</div>
    <h2>Investment Risks &amp; Disclosures</h2>
    <div class="warn-box">
      ⚠️ <strong>HIGH RISK DISCLOSURE:</strong> All investments carry risk. Cryptocurrency investments are particularly volatile and speculative. The value of digital assets can fluctuate dramatically within short periods. You should only invest funds that you can afford to lose entirely.
    </div>
    <p>By participating in our investment programs, you expressly acknowledge and accept the following risks:</p>
    <ul>
      <li><strong>Market Volatility:</strong> Cryptocurrency and financial markets can experience extreme and rapid price swings. Investment values may decrease significantly.</li>
      <li><strong>Liquidity Risk:</strong> There is no guarantee that you will be able to withdraw your funds at any given time. Withdrawal processing may be delayed during high-traffic periods.</li>
      <li><strong>Technology Risk:</strong> Blockchain networks, software bugs, hacking, or other technical failures could result in loss of funds.</li>
      <li><strong>Regulatory Risk:</strong> Changes in laws or regulations governing cryptocurrencies or investments in your jurisdiction could adversely affect the value of your investments or our ability to operate.</li>
      <li><strong>No Guaranteed Returns:</strong> Projected returns and past performance figures shown on the Platform are estimates only and are not guarantees of future performance.</li>
      <li><strong>Operational Risk:</strong> The Company may experience system outages, errors, or other operational issues that temporarily impair access to the Platform.</li>
    </ul>
    <p>We strongly recommend consulting an independent, licensed financial advisor before making any investment decisions.</p>
  </div>

  <hr />

  <!-- 6 -->
  <div class="section">
    <div class="section-num">06</div>
    <h2>Deposits &amp; Withdrawals</h2>
    <p><strong>Deposits:</strong> All deposits made to the Platform are subject to the following conditions:</p>
    <ul>
      <li>Minimum deposit amounts apply per investment plan (refer to your investment plan details).</li>
      <li>Deposits must be made using the approved payment methods listed in your dashboard (cryptocurrency wallets, bank transfer, or accepted digital payment platforms).</li>
      <li>Funds will be credited to your account only after the required number of blockchain confirmations or payment verifications.</li>
      <li>Deposits are non-refundable once an investment plan has been activated.</li>
    </ul>
    <p><strong>Withdrawals:</strong> The following terms govern all withdrawal requests:</p>
    <ul>
      <li>Withdrawal requests are processed within <strong>1–5 business days</strong> under standard conditions, subject to KYC verification.</li>
      <li>You must complete KYC verification before making any withdrawal request.</li>
      <li>Minimum withdrawal amounts apply and may vary by payment method.</li>
      <li>The Company reserves the right to delay withdrawals for security review, compliance checks, or extraordinary market conditions.</li>
      <li>The Company is not responsible for any fees charged by third-party payment processors, banks, or blockchain networks during the transfer process.</li>
    </ul>
  </div>

  <hr />

  <!-- 7 -->
  <div class="section">
    <div class="section-num">07</div>
    <h2>Fees &amp; Charges</h2>
    <p>The Company may charge the following fees in connection with our services:</p>
    <ul>
      <li><strong>Management Fees:</strong> A performance or management fee may be deducted from investment returns as specified in your chosen investment plan.</li>
      <li><strong>Withdrawal Fees:</strong> A processing fee may apply to withdrawals depending on the payment method and amount. The applicable fee will be disclosed prior to processing.</li>
      <li><strong>Network Fees:</strong> Blockchain transaction fees (gas fees) are not charged by the Company but may be deducted by the underlying network.</li>
    </ul>
    <p>We reserve the right to update our fee structure at any time. Updated fees will be communicated via email or platform notification at least 7 days before becoming effective.</p>
  </div>

  <hr />

  <!-- 8 -->
  <div class="section">
    <div class="section-num">08</div>
    <h2>Referral Program</h2>
    <p>Tesla Trade Inc operates a referral commission program under the following terms:</p>
    <ul>
      <li>Registered investors may earn a commission (currently <strong>20%</strong>) on the initial deposits made by investors they refer to the Platform.</li>
      <li>Referral commissions are credited to your account only after the referred investor's deposit has been verified and confirmed.</li>
      <li>Referral bonuses cannot be earned through self-referral, fraudulent sign-ups, or any form of manipulation.</li>
      <li>The Company reserves the right to withhold or claw back referral commissions found to be based on fraudulent activity.</li>
      <li>Referral commission rates may be modified at any time with reasonable notice.</li>
    </ul>
  </div>

  <hr />

  <!-- 9 -->
  <div class="section">
    <div class="section-num">09</div>
    <h2>KYC / AML Compliance</h2>
    <p>Tesla Trade Inc is committed to complying with applicable Anti-Money Laundering (AML) and Know Your Customer (KYC) regulations. As a condition of using withdrawal and certain investment services, you may be required to:</p>
    <ul>
      <li>Submit a valid government-issued photo identification (passport, national ID, or driver's license)</li>
      <li>Provide proof of residential address (utility bill, bank statement dated within the last 3 months)</li>
      <li>Complete additional due diligence checks as required by applicable law</li>
    </ul>
    <p>Failure to complete KYC verification within the requested timeframe may result in the suspension of withdrawals or account termination. All personal data collected during KYC is handled in accordance with our Privacy Policy.</p>
  </div>

  <hr />

  <!-- 10 -->
  <div class="section">
    <div class="section-num">10</div>
    <h2>Prohibited Activities</h2>
    <p>You agree not to engage in any of the following prohibited activities:</p>
    <ul>
      <li>Using the Platform for any unlawful, fraudulent, or malicious purpose</li>
      <li>Money laundering, terrorist financing, or any other financial crime</li>
      <li>Creating fake accounts, impersonating other individuals, or providing false information</li>
      <li>Attempting to gain unauthorized access to any part of the Platform or its infrastructure</li>
      <li>Distributing malware, viruses, or other harmful code through the Platform</li>
      <li>Reverse engineering, decompiling, or otherwise attempting to extract the source code of the Platform</li>
      <li>Using automated bots, scrapers, or scripts to interact with the Platform without prior written authorization</li>
      <li>Manipulating markets or engaging in wash trading or coordinated price manipulation</li>
      <li>Harassing, threatening, or intimidating other users or Company staff</li>
    </ul>
    <p>Violations of these prohibitions may result in immediate account termination, forfeiture of funds, and referral to law enforcement authorities.</p>
  </div>

  <hr />

  <!-- 11 -->
  <div class="section">
    <div class="section-num">11</div>
    <h2>Intellectual Property</h2>
    <p>All content on the Platform — including but not limited to logos, graphics, text, software, design elements, data, and trademarks — is the exclusive intellectual property of Tesla Trade Inc or its licensors. You are granted a limited, non-exclusive, non-transferable, revocable license to access and use the Platform for its intended purpose.</p>
    <p>You may not reproduce, distribute, modify, create derivative works of, publicly display, or commercially exploit any Platform content without express prior written consent from the Company.</p>
  </div>

  <hr />

  <!-- 12 -->
  <div class="section">
    <div class="section-num">12</div>
    <h2>Privacy Policy</h2>
    <p>Your use of the Platform is also governed by our Privacy Policy, which is incorporated into these Terms by reference. Our Privacy Policy describes how we collect, use, store, and share your personal information.</p>
    <p>We implement industry-standard security measures to protect your data, including encryption in transit and at rest, access controls, and regular security audits. However, no system is entirely immune to breaches, and you acknowledge this inherent risk.</p>
    <p>We do not sell your personal data to third parties. We may share anonymized, aggregated data for analytical purposes.</p>
  </div>

  <hr />

  <!-- 13 -->
  <div class="section">
    <div class="section-num">13</div>
    <h2>Disclaimers &amp; Limitation of Liability</h2>
    <p>THE PLATFORM IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.</p>
    <p>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, TESLA TRADE INC AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR:</p>
    <ul>
      <li>Any loss of profits, revenue, data, business, or investment capital</li>
      <li>Any indirect, incidental, special, consequential, or punitive damages</li>
      <li>Any damages arising from unauthorized access to or use of our servers or data</li>
      <li>Any interruption, suspension, or termination of the Platform</li>
      <li>Any errors, inaccuracies, or omissions in the content provided</li>
    </ul>
    <div class="highlight">
      <strong>In no event shall our aggregate liability exceed the total amount deposited by you in the 12 months immediately preceding the event giving rise to the claim.</strong>
    </div>
  </div>

  <hr />

  <!-- 14 -->
  <div class="section">
    <div class="section-num">14</div>
    <h2>Indemnification</h2>
    <p>You agree to indemnify, defend, and hold harmless Tesla Trade Inc and its affiliates, officers, directors, employees, agents, and licensors from and against any claims, liabilities, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or in connection with:</p>
    <ul>
      <li>Your use of or access to the Platform</li>
      <li>Your violation of these Terms or any applicable law</li>
      <li>Your violation of any third-party rights</li>
      <li>Any investment decisions made based on information provided through the Platform</li>
    </ul>
  </div>

  <hr />

  <!-- 15 -->
  <div class="section">
    <div class="section-num">15</div>
    <h2>Dispute Resolution</h2>
    <p>In the event of any dispute, controversy, or claim arising from or relating to these Terms or the Platform, you agree to first attempt to resolve the matter informally by contacting our support team at <strong>support@teslatradeinc.com</strong>. We will make good-faith efforts to resolve disputes within 30 days of receiving written notice.</p>
    <p>If informal resolution fails, disputes shall be submitted to binding arbitration in accordance with the rules of a mutually agreed arbitration body. The arbitration shall be conducted in the English language, and the arbitral award shall be final and binding on both parties.</p>
    <p>Notwithstanding the foregoing, either party may seek injunctive or other equitable relief from a court of competent jurisdiction to prevent irreparable harm.</p>
  </div>

  <hr />

  <!-- 16 -->
  <div class="section">
    <div class="section-num">16</div>
    <h2>Governing Law</h2>
    <p>These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles. You agree to submit to the personal jurisdiction of the courts in the jurisdiction in which the Company is registered for any matters not subject to arbitration.</p>
  </div>

  <hr />

  <!-- 17 -->
  <div class="section">
    <div class="section-num">17</div>
    <h2>Modifications to Terms</h2>
    <p>Tesla Trade Inc reserves the right to modify these Terms at any time. When changes are made, we will:</p>
    <ul>
      <li>Update the "Last Updated" date at the top of this page</li>
      <li>Send a notification email to your registered email address for material changes</li>
      <li>Display a banner notification on the Platform for a reasonable period</li>
    </ul>
    <p>Your continued use of the Platform following the posting of revised Terms constitutes your acceptance of such changes. If you do not agree with the updated Terms, you must stop using the Platform and request account closure.</p>
  </div>

  <hr />

  <!-- 18 -->
  <div class="section">
    <div class="section-num">18</div>
    <h2>Termination</h2>
    <p>We reserve the right to suspend or terminate your account and access to the Platform at our sole discretion, without prior notice, for any reason including but not limited to:</p>
    <ul>
      <li>Violation of these Terms or our policies</li>
      <li>Suspected fraudulent or illegal activity</li>
      <li>Failure to complete KYC verification when required</li>
      <li>Extended inactivity (accounts inactive for more than 12 months)</li>
      <li>Regulatory requirements that prevent us from servicing your account</li>
    </ul>
    <p>Upon termination for cause, any pending withdrawals may be held pending investigation. Sections on Risk Disclosures, Limitation of Liability, Indemnification, and Dispute Resolution shall survive termination of these Terms.</p>
  </div>

  <hr />

  <!-- 19 -->
  <div class="section">
    <div class="section-num">19</div>
    <h2>Contact Information</h2>
    <p>If you have any questions, concerns, or complaints regarding these Terms and Conditions, please contact us through the following channels:</p>
    <ul>
      <li>📧 <strong>Email:</strong> support@teslatradeinc.com</li>
      <li>💬 <strong>Live Chat:</strong> Available 24/7 through your investor dashboard</li>
      <li>📋 <strong>Compliance:</strong> legal@teslatradeinc.com</li>
    </ul>
    <p>Our team aims to respond to all inquiries within <strong>1–3 business days</strong>.</p>
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

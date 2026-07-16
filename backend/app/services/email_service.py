
import os
import smtplib
import random
import string
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timedelta

# ── Config from environment ───────────────────────────────────────────────────
GMAIL_ADDRESS  = os.getenv("GMAIL_ADDRESS", "")
GMAIL_APP_PASS = os.getenv("GMAIL_APP_PASSWORD", "")
OTP_EXPIRY_MIN = 60


# ── Generate OTP ──────────────────────────────────────────────────────────────
def generate_otp(length: int = 6) -> str:
    return ''.join(random.choices(string.digits, k=length))


# ── HTML Email Template ───────────────────────────────────────────────────────
def _build_email_html(borrower_name: str, otp: str, loan_amount: str, nbfc_name: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    body {{ font-family: 'DM Sans', Arial, sans-serif; background:#f1f5f9; padding:32px 16px; }}
    .wrapper {{ max-width:520px; margin:0 auto; }}

    .header {{
      background:#0F6E56; border-radius:12px 12px 0 0;
      padding:28px 32px; text-align:center;
    }}
    .header-logo {{
      display:inline-flex; align-items:center; gap:10px;
      color:white; font-size:20px; font-weight:700; margin-bottom:4px;
    }}
    .header-sub {{ color:#9fe1cb; font-size:13px; }}

    .body {{
      background:white; padding:32px;
      border-left:1px solid #e2e8f0;
      border-right:1px solid #e2e8f0;
    }}
    .greeting {{ font-size:16px; font-weight:600; color:#0f172a; margin-bottom:8px; }}
    .desc {{ font-size:13.5px; color:#475569; line-height:1.7; margin-bottom:24px; }}

    .otp-box {{
      background:#f0fdf9; border:2px dashed #9fe1cb;
      border-radius:12px; padding:24px; text-align:center; margin-bottom:24px;
    }}
    .otp-label {{ font-size:11px; font-weight:600; color:#0F6E56; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:10px; }}
    .otp-code {{
      font-size:40px; font-weight:700; letter-spacing:12px;
      color:#0F6E56; font-family:'Courier New', monospace;
    }}
    .otp-expiry {{ font-size:12px; color:#64748b; margin-top:8px; }}

    .loan-box {{
      background:#f8fafc; border:1px solid #e2e8f0;
      border-radius:8px; padding:16px; margin-bottom:24px;
    }}
    .loan-box-title {{ font-size:11px; font-weight:600; color:#64748b; text-transform:uppercase; letter-spacing:0.06em; margin-bottom:10px; }}
    .loan-row {{ display:flex; justify-content:space-between; padding:5px 0; font-size:13px; border-bottom:1px solid #f1f5f9; }}
    .loan-row:last-child {{ border-bottom:none; }}
    .loan-row-label {{ color:#64748b; }}
    .loan-row-val {{ font-weight:600; color:#0f172a; }}

    .warning {{
      background:#fffbeb; border:1px solid #fde68a;
      border-radius:8px; padding:12px 14px;
      font-size:12.5px; color:#92400e; margin-bottom:24px;
      display:flex; gap:8px; align-items:flex-start;
    }}

    .footer {{
      background:#f8fafc; border:1px solid #e2e8f0;
      border-top:none; border-radius:0 0 12px 12px;
      padding:16px 32px; text-align:center;
      font-size:11.5px; color:#94a3b8; line-height:1.6;
    }}
  </style>
</head>
<body>
<div class="wrapper">

  <div class="header">
    <div class="header-logo">🏦 LendOS</div>
    <div class="header-sub">Loan Agreement Signing</div>
  </div>

  <div class="body">
    <div class="greeting">Hi {borrower_name},</div>
    <div class="desc">
      Your loan agreement with <strong>{nbfc_name}</strong> is ready for signing.
      Please use the OTP below to digitally sign your agreement.
      This constitutes a legally valid e-signature under the
      <strong>Information Technology Act, 2000</strong>.
    </div>

    <div class="otp-box">
      <div class="otp-label">Your Signing OTP</div>
      <div class="otp-code">{otp}</div>
      <div class="otp-expiry">Valid for {OTP_EXPIRY_MIN} minutes only</div>
    </div>

    <div class="loan-box">
      <div class="loan-box-title">Loan Details</div>
      <div class="loan-row">
        <span class="loan-row-label">Lender</span>
        <span class="loan-row-val">{nbfc_name}</span>
      </div>
      <div class="loan-row">
        <span class="loan-row-label">Loan Amount</span>
        <span class="loan-row-val">{loan_amount}</span>
      </div>
    </div>

    <div class="warning">
      ⚠️ <span>Do <strong>not</strong> share this OTP with anyone.
      LendOS will never ask for your OTP over phone or chat.
      If you did not request this, please ignore this email.</span>
    </div>
  </div>

  <div class="footer">
    This email was sent by LendOS Platform.<br/>
    © {datetime.now().year} LendOS. All rights reserved.
  </div>

</div>
</body>
</html>
"""


# ── Send OTP Email ────────────────────────────────────────────────────────────
def send_otp_email(
    to_email:      str,
    borrower_name: str,
    otp:           str,
    loan_amount:   str,
    nbfc_name:     str,
) -> bool:
    """
    Sends OTP email via Gmail SMTP.
    Returns True on success, raises Exception on failure.

    Setup:
    1. Go to myaccount.google.com → Security → 2-Step Verification → App Passwords
    2. Generate password for "Mail"
    3. Set in .env:
       GMAIL_ADDRESS=your@gmail.com
       GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
    """
    if not GMAIL_ADDRESS or not GMAIL_APP_PASS:
        raise RuntimeError(
            "Email not configured. Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD in .env"
        )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"🔐 Your LendOS Loan Signing OTP: {otp}"
    msg["From"] = f"{nbfc_name} via LendOS <{GMAIL_ADDRESS}>"
    msg["To"]      = to_email

    # Plain text fallback
    text_part = MIMEText(
        f"Hi {borrower_name},\n\n"
        f"Your LendOS loan signing OTP is: {otp}\n"
        f"Valid for {OTP_EXPIRY_MIN} minutes.\n\n"
        f"Lender: {nbfc_name}\n"
        f"Loan Amount: {loan_amount}\n\n"
        f"Do NOT share this OTP with anyone.\n\n"
        f"— LendOS Platform",
        "plain"
    )

    # HTML part
    html_part = MIMEText(
        _build_email_html(borrower_name, otp, loan_amount, nbfc_name),
        "html"
    )

    msg.attach(text_part)
    msg.attach(html_part)

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASS)
        smtp.sendmail(GMAIL_ADDRESS, to_email, msg.as_string())

    return True


def send_disbursement_email_to_nbfc(
    to_email:        str,
    nbfc_name:       str,
    borrower_name:   str,
    borrower_mobile: str,
    loan_id:         int,
    loan_amount:     float,
    bank_name:       str,
    account_number:  str,
    ifsc_code:       str,
    emi_amount:      float,
    tenure_months:   int,
) -> bool:
    if not GMAIL_ADDRESS or not GMAIL_APP_PASS:
        print(f"[DEV] Disbursement email to {to_email} — Loan #{loan_id} — ₹{int(loan_amount):,}")
        return True

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>
  body {{ font-family: Arial, sans-serif; background:#f1f5f9; padding:32px 16px; }}
  .wrapper {{ max-width:520px; margin:0 auto; }}
  .header {{ background:#0F6E56; border-radius:12px 12px 0 0; padding:24px 32px; text-align:center; }}
  .header-logo {{ color:white; font-size:20px; font-weight:700; }}
  .header-sub {{ color:#9fe1cb; font-size:13px; margin-top:4px; }}
  .body {{ background:white; padding:28px 32px; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0; }}
  .title {{ font-size:17px; font-weight:700; color:#0f172a; margin-bottom:6px; }}
  .sub {{ font-size:13px; color:#475569; margin-bottom:20px; line-height:1.6; }}
  .info-box {{ background:#f0fdf9; border:1px solid #9fe1cb; border-radius:10px; padding:18px 20px; margin-bottom:18px; }}
  .info-row {{ display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e2e8f0; font-size:13px; }}
  .info-row:last-child {{ border-bottom:none; }}
  .info-label {{ color:#64748b; }}
  .info-val {{ font-weight:600; color:#0f172a; }}
  .alert-box {{ background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:14px 16px; font-size:13px; color:#92400e; margin-bottom:18px; }}
  .footer {{ background:#f8fafc; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px; padding:14px 32px; text-align:center; font-size:11.5px; color:#94a3b8; }}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="header-logo">🏦 LendOS</div>
    <div class="header-sub">Disbursement Request</div>
  </div>
  <div class="body">
    <div class="title">Action Required — Loan Disbursement</div>
    <div class="sub">
      A borrower has signed their loan agreement on LendOS. Please transfer
      the loan amount to the borrower's bank account and mark it as disbursed
      in your dashboard.
    </div>

    <div class="info-box">
      <div class="info-row"><span class="info-label">Loan ID</span><span class="info-val">#LA-{loan_id:04d}</span></div>
      <div class="info-row"><span class="info-label">Borrower Name</span><span class="info-val">{borrower_name}</span></div>
      <div class="info-row"><span class="info-label">Borrower Mobile</span><span class="info-val">{borrower_mobile}</span></div>
      <div class="info-row"><span class="info-label">Amount to Transfer</span><span class="info-val">₹{int(loan_amount):,}</span></div>
      <div class="info-row"><span class="info-label">Bank Name</span><span class="info-val">{bank_name}</span></div>
      <div class="info-row"><span class="info-label">Account Number</span><span class="info-val">{account_number}</span></div>
      <div class="info-row"><span class="info-label">IFSC Code</span><span class="info-val">{ifsc_code}</span></div>
      <div class="info-row"><span class="info-label">Monthly EMI</span><span class="info-val">₹{int(emi_amount):,}</span></div>
      <div class="info-row"><span class="info-label">Tenure</span><span class="info-val">{tenure_months} months</span></div>
    </div>

    <div class="alert-box">
      ⚠️ After transferring the amount, please log in to your LendOS dashboard,
      open this loan application and click <strong>"Mark as Disbursed"</strong>
      and enter the UTR number to complete the process.
    </div>
  </div>
  <div class="footer">
    LendOS Platform · This is an automated notification.<br/>
    © {datetime.now().year} LendOS. All rights reserved.
  </div>
</div>
</body>
</html>
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"🏦 Action Required — Disburse Loan #LA-{loan_id:04d} to {borrower_name}"
    msg["From"] = f"{nbfc_name} via LendOS <{GMAIL_ADDRESS}>"
    msg["To"]      = to_email

    msg.attach(MIMEText(
        f"Loan #{loan_id} signed. Please transfer ₹{int(loan_amount):,} to "
        f"{borrower_name} — Account: {account_number}, IFSC: {ifsc_code}. "
        f"Then mark as disbursed in your LendOS dashboard.",
        "plain"
    ))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASS)
        smtp.sendmail(GMAIL_ADDRESS, to_email, msg.as_string())

    return True

def send_disbursement_email_to_borrower(
    to_email:      str,
    borrower_name: str,
    nbfc_name:     str,
    loan_id:       int,
    loan_amount:   float,
    amount_disbursed: float,
    utr_number:    str,
    transfer_mode: str,
    emi_amount:    float,
    tenure_months: int,
    first_emi_date: str,
) -> bool:
    if not GMAIL_ADDRESS or not GMAIL_APP_PASS:
        print(f"[DEV] Disbursement email to borrower {to_email} — ₹{int(amount_disbursed):,} disbursed")
        return True

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>
  body {{ font-family: Arial, sans-serif; background:#f1f5f9; padding:32px 16px; }}
  .wrapper {{ max-width:520px; margin:0 auto; }}
  .header {{ background:#0F6E56; border-radius:12px 12px 0 0; padding:24px 32px; text-align:center; }}
  .header-logo {{ color:white; font-size:20px; font-weight:700; }}
  .header-sub {{ color:#9fe1cb; font-size:13px; margin-top:4px; }}
  .body {{ background:white; padding:28px 32px; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0; }}
  .title {{ font-size:17px; font-weight:700; color:#0f172a; margin-bottom:6px; }}
  .sub {{ font-size:13px; color:#475569; margin-bottom:20px; line-height:1.6; }}
  .amount-hero {{ background:#f0fdf9; border:2px solid #9fe1cb; border-radius:12px; padding:20px; text-align:center; margin-bottom:20px; }}
  .amount-label {{ font-size:11px; font-weight:700; color:#0F6E56; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }}
  .amount-val {{ font-size:36px; font-weight:700; color:#0F6E56; letter-spacing:-1px; }}
  .info-box {{ background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:18px 20px; margin-bottom:18px; }}
  .info-row {{ display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f1f5f9; font-size:13px; }}
  .info-row:last-child {{ border-bottom:none; }}
  .info-label {{ color:#64748b; }}
  .info-val {{ font-weight:600; color:#0f172a; }}
  .emi-box {{ background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:14px 16px; font-size:13px; color:#92400e; margin-bottom:18px; }}
  .footer {{ background:#f8fafc; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px; padding:14px 32px; text-align:center; font-size:11.5px; color:#94a3b8; }}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
  <div class="header-logo">🏦 {nbfc_name}</div>
    <div class="header-sub">Loan Disbursement Confirmation · Powered by LendOS</div>
  </div>
  <div class="body">
    <div class="title">Your Loan Has Been Disbursed! 🎉</div>
    <div class="sub">Hi <strong>{borrower_name}</strong>, your loan from <strong>{nbfc_name}</strong> has been successfully disbursed to your bank account.</div>

    <div class="amount-hero">
      <div class="amount-label">Amount Credited</div>
      <div class="amount-val">₹{int(amount_disbursed):,}</div>
    </div>

    <div class="info-box">
      <div class="info-row"><span class="info-label">Loan ID</span><span class="info-val">#LA-{loan_id:04d}</span></div>
      <div class="info-row"><span class="info-label">Lender</span><span class="info-val">{nbfc_name}</span></div>
      <div class="info-row"><span class="info-label">Loan Amount</span><span class="info-val">₹{int(loan_amount):,}</span></div>
      <div class="info-row"><span class="info-label">Amount Disbursed</span><span class="info-val">₹{int(amount_disbursed):,}</span></div>
      <div class="info-row"><span class="info-label">UTR Number</span><span class="info-val">{utr_number}</span></div>
      <div class="info-row"><span class="info-label">Transfer Mode</span><span class="info-val">{transfer_mode}</span></div>
      <div class="info-row"><span class="info-label">Monthly EMI</span><span class="info-val">₹{int(emi_amount):,}</span></div>
      <div class="info-row"><span class="info-label">Tenure</span><span class="info-val">{tenure_months} months</span></div>
      <div class="info-row"><span class="info-label">First EMI Due</span><span class="info-val">{first_emi_date}</span></div>
    </div>

    <div class="emi-box">
      📅 Your first EMI of <strong>₹{int(emi_amount):,}</strong> is due on <strong>{first_emi_date}</strong>.
      Please ensure sufficient balance in your account. Log in to LendOS to view your full repayment schedule.
    </div>
  </div>
  <div class="footer">
    LendOS Platform · This is an automated notification.<br/>
    © {datetime.utcnow().year} LendOS. All rights reserved.
  </div>
</div>
</body>
</html>
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"✅ {nbfc_name} — ₹{int(amount_disbursed):,} credited to your account"
    msg["From"] = f"{nbfc_name} via LendOS <{GMAIL_ADDRESS}>"
    msg["To"]      = to_email

    msg.attach(MIMEText(
        f"Hi {borrower_name}, your loan of ₹{int(amount_disbursed):,} from {nbfc_name} "
        f"has been disbursed. UTR: {utr_number}. First EMI due: {first_emi_date}.",
        "plain"
    ))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASS)
        smtp.sendmail(GMAIL_ADDRESS, to_email, msg.as_string())

    return True

def send_emi_confirmation_email(
    to_email:      str,
    borrower_name: str,
    nbfc_name:     str,
    instalment_no: int,
    amount:        float,
) -> bool:
    if not GMAIL_ADDRESS or not GMAIL_APP_PASS:
        print(f"[DEV] EMI #{instalment_no} confirmed for {to_email} — ₹{int(amount):,}")
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"✅ EMI #{instalment_no} Payment Confirmed — ₹{int(amount):,}"
    msg["From"]    = f"{nbfc_name} via LendOS <{GMAIL_ADDRESS}>"
    msg["To"]      = to_email

    msg.attach(MIMEText(
        f"Hi {borrower_name},\n\nYour EMI #{instalment_no} payment of ₹{int(amount):,} "
        f"has been confirmed by {nbfc_name}.\n\nThank you for your timely payment.\n\n"
        f"— LendOS Platform",
        "plain"
    ))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASS)
        smtp.sendmail(GMAIL_ADDRESS, to_email, msg.as_string())

    return True


def send_emi_reminder_email(
        to_email: str,
        borrower_name: str,
        nbfc_name: str,
        instalment_no: int,
        amount: float,
        due_date: str,  # formatted string e.g. "30 Aug 2026"
        upi_id: str = "",
        bank_name: str = "",
        account_number: str = "",
        ifsc_code: str = "",
) -> bool:
    """Sent 5 days before the EMI due date."""
    if not GMAIL_ADDRESS or not GMAIL_APP_PASS:
        print(f"[DEV] EMI reminder to {to_email} — EMI #{instalment_no} due {due_date}")
        return True

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>
  body {{ font-family: Arial, sans-serif; background:#f1f5f9; padding:32px 16px; }}
  .wrapper {{ max-width:520px; margin:0 auto; }}
  .header {{ background:#d97706; border-radius:12px 12px 0 0; padding:24px 32px; text-align:center; }}
  .header-logo {{ color:white; font-size:20px; font-weight:700; }}
  .header-sub {{ color:#fef3c7; font-size:13px; margin-top:4px; }}
  .body {{ background:white; padding:28px 32px; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0; }}
  .title {{ font-size:17px; font-weight:700; color:#0f172a; margin-bottom:6px; }}
  .sub {{ font-size:13px; color:#475569; margin-bottom:20px; line-height:1.6; }}
  .amount-hero {{ background:#fffbeb; border:2px solid #fde68a; border-radius:12px; padding:20px; text-align:center; margin-bottom:20px; }}
  .amount-label {{ font-size:11px; font-weight:700; color:#92400e; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }}
  .amount-val {{ font-size:36px; font-weight:700; color:#92400e; letter-spacing:-1px; }}
  .due-date {{ font-size:13px; color:#92400e; margin-top:6px; }}
  .info-box {{ background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px 18px; margin-bottom:18px; }}
  .info-row {{ display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #f1f5f9; font-size:13px; }}
  .info-row:last-child {{ border-bottom:none; }}
  .info-label {{ color:#64748b; }}
  .info-val {{ font-weight:600; color:#0f172a; }}
  .warning {{ background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px 14px; font-size:12.5px; color:#991b1b; margin-bottom:8px; }}
  .footer {{ background:#f8fafc; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px; padding:14px 32px; text-align:center; font-size:11.5px; color:#94a3b8; }}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="header-logo">⏰ {nbfc_name}</div>
    <div class="header-sub">EMI Payment Reminder · Powered by LendOS</div>
  </div>
  <div class="body">
    <div class="title">Your EMI is due soon</div>
    <div class="sub">Hi <strong>{borrower_name}</strong>, this is a friendly reminder that your EMI #{instalment_no} is due in 5 days.</div>

    <div class="amount-hero">
      <div class="amount-label">Amount Due</div>
      <div class="amount-val">₹{int(amount):,}</div>
      <div class="due-date">Due on {due_date}</div>
    </div>

    <div class="info-box">
      <div class="info-row"><span class="info-label">Instalment</span><span class="info-val">#{instalment_no}</span></div>
      <div class="info-row"><span class="info-label">Bank Name</span><span class="info-val">{bank_name or '—'}</span></div>
      <div class="info-row"><span class="info-label">Account Number</span><span class="info-val">{account_number or '—'}</span></div>
      <div class="info-row"><span class="info-label">IFSC Code</span><span class="info-val">{ifsc_code or '—'}</span></div>
      <div class="info-row"><span class="info-label">UPI ID</span><span class="info-val">{upi_id or '—'}</span></div>
    </div>

    <div class="warning">
      ⚠️ A late payment penalty will apply if payment is not received within
      the grace period after the due date. Please pay on time to avoid extra charges.
    </div>
  </div>
  <div class="footer">
    LendOS Platform · This is an automated reminder.<br/>
    © {datetime.utcnow().year} LendOS. All rights reserved.
  </div>
</div>
</body>
</html>
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"⏰ EMI #{instalment_no} due in 5 days — ₹{int(amount):,}"
    msg["From"] = f"{nbfc_name} via LendOS <{GMAIL_ADDRESS}>"
    msg["To"] = to_email

    msg.attach(MIMEText(
        f"Hi {borrower_name}, your EMI #{instalment_no} of ₹{int(amount):,} is due on {due_date}. "
        f"Please pay on time to avoid late fees.\n\n— {nbfc_name} via LendOS",
        "plain"
    ))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASS)
        smtp.sendmail(GMAIL_ADDRESS, to_email, msg.as_string())

    return True


def send_late_fee_email(
        to_email: str,
        borrower_name: str,
        nbfc_name: str,
        instalment_no: int,
        emi_amount: float,
        late_fee: float,
        due_date: str,
) -> bool:
    """Sent when grace period expires and a late fee is applied."""
    total = emi_amount + late_fee

    if not GMAIL_ADDRESS or not GMAIL_APP_PASS:
        print(f"[DEV] Late fee email to {to_email} — EMI #{instalment_no} +₹{int(late_fee):,} penalty")
        return True

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/>
<style>
  body {{ font-family: Arial, sans-serif; background:#f1f5f9; padding:32px 16px; }}
  .wrapper {{ max-width:520px; margin:0 auto; }}
  .header {{ background:#dc2626; border-radius:12px 12px 0 0; padding:24px 32px; text-align:center; }}
  .header-logo {{ color:white; font-size:20px; font-weight:700; }}
  .header-sub {{ color:#fecaca; font-size:13px; margin-top:4px; }}
  .body {{ background:white; padding:28px 32px; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0; }}
  .title {{ font-size:17px; font-weight:700; color:#0f172a; margin-bottom:6px; }}
  .sub {{ font-size:13px; color:#475569; margin-bottom:20px; line-height:1.6; }}
  .info-box {{ background:#fef2f2; border:2px solid #fecaca; border-radius:10px; padding:18px 20px; margin-bottom:18px; }}
  .info-row {{ display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #fee2e2; font-size:13px; }}
  .info-row:last-child {{ border-bottom:none; font-weight:700; }}
  .info-label {{ color:#7f1d1d; }}
  .info-val {{ font-weight:600; color:#7f1d1d; }}
  .footer {{ background:#f8fafc; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px; padding:14px 32px; text-align:center; font-size:11.5px; color:#94a3b8; }}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="header-logo">⚠️ {nbfc_name}</div>
    <div class="header-sub">Late Payment Penalty Applied</div>
  </div>
  <div class="body">
    <div class="title">Late Payment Fee Applied</div>
    <div class="sub">Hi <strong>{borrower_name}</strong>, your EMI #{instalment_no} due on {due_date} has not
    been paid within the grace period. A late payment fee has been added to your outstanding amount.</div>

    <div class="info-box">
      <div class="info-row"><span class="info-label">Original EMI</span><span class="info-val">₹{int(emi_amount):,}</span></div>
      <div class="info-row"><span class="info-label">Late Fee</span><span class="info-val">₹{int(late_fee):,}</span></div>
      <div class="info-row"><span class="info-label">Total Now Due</span><span class="info-val">₹{int(total):,}</span></div>
    </div>

    <div class="sub">Please make the payment as soon as possible to avoid further charges or impact on your credit score.</div>
  </div>
  <div class="footer">
    LendOS Platform · This is an automated notification.<br/>
    © {datetime.utcnow().year} LendOS. All rights reserved.
  </div>
</div>
</body>
</html>
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"⚠️ Late fee of ₹{int(late_fee):,} applied — EMI #{instalment_no}"
    msg["From"] = f"{nbfc_name} via LendOS <{GMAIL_ADDRESS}>"
    msg["To"] = to_email

    msg.attach(MIMEText(
        f"Hi {borrower_name}, EMI #{instalment_no} is overdue. A late fee of ₹{int(late_fee):,} "
        f"has been applied. Total now due: ₹{int(total):,}.\n\n— {nbfc_name} via LendOS",
        "plain"
    ))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASS)
        smtp.sendmail(GMAIL_ADDRESS, to_email, msg.as_string())

# ── Password Reset Email ──────────────────────────────────────────────────────
def _build_password_reset_html(user_name: str, otp: str) -> str:
    return f"""
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * {{ margin:0; padding:0; box-sizing:border-box; }}
    body {{ font-family: 'DM Sans', Arial, sans-serif; background:#f1f5f9; padding:32px 16px; }}
    .wrapper {{ max-width:520px; margin:0 auto; }}
    .header {{ background:#0F6E56; border-radius:12px 12px 0 0; padding:28px 32px; text-align:center; }}
    .header-logo {{ color:white; font-size:20px; font-weight:700; }}
    .body {{ background:white; padding:32px; border-left:1px solid #e2e8f0; border-right:1px solid #e2e8f0; }}
    .greeting {{ font-size:16px; font-weight:600; color:#0f172a; margin-bottom:8px; }}
    .desc {{ font-size:13.5px; color:#475569; line-height:1.7; margin-bottom:24px; }}
    .otp-box {{ background:#f0fdf9; border:2px dashed #9fe1cb; border-radius:12px; padding:24px; text-align:center; margin-bottom:24px; }}
    .otp-label {{ font-size:11px; font-weight:600; color:#0F6E56; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:10px; }}
    .otp-code {{ font-size:40px; font-weight:700; letter-spacing:12px; color:#0F6E56; font-family:'Courier New', monospace; }}
    .warning {{ background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:12px 14px; font-size:12.5px; color:#92400e; margin-bottom:24px; }}
    .footer {{ background:#f8fafc; border:1px solid #e2e8f0; border-top:none; border-radius:0 0 12px 12px; padding:16px 32px; text-align:center; font-size:11.5px; color:#94a3b8; line-height:1.6; }}
  </style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <div class="header-logo">🏦 LendOS</div>
  </div>
  <div class="body">
    <div class="greeting">Hi {user_name},</div>
    <div class="desc">We received a request to reset your LendOS password. Use the OTP below to securely set a new password.</div>
    <div class="otp-box">
      <div class="otp-label">Password Reset OTP</div>
      <div class="otp-code">{otp}</div>
    </div>
    <div class="warning">⚠️ If you did not request a password reset, please ignore this email. Your account remains secure.</div>
  </div>
  <div class="footer">
    This email was sent by LendOS Platform.<br/>
    © {datetime.now().year} LendOS. All rights reserved.
  </div>
</div>
</body>
</html>
"""

def send_password_reset_email(to_email: str, user_name: str, otp: str) -> bool:
    """
    Sends a password reset OTP email via Gmail SMTP.
    """
    if not GMAIL_ADDRESS or not GMAIL_APP_PASS:
        print(f"[DEV] Password reset email to {to_email} — OTP: {otp}")
        return True

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"🔐 Your LendOS Password Reset OTP: {otp}"
    msg["From"] = f"LendOS Security <{GMAIL_ADDRESS}>"
    msg["To"] = to_email

    text_part = MIMEText(
        f"Hi {user_name},\n\n"
        f"Your password reset OTP is: {otp}\n\n"
        f"If you did not request this, please ignore this email.\n\n"
        f"— LendOS Platform",
        "plain"
    )

    html_part = MIMEText(
        _build_password_reset_html(user_name, otp),
        "html"
    )

    msg.attach(text_part)
    msg.attach(html_part)

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASS)
        smtp.sendmail(GMAIL_ADDRESS, to_email, msg.as_string())

    return True


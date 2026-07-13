# ─────────────────────────────────────────────────────────────────────────────
#  app/services/agreement_service.py
#  Handles LLM-based loan agreement generation for LendOS.
#  Route calls generate_loan_agreement() — all prompt logic lives here.
# ─────────────────────────────────────────────────────────────────────────────

import os
from datetime import date
from openai import OpenAI
_client = None


# ── Purpose label map ─────────────────────────────────────────────────────────
PURPOSE_LABELS: dict[str, str] = {
    "personal":          "Personal Use",
    "medical":           "Medical Emergency",
    "education":         "Education",
    "home_renovation":   "Home Renovation",
    "business":          "Business Expansion",
    "vehicle":           "Vehicle Purchase",
    "travel":            "Travel",
    "wedding":           "Wedding Expenses",
    "debt_consolidation":"Debt Consolidation",
    "other":             "General Purpose",
}


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(
    loan:     dict,
    borrower: dict,
    nbfc:     dict,
) -> str:
    """
    Builds the LLM prompt for loan agreement generation.
    Edit this function to change agreement content, sections, or tone.
    """

    today         = date.today().strftime("%d %B %Y")
    purpose_label = PURPOSE_LABELS.get(
        loan.get("purpose", ""),
        loan.get("purpose") or "Personal Use"
    )

    def inr(val) -> str:
        try:
            return f"₹{int(val):,}"
        except (TypeError, ValueError):
            return "₹0"

    rate           = loan.get("interest_rate", 0)
    grace_days     = nbfc.get("grace_period_days", 3)
    penalty_amount = nbfc.get("late_penalty_flat", 500)

    return f"""You are a senior legal drafting specialist for LendOS, a regulated Indian NBFC \
lending platform. Draft a complete, formal loan agreement in clean Markdown.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATTING RULES (strictly follow)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Start with a single # heading: LOAN AGREEMENT
- Use ## for numbered section headings: ## 1. PARTIES TO THE AGREEMENT
- Use ### for sub-sections: ### 1.1 The Lender
- Bold all key values, names, dates, and amounts: **₹1,62,000**
- Use numbered lists (1. 2. 3.) for clauses — NOT bullet points
- Include one Markdown table for the Loan Terms Summary
- Separate major sections with --- (horizontal rule)
- Dates in **DD Month YYYY** format
- Currency in **₹X,XX,XXX** format (Indian notation)
- Formal, precise legal language — no casual phrasing
- Do NOT include any preamble, explanation, or commentary outside the document
- Output ONLY the agreement document itself

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGREEMENT DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Date of Agreement  : {today}

LOAN DETAILS
  Loan Amount        : {inr(loan.get('amount'))}
  Purpose            : {purpose_label}
  Interest Rate      : {rate}% per annum (monthly reducing balance)
  Loan Tenure        : {loan.get('tenure_months')} months
  Monthly EMI        : {inr(loan.get('emi_amount'))}
  Total Interest     : {inr(loan.get('total_interest'))}
  Total Repayable    : {inr(loan.get('total_payable'))}
  Processing Fee     : {inr(loan.get('processing_fee_amount') or 0)} (non-refundable)
  Amount Disbursed   : {inr(loan.get('amount_disbursed'))}

BORROWER
  Full Name          : {borrower.get('full_name')}
  PAN Number         : {borrower.get('pan_number') or 'As per KYC records on file'}
  Mobile Number      : {borrower.get('mobile')}
  Employment Type    : {borrower.get('employment_type') or 'Salaried'}
  Credit Score       : {borrower.get('credit_score') or 'Assessed internally by LendOS'}

LENDER (NBFC)
  Company Name       : {nbfc.get('company_name')}
  RBI Reg. Number    : {nbfc.get('registration_number')}
  Registered Office  : {nbfc.get('city') or ''}, {nbfc.get('state')}, India
  Grace Period       : {grace_days} calendar days after EMI due date
  Late Payment Fee   : {inr(penalty_amount)} per delayed instalment

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIRED SECTIONS — include all 11 in exact order
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 1. PARTIES TO THE AGREEMENT
Formally identify Lender and Borrower. Include full names, PAN, mobile, RBI
registration. State this agreement is entered into on {today}.

## 2. LOAN TERMS SUMMARY
Insert a clean Markdown table with columns: Parameter | Details
Rows: Loan Amount, Interest Rate, Tenure, Monthly EMI, Total Interest,
Total Repayable, Processing Fee, Disbursement Amount.

## 3. INTEREST RATE — IMPORTANT NOTICE
⚠️ Write a clear, prominent notice that the interest rate of **{rate}% per annum**
is fixed for the agreed tenure. However, clearly state:
- The Lender reserves the right to revise interest rates for future loan applications
  in accordance with RBI monetary policy changes and the Lender's internal credit policy.
- Any revision will be communicated 30 days in advance via registered mobile/email.
- The rate applicable to THIS agreement remains locked at **{rate}% p.a.** and cannot
  be changed retrospectively without written consent of both parties.
- Borrowers are advised to review prevailing interest rates at the time of any
  future loan renewal or enhancement.

## 4. DISBURSEMENT
State funds will be transferred via NEFT/IMPS to borrower's registered bank account
within 2 business days of agreement execution. Processing fee deducted upfront.

## 5. REPAYMENT SCHEDULE
EMI of {inr(loan.get('emi_amount'))} due on the same date each month.
Auto-debit via NACH mandate. Grace period of {grace_days} days.

## 6. PREPAYMENT & FORECLOSURE
Conditions for early repayment. State any foreclosure charges clearly
(typically 2-4% of outstanding principal — use appropriate standard).

## 7. LATE PAYMENT & DEFAULT
Late fee of {inr(penalty_amount)} per delayed EMI after {grace_days}-day grace period.
Consequences: credit bureau reporting, legal recovery proceedings.

## 8. BORROWER REPRESENTATIONS
3-4 numbered declarations: income accuracy, no undisclosed liabilities,
end-use of funds as stated, consent to credit bureau checks.

## 9. LENDER RIGHTS
Rights upon default: recall loan, report to CIBIL, initiate legal action
under the SARFAESI Act / applicable law.

## 10. GOVERNING LAW & JURISDICTION
Indian law and RBI NBFC regulations. Exclusive jurisdiction: courts of
{nbfc.get('city') or 'Mumbai'}, India.

## 11. DIGITAL SIGNATURE & EXECUTION
State that OTP-based e-sign via LendOS platform constitutes a legally
valid electronic signature under the **Information Technology Act, 2000**
(Section 5) and the **Indian Contract Act, 1872**. Include timestamp,
OTP reference, and IP logging as audit trail.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SIGNATURE BLOCK (end of document)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
End with a two-column signature block:
Left  — Borrower: name, date, OTP verification reference
Right — Lender:   authorised signatory, designation, date, company seal note

Target: 750–950 words. Do NOT exceed 1,050 words. Output the agreement only.
"""


# ── Public API ────────────────────────────────────────────────────────────────

def generate_loan_agreement(
    loan:     dict,
    borrower: dict,
    nbfc:     dict,
) -> str:
    """
    Calls OpenAI with the loan agreement prompt and returns the generated text.

    Args:
        loan:     dict with amount, tenure_months, interest_rate, emi_amount,
                  total_interest, total_payable, processing_fee_amount,
                  amount_disbursed, purpose
        borrower: dict with full_name, pan_number, mobile, employment_type,
                  credit_score
        nbfc:     dict with company_name, registration_number, city, state,
                  late_penalty_flat, grace_period_days

    Returns:
        Plain-text loan agreement string.

    Raises:
        RuntimeError: if OPENAI_API_KEY is not set or API call fails.
    """
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=api_key)
    prompt = _build_prompt(loan, borrower, nbfc)

    response = client.chat.completions.create(
        model       = "gpt-4o-mini",
        messages    = [{"role": "user", "content": prompt}],
        max_tokens  = 1800,
        temperature = 0.25,   # low = consistent, formal output
    )

    return response.choices[0].message.content.strip()
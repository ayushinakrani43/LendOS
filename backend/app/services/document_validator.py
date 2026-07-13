# backend/app/services/document_validator.py
"""
Document Authenticity Validator — LendOS
-----------------------------------------
Before any extraction, this service sends the uploaded document to GPT-4o
and asks it to VERIFY the document type. If the file is not what the borrower
claims it is, we reject it immediately with a clear error — before any
credit scoring happens.

Supports:
  - Bank Statement  (PDF, all Indian banks)
  - Salary Slip     (PDF or image, salaried)
  - ITR             (PDF, self-employed)
"""

import os
import json
import base64
import re
import logging
from typing import Literal

import fitz
from openai import OpenAI

logger = logging.getLogger(__name__)

_GPT_MODEL = "gpt-4o-mini"          # must be 4o — mini fails visual verification
_DPI_SCALE = 2.0

DocumentType = Literal["bank_statement", "salary_slip", "itr"]


# ── Render first 2 pages only (enough for verification) ───────────────────────

def _pdf_first_pages_b64(pdf_bytes: bytes, max_pages: int = 2) -> list[str]:
    doc = None
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        images = []
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            pix = page.get_pixmap(matrix=fitz.Matrix(_DPI_SCALE, _DPI_SCALE))
            b64 = base64.standard_b64encode(pix.tobytes("jpeg")).decode("utf-8")
            images.append(b64)
        return images
    finally:
        if doc:
            doc.close()


def _image_b64(image_bytes: bytes) -> list[str]:
    return [base64.standard_b64encode(image_bytes).decode("utf-8")]


# ── Verification Prompts ───────────────────────────────────────────────────────

_VERIFY_PROMPTS = {

    "bank_statement": """You are a document verification agent for an Indian NBFC lending platform.

Your task: Decide if the uploaded document is a GENUINE Indian bank statement.

- Must have bank name 
- Account holder name and account number
- Statement period (from date / to date)
- A transaction table with columns like: Date, Description/Narration, Debit, Credit, Balance
- Multiple transaction rows (not just 1-2)

Return ONLY this JSON, no explanation:
{
  "is_valid": true or false,
  "document_type_detected": "what this document actually appears to be",
  "bank_name": "detected bank name, or null",
  "account_holder": "detected name, or null",
  "confidence": "HIGH / MEDIUM / LOW",
  "rejection_reason": "null if valid, else a short user-friendly reason explaining what is wrong"
}

Be strict. If the document is:
- A random PDF, photo, resume, invoice, or any non-bank document → is_valid: false
- A bank statement but from a foreign bank → is_valid: false
- A passbook photocopy (not a statement) → is_valid: false
- Clearly tampered or edited → is_valid: false
- A genuine Indian bank statement → is_valid: true""",


    "salary_slip": """You are a document verification agent for an Indian NBFC lending platform.

Your task: Decide if the uploaded document is a GENUINE Indian salary slip (payslip).

A genuine Indian salary slip should contain most of the following:

Mandatory fields:
- Employer / Company name
- Employee name
- Pay period (month and year)
- Net Pay / Take-Home amount OR Amount Credited

Supporting fields (one or more should be present):
- Employee ID
- Earnings section: Basic Pay, HRA, Allowances, Gross Salary, etc.
- Deductions section: PF, Professional Tax, TDS, etc.
- Gross Salary

A salary slip may still be considered valid if the deductions section is missing, provided it clearly appears to be an employer-issued salary slip and contains the mandatory fields.

Return ONLY this JSON, no explanation:
{
  "is_valid": true or false,
  "document_type_detected": "what this document actually appears to be",
  "employer_name": "detected company name, or null",
  "employee_name": "detected employee name, or null",
  "pay_period": "detected pay period like 'May 2026', or null",
  "confidence": "HIGH / MEDIUM / LOW",
  "rejection_reason": "null if valid, else a short user-friendly reason explaining what is wrong"
}

Be strict. If the document is:
- A bank statement, ID card, invoice, or any non-payslip document → is_valid: false
- An offer letter or appointment letter (not a payslip) → is_valid: false
- A form 16 (not a payslip) → is_valid: false
- Clearly tampered or edited → is_valid: false
- A genuine employer-issued salary slip containing the mandatory fields → is_valid: true
- Missing deductions alone should NOT cause rejection""",

    "itr": """You are a document verification agent for an Indian NBFC lending platform.

    Your task: Decide if the uploaded document is an Indian Income Tax Return (ITR) document or acknowledgement.

    Accept the document as valid if it contains MOST of the following:
    - PAN number (10-character alphanumeric)
    - Assessment Year (e.g. AY 2024-25, AY 2025-26)
    - Taxpayer name
    - Any income figures (gross income, taxable income, tax payable, or refund)
    - Acknowledgement number OR ITR form fields (Schedule fields, income heads, etc.)

    The document does NOT need to have an official government header or watermark to be accepted.
    Sample documents, printed copies, and digitally generated ITR formats are all acceptable.

    Return ONLY this JSON, no explanation:
    {
      "is_valid": true or false,
      "document_type_detected": "what this document actually appears to be",
      "pan_number": "detected PAN, or null",
      "taxpayer_name": "detected name, or null",
      "assessment_year": "detected AY like 'AY 2025-26', or null",
      "confidence": "HIGH / MEDIUM / LOW",
      "rejection_reason": "null if valid, else a short user-friendly reason explaining what is wrong"
    }

    Reject ONLY if the document is:
    - Clearly a bank statement, salary slip, ID card, invoice, or completely unrelated document → is_valid: false
    - A TDS certificate (Form 16) with no ITR fields → is_valid: false
    - A foreign tax return → is_valid: false
    - Completely blank or unreadable → is_valid: false

    If it looks like an ITR in any format (sample, printed, digital, filled) → is_valid: true""",
}

# ── Core Verification Function ─────────────────────────────────────────────────

def verify_document(
    file_bytes: bytes,
    expected_type: DocumentType,
    content_type: str = "application/pdf",
    api_key: str | None = None,
) -> dict:
    """
    Verify that a file is genuinely the document type it claims to be.

    Args:
        file_bytes    : raw bytes of the uploaded file
        expected_type : "bank_statement" | "salary_slip" | "itr"
        content_type  : MIME type of the upload
        api_key       : OpenAI key (falls back to env var)

    Returns:
        {
          "is_valid"               : bool,
          "document_type_detected" : str,
          "confidence"             : "HIGH" | "MEDIUM" | "LOW",
          "rejection_reason"       : str | None,
          ... (type-specific fields like bank_name, employer_name, etc.)
        }
    """
    key = api_key or os.getenv("OPENAI_API_KEY", "")
    if not key:
        logger.warning("No OpenAI key — skipping document verification")
        return {"is_valid": True, "skipped": True, "reason": "No API key configured"}

    client = OpenAI(api_key=key)

    # ── Render to images ──────────────────────────────────────────────────────
    try:
        if content_type == "application/pdf":
            images = _pdf_first_pages_b64(file_bytes, max_pages=2)
        else:
            images = _image_b64(file_bytes)
    except Exception as e:
        logger.error(f"Document render failed: {e}")
        return {"is_valid": False, "rejection_reason": "Could not read the uploaded file. Please upload a valid PDF or image."}

    if not images:
        return {"is_valid": False, "rejection_reason": "The uploaded file appears to be empty or unreadable."}

    # ── Build Vision message ──────────────────────────────────────────────────
    content = []
    for b64 in images:
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "high"}
        })
    content.append({"type": "text", "text": _VERIFY_PROMPTS[expected_type]})

    # ── Call GPT-4o-mini───────────────────────────────────────────────────────────
    try:
        resp = client.chat.completions.create(
            model=_GPT_MODEL,
            max_tokens=400,
            temperature=0,
            messages=[
                {"role": "system", "content": "You are a strict document verification agent. Return only JSON."},
                {"role": "user",   "content": content},
            ],
        )
        raw  = resp.choices[0].message.content.strip()
        raw  = re.sub(r"```json\s*", "", raw)
        raw  = re.sub(r"```", "", raw).strip()
        result = json.loads(raw)
        logger.info(f"Document verification [{expected_type}]: valid={result.get('is_valid')}, confidence={result.get('confidence')}")
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Verification JSON parse error: {e}")
        # On parse failure, fail safe — reject
        return {"is_valid": False, "rejection_reason": "Could not verify document authenticity. Please re-upload a clear copy."}
    except Exception as e:
        logger.error(f"Verification API error: {e}")
        return {"is_valid": False, "rejection_reason": f"Document verification failed: {str(e)}"}


def validate_bank_statement_quality(monthly_transactions: dict) -> dict:
    from datetime import date
    from dateutil.relativedelta import relativedelta

    if not monthly_transactions:
        return {"is_valid": False, "reason": "no_transactions",
            "user_message": "No transactions could be extracted. Please upload a complete bank statement PDF."}

    if len(monthly_transactions) < 3:
        return {"is_valid": False, "reason": "insufficient_months",
            "user_message": f"Your bank statement only covers {len(monthly_transactions)} month(s). We need at least 3 months. Please upload a 3-month bank statement."}

    today = date.today()
    expected = [(today - relativedelta(months=i)).strftime("%b %Y") for i in range(1, 4)]
    if len([m for m in expected if m in monthly_transactions]) < 2:
        return {"is_valid": False, "reason": "statement_too_old",
            "user_message": f"This statement does not cover recent months. We need transactions from at least 2 of the last 3 months ({', '.join(expected)}). Please upload your most recent bank statement."}

    thin = [f"{m} ({len([t for t in txns if (t.get('debit') or 0) > 0 or (t.get('credit') or 0) > 0])} entries)"
            for m, txns in monthly_transactions.items()
            if len([t for t in txns if (t.get('debit') or 0) > 0 or (t.get('credit') or 0) > 0]) < 7]
    if thin:
        return {"is_valid": False, "reason": "insufficient_entries",
            "user_message": f"This statement does not have enough transactions to calculate your score. Months with very few entries: {', '.join(thin)}. Please upload a complete bank statement."}

    return {"is_valid": True}

def validate_itr_quality(itr_result: dict) -> dict:
    from datetime import date

    # Dynamically compute accepted assessment years
    today = date.today()
    fy_start = today.year if today.month >= 4 else today.year - 1
    accepted_starts = [fy_start, fy_start - 1]

    def build_ay(s):
        return f"AY {s}-{str(s + 1)[-2:]}"

    accepted_ays    = [build_ay(s) for s in accepted_starts]
    accepted_short  = [f"{s}-{str(s+1)[-2:]}" for s in accepted_starts]
    all_accepted    = accepted_ays + accepted_short

    ay = itr_result.get("assessment_year") or ""
    if not ay or not any(a in ay for a in all_accepted):
        return {
            "is_valid": False,
            "reason": "itr_too_old",
            "user_message": (
                f"Your ITR is for {ay or 'an unknown assessment year'}. "
                f"We only accept ITR for {accepted_ays[1]} or {accepted_ays[0]}. "
                f"Please upload your most recent filed ITR."
            )
        }

    income     = itr_result.get("income", {}) or {}
    net_income = income.get("net_taxable_income") or 0
    if net_income <= 0:
        return {
            "is_valid": False,
            "reason": "itr_no_income",
            "user_message": (
                "Your ITR does not show any taxable income. "
                "We could not extract your income details. "
                "Please upload a clear, complete ITR document."
            )
        }

    taxpayer = itr_result.get("taxpayer", {}) or {}
    pan      = taxpayer.get("pan") or itr_result.get("pan_number")
    if not pan:
        return {
            "is_valid": False,
            "reason": "itr_no_pan",
            "user_message": (
                "Your ITR does not show a PAN number. "
                "Please upload a complete ITR that includes your PAN."
            )
        }

    name = taxpayer.get("name") or itr_result.get("taxpayer_name")
    if not name:
        return {
            "is_valid": False,
            "reason": "itr_no_name",
            "user_message": (
                "Your ITR does not show a taxpayer name. "
                "Please upload a complete ITR document."
            )
        }

    return {"is_valid": True}
# backend/app/services/itr_service.py
"""
ITR Extraction Service — LendOS
---------------------------------
Extracts financial data from Indian Income Tax Return documents (ITR-1, ITR-2,
ITR-3, ITR-4, ITR-V acknowledgement) using GPT-4o Vision.

Used for self-employed borrowers in place of salary slip.
Output feeds into credit_scoring_service.py Step 2 (income level)
and Step 7 (employment type).
"""

import os
import json
import base64
import re
import logging
from typing import Optional

import fitz
from openai import OpenAI

logger = logging.getLogger(__name__)

_GPT_MODEL  = "gpt-4o"
_MAX_PAGES  = 5          # ITR-V is 1 page; full ITR forms can be 4-5 pages
_MAX_TOKENS = 2000
_DPI_SCALE  = 2.0


# ── PDF → Images ──────────────────────────────────────────────────────────────

def _pdf_to_images(pdf_bytes: bytes, max_pages: int = _MAX_PAGES) -> list[str]:
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
    except Exception as e:
        logger.error(f"ITR PDF render failed: {e}")
        raise
    finally:
        if doc:
            doc.close()


def _image_b64(image_bytes: bytes) -> list[str]:
    return [base64.standard_b64encode(image_bytes).decode("utf-8")]


def _parse_json(text: str) -> dict:
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```", "", text).strip()
    return json.loads(text)


# ── Extraction Prompt ──────────────────────────────────────────────────────────

_ITR_PROMPT = """You are a financial document parser for an Indian NBFC lending platform.

Extract data from this Indian Income Tax Return (ITR) document.
This may be an ITR-V acknowledgement, ITR-1 (Sahaj), ITR-2, ITR-3, or ITR-4 (Sugam).

Return ONLY this exact JSON structure, no explanation, no markdown:

{
  "itr_type": "ITR-V / ITR-1 / ITR-2 / ITR-3 / ITR-4 or null",
  "assessment_year": "AY YYYY-YY format e.g. AY 2025-26, or null",
  "filing_date": "DD/MM/YYYY or null",
  "acknowledgement_number": "15-digit number or null",

  "taxpayer": {
    "name": "full name as printed, or null",
    "pan": "10-character PAN e.g. ABCDE1234F, or null",
    "aadhaar_last4": "last 4 digits if visible, or null",
    "date_of_birth": "DD/MM/YYYY or null",
    "mobile": "10-digit mobile or null",
    "email": "email or null",
    "address": "full address or null"
  },

  "income": {
    "salary_income":            0.0,
    "house_property_income":    0.0,
    "business_profession_income": 0.0,
    "capital_gains":            0.0,
    "other_sources_income":     0.0,
    "gross_total_income":       0.0,
    "total_deductions_80c":     0.0,
    "net_taxable_income":       0.0
  },

  "tax": {
    "tax_payable":    0.0,
    "tds_deducted":   0.0,
    "advance_tax":    0.0,
    "tax_refund":     0.0,
    "self_assessment_tax": 0.0
  },

  "bank_account": {
    "account_number": "or null",
    "ifsc":           "or null",
    "bank_name":      "or null"
  },

  "employment_type": "SALARIED / SELF_EMPLOYED / BOTH / null"
}

Extraction rules:
- All income and tax amounts: plain positive floats, no commas, no ₹ symbol
- employment_type: SALARIED if salary_income > 0 and business_income = 0;
  SELF_EMPLOYED if business_income > 0 and salary_income = 0;
  BOTH if both are present; null if unclear
- For ITR-V (acknowledgement only): fill taxpayer + net_taxable_income +
  tax_payable + refund + acknowledgement_number. Set other income fields to 0.
- Missing or unreadable values: null for strings, 0.0 for numbers
- Do NOT compute or derive values — only extract what is printed"""


# ── Main Extraction Function ───────────────────────────────────────────────────

def extract_itr(
    file_bytes: bytes,
    content_type: str = "application/pdf",
    api_key: Optional[str] = None,
) -> dict:
    """
    Extract ITR data from PDF or image using GPT-4o Vision.

    Returns structured dict with taxpayer info, income breakdown,
    tax details, and employment_type — ready for credit scoring.

    On failure returns: {"error": "reason"}
    """
    key = api_key or os.getenv("OPENAI_API_KEY", "")
    if not key:
        return {"error": "OPENAI_API_KEY not configured"}

    client = OpenAI(api_key=key)

    # ── Render to images ──────────────────────────────────────────────────────
    try:
        if content_type == "application/pdf":
            images = _pdf_to_images(file_bytes)
        else:
            images = _image_b64(file_bytes)
    except Exception as e:
        return {"error": f"Could not render ITR file: {e}"}

    if not images:
        return {"error": "ITR file appears to be empty or unreadable"}

    # ── Build Vision message ──────────────────────────────────────────────────
    content = []
    for b64 in images:
        content.append({
            "type": "image_url",
            "image_url": {
                "url":    f"data:image/jpeg;base64,{b64}",
                "detail": "high"
            }
        })
    content.append({"type": "text", "text": _ITR_PROMPT})

    # ── Call GPT-4o ───────────────────────────────────────────────────────────
    try:
        resp = client.chat.completions.create(
            model       = _GPT_MODEL,
            max_tokens  = _MAX_TOKENS,
            temperature = 0,
            messages    = [
                {
                    "role":    "system",
                    "content": "You are a financial document parser. Return only valid JSON, no markdown."
                },
                {
                    "role":    "user",
                    "content": content
                }
            ],
        )
        raw     = resp.choices[0].message.content.strip()
        result  = _parse_json(raw)
        logger.info(f"ITR extracted: AY={result.get('assessment_year')}, "
                    f"income={result.get('income', {}).get('net_taxable_income')}, "
                    f"type={result.get('employment_type')}")
        return result

    except json.JSONDecodeError as e:
        logger.error(f"ITR JSON parse error: {e}")
        return {"error": f"LLM returned invalid JSON: {e}"}
    except Exception as e:
        logger.error(f"ITR extraction API error: {e}")
        return {"error": str(e)}
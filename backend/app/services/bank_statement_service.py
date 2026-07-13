

import io, os, base64, re
import fitz  # pymupdf
from openai import OpenAI

_client    = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
_GPT_MODEL = "gpt-4o-mini"


def _pdf_to_images(pdf_bytes: bytes) -> list[str]:
    """Convert each PDF page to base64 JPEG string."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images = []
    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
        b64 = base64.standard_b64encode(pix.tobytes("jpeg")).decode("utf-8")
        images.append(b64)
    doc.close()
    return images


def _parse_json(text: str) -> dict:
    """Strip markdown fences and parse JSON."""
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```", "", text).strip()
    import json
    return json.loads(text)


def extract_bank_statement(pdf_bytes: bytes) -> dict:
    """
    Converts PDF pages to images and sends to GPT-4o Vision.
    Returns structured financial data for credit scoring.
    """
    if not os.getenv("OPENAI_API_KEY"):
        return {"error": "OpenAI API key not configured"}

    page_images = _pdf_to_images(pdf_bytes)

    content = []
    for b64 in page_images[:5]:   # max 5 pages
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{b64}",
                "detail": "high"
            }
        })

    content.append({
        "type": "text",
        "text": """You are a financial document parser for Indian bank statements.

You will be shown one or more page images of a bank statement. Extract the
data and return ONLY valid JSON, with no extra text, no markdown fences, and
no explanations.

Return JSON in exactly this structure:

{
  "account_holder": "",
  "account_number": "",
  "bank_name": "",
  "statement_period": {"from": "DD/MM/YYYY", "to": "DD/MM/YYYY"},
  "opening_balance": 0.0,
  "ifsc_code": "",
  "monthly_transactions": {
    "Mon YYYY": [
      {"date": "DD-MM-YYYY", "description": "", "debit": 0.0, "credit": 0.0, "balance": 0.0}
    ]
  }
}

Rules for extraction:

1. Read the statement table row by row, top to bottom, exactly as printed.
   Do NOT skip, merge, reorder, or summarize any row.

2. Group rows under "monthly_transactions" by the calendar month of each
   row's date. Use the key format "Mon YYYY", e.g., "Mar 2026", "Apr 2026".
   Each month's value is an ARRAY of transaction objects, in chronological
   order.

3. Each transaction object must contain:
   - "date": DD-MM-YYYY
   - "description": exact text as printed (do not relabel, translate, or
     classify it)
   - "debit": the debit/withdrawal amount as a plain number, or 0 if the
     row has no debit
   - "credit": the credit/deposit amount as a plain number, or 0 if the
     row has no credit
   - "balance": the running balance shown on that row, as a plain number

4. The very first row of the statement (typically labeled "Opening Balance")
   should be INCLUDED as a normal transaction object in its month's array
   (with debit=0, credit=0, and its balance value), exactly as shown in the
   table. ALSO copy this same balance value into the top-level
   "opening_balance" field.

5. All amounts must be plain positive numbers - no commas, no currency
   symbols (Rs., INR), no negative signs, no text.

6. Do NOT compute totals, sums, averages, closing balances, or any derived
   values. Output only what is directly printed in each row.

7. "ifsc_code": extract the IFSC code from the statement header or account
   details section (typically an 11-character alphanumeric code like
   SBIN0001234). If not found, use null.

8. If a value is missing or unreadable for a field, use null for strings
   and 0 for numbers. Do not guess or fabricate values.

9. "statement_period" dates use DD/MM/YYYY format, taken from the
   statement header (not derived from transaction rows).

Return only the JSON object."""
    })

    try:
        resp = _client.chat.completions.create(
            model=_GPT_MODEL,
            max_tokens=8000,
            messages=[{"role": "user", "content": content}]
        )
        return _parse_json(resp.choices[0].message.content.strip())
    except Exception as e:
        return {"error": str(e)}
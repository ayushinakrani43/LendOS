# backend/app/services/salary_slip_service.py

import io, os, base64, re, json
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


def _image_bytes_to_b64(image_bytes: bytes) -> str:
    """Convert raw image bytes (jpg/png) to base64 string."""
    return base64.standard_b64encode(image_bytes).decode("utf-8")


def _parse_json(text: str) -> dict:
    """Strip markdown fences and parse JSON."""
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```", "", text).strip()
    return json.loads(text)


_SALARY_SLIP_PROMPT = """You are a financial document parser for Indian salary slips (payslips).

You will be shown one or more page images of a salary slip. Extract the
data and return ONLY valid JSON, with no extra text, no markdown fences, and
no explanations.

Return JSON in exactly this structure:

{
  "employee_name": "",
  "employee_id": "",
  "pan_number": "",
  "designation": "",
  "employer_name": "",
  "pay_period": "Mon YYYY",
  "gross_pay": 0.0,
  "total_deductions": 0.0,
  "net_pay": 0.0,
  "earnings": [
    {"label": "", "amount": 0.0}
  ],
  "deductions": [
    {"label": "", "amount": 0.0}
  ]
}

Rules for extraction:

1. "employee_name" is the name of the person the salary slip belongs to
   (often labeled "Employee Name", "Name", or similar) - exactly as printed.

2. "pan_number" is the employee's PAN if printed anywhere on the slip
   (10-character alphanumeric, format like ABCDE1234F). If not present,
   use null.

3. "designation" is the employee's job title/role (e.g., "Software Engineer",
   "Manager"). If not present, use null.

4. "employer_name" is the company/organization name issuing the salary slip
   - usually at the top of the document as a header/letterhead.

5. "pay_period" is the month and year this salary slip is for, in
   "Mon YYYY" format (e.g., "May 2026"), based on the period printed on the
   slip.

6. "gross_pay" is the total earnings before deductions (sometimes labeled
   "Gross Salary", "Total Earnings", "Gross Pay").

7. "total_deductions" is the sum of all deductions as printed (sometimes
   labeled "Total Deductions"). If only individual deduction lines are
   shown without an explicit total, sum them yourself ONLY for this field.

8. "net_pay" is the final take-home amount (sometimes labeled "Net Pay",
   "Net Salary", "Take Home", "Amount Payable").

9. "earnings" is a list of every individual earning line item exactly as
   printed (e.g., Basic Pay, HRA, Conveyance Allowance, Special Allowance),
   with its label and amount. Do not summarize or omit any line.

10. "deductions" is a list of every individual deduction line item exactly
    as printed (e.g., PF, Professional Tax, TDS, ESI), with its label and
    amount. Do not summarize or omit any line.

11. All amounts must be plain positive numbers - no commas, no currency
    symbols (Rs., INR), no negative signs, no text.

12. If a value is missing or unreadable, use null for strings and 0 for
    numbers. Do not guess or fabricate values.

Return only the JSON object."""


def _call_vision_model(image_b64_list: list[str]) -> dict:
    content = []
    for b64 in image_b64_list[:3]:   # salary slips are usually 1 page; cap at 3
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/jpeg;base64,{b64}",
                "detail": "high"
            }
        })

    content.append({"type": "text", "text": _SALARY_SLIP_PROMPT})

    try:
        resp = _client.chat.completions.create(
            model=_GPT_MODEL,
            max_tokens=2000,
            messages=[{"role": "user", "content": content}]
        )
        return _parse_json(resp.choices[0].message.content.strip())
    except Exception as e:
        return {"error": str(e)}


def extract_salary_slip(file_bytes: bytes, content_type: str = "application/pdf") -> dict:
    """
    Accepts salary slip as PDF or image bytes, sends to GPT-4o Vision.
    Returns structured salary data for credit scoring (Step 2 & Step 7).
    """
    if not os.getenv("OPENAI_API_KEY"):
        return {"error": "OpenAI API key not configured"}

    if content_type == "application/pdf":
        page_images = _pdf_to_images(file_bytes)
    else:
        # image upload (jpg/png)
        page_images = [_image_bytes_to_b64(file_bytes)]

    if not page_images:
        return {"error": "Could not read document pages"}

    return _call_vision_model(page_images)
"""
ocr_service.py — LendOS KYC OCR Service
========================================

Architecture:
  • ALL Aadhaar fields (number, name, dob, gender, address) → GPT-4o Vision
  • ALL PAN fields (number, name)                           → GPT-4o Vision
  • Tesseract kept only as fallback when API key is absent

Setup:
  pip install openai
  Set OPENAI_API_KEY in your .env file.
"""

import pytesseract
from PIL import Image
import io, re, os, base64, json
import numpy as np
from openai import OpenAI

# ── Tesseract path ────────────────────────────────────────────────────────────
tesseract_path = os.getenv("TESSERACT_PATH", r"C:\Program Files\Tesseract-OCR\tesseract.exe")
pytesseract.pytesseract.tesseract_cmd = tesseract_path

# ── OpenAI client ─────────────────────────────────────────────────────────────
_openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
_GPT_MODEL     = "gpt-4o-mini"

# ══════════════════════════════════════════════════════════════════════════════
# Internal helpers
# ══════════════════════════════════════════════════════════════════════════════

def _image_to_base64(image_bytes: bytes) -> str:
    """Upscale if small, re-encode as JPEG, return base64 string."""
    image = Image.open(io.BytesIO(image_bytes))
    w, h = image.size
    if w < 1000:
        scale = 1000 / w
        image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    image.convert("RGB").save(buf, format="JPEG", quality=90)
    return base64.standard_b64encode(buf.getvalue()).decode("utf-8")


def _openai_vision(image_bytes: bytes, prompt: str) -> str:
    """Send image + prompt to GPT-4o Vision. Returns '' on any error."""
    if not os.getenv("OPENAI_API_KEY"):
        return ""
    try:
        b64 = _image_to_base64(image_bytes)
        response = _openai_client.chat.completions.create(
            model=_GPT_MODEL,
            max_tokens=512,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{b64}",
                                "detail": "high",
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
        return response.choices[0].message.content.strip()
    except Exception:
        return ""


def _parse_json_response(text: str) -> dict:
    """Extract JSON from GPT response. Handles ```json fences."""
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```", "", text)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
    return {}


# ══════════════════════════════════════════════════════════════════════════════
# Tesseract (raw OCR — used only in fallbacks)
# ══════════════════════════════════════════════════════════════════════════════

def extract_text_from_image(image_bytes: bytes, psm: int = 3) -> str:
    """Raw Tesseract OCR → uppercase text."""
    image = Image.open(io.BytesIO(image_bytes))
    if image.mode != "RGB":
        image = image.convert("RGB")
    w, h = image.size
    if w < 1000:
        scale = 1000 / w
        image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    try:
        text = pytesseract.image_to_string(image, lang="eng",
                                           config=f"--psm {psm} --oem 3")
        return text.upper()
    except Exception:
        return ""


# ══════════════════════════════════════════════════════════════════════════════
# Aadhaar — ALL fields via GPT-4o Vision (one API call)
# ══════════════════════════════════════════════════════════════════════════════

_AADHAAR_PROMPT = """
This is an Indian Aadhaar identity card. The card is bilingual (English + a regional language).
Extract ONLY the English text and respond with ONLY a valid JSON object, no explanation.

Fields to extract:
- aadhaar_number: The 12-digit Aadhaar number (digits only, no spaces). Example: "123456789012".
- name: Card holder's full name in English exactly as printed. Do NOT swap word order. Example: "Nakrani Ayushi Bhupatbhai".
- dob: Date of birth in DD/MM/YYYY format. Example: "15/08/1995".
- gender: "Male" or "Female".
- address: Full address in English as printed, joining all lines with ", ". Include house/flat number, street, locality, city, state, and 6-digit pincode.

Respond ONLY with:
{"aadhaar_number": "...", "name": "...", "dob": "...", "gender": "...", "address": "..."}
If any field is not visible, use null.
"""

def _extract_aadhaar_fields_vision(image_bytes: bytes) -> dict:
    """One GPT-4o call → all five Aadhaar fields."""
    raw = _openai_vision(image_bytes, _AADHAAR_PROMPT)
    if not raw:
        return {}
    return _parse_json_response(raw)


def extract_all_aadhaar_fields(image_bytes: bytes) -> dict:
    """
    Extract all Aadhaar fields in ONE GPT-4o Vision call.
    Use this in your KYC endpoint.

    Returns:
        {
            "aadhaar_number": str | None,
            "name":           str | None,
            "dob":            str | None,
            "gender":         str | None,
            "address":        str | None,
        }
    """
    fields = _extract_aadhaar_fields_vision(image_bytes)

    # If Vision API failed, fall back to Tesseract
    if not fields:
        return {
            "aadhaar_number": _tesseract_aadhaar_number(image_bytes),
            "name":           _tesseract_name_from_aadhaar(image_bytes),
            "dob":            _tesseract_dob(image_bytes),
            "gender":         _tesseract_gender(image_bytes),
            "address":        _tesseract_address_from_aadhaar(image_bytes),
        }

    aadhaar = fields.get("aadhaar_number")
    name    = fields.get("name")
    dob     = fields.get("dob")
    gender  = fields.get("gender")
    address = fields.get("address")

    # Validate each field — fall back to Tesseract individually if LLM returned garbage
    return {
        "aadhaar_number": re.sub(r"\s", "", aadhaar) if aadhaar and re.fullmatch(r"\d{12}", re.sub(r"\s", "", aadhaar)) else _tesseract_aadhaar_number(image_bytes),
        "name":           name.strip().upper()    if name    and len(name.strip()) >= 3                          else _tesseract_name_from_aadhaar(image_bytes),
        "dob":            dob.strip()             if dob     and re.search(r"\d{2}/\d{2}/\d{4}", dob)           else _tesseract_dob(image_bytes),
        "gender":         gender                  if gender  in ("Male", "Female")                               else _tesseract_gender(image_bytes),
        "address":        address.strip().upper() if address and len(address.strip()) >= 10                      else _tesseract_address_from_aadhaar(image_bytes),
    }


# Convenience wrappers (keep same function signatures as before)
def extract_aadhaar_from_image(image_bytes: bytes) -> str | None:
    return extract_all_aadhaar_fields(image_bytes).get("aadhaar_number")

def extract_name_from_aadhaar(image_bytes: bytes) -> str | None:
    return extract_all_aadhaar_fields(image_bytes).get("name")

def extract_dob_from_aadhaar(image_bytes: bytes) -> str | None:
    return extract_all_aadhaar_fields(image_bytes).get("dob")

def extract_gender_from_aadhaar(image_bytes: bytes) -> str | None:
    return extract_all_aadhaar_fields(image_bytes).get("gender")

def extract_address_from_aadhaar(image_bytes: bytes) -> str | None:
    return extract_all_aadhaar_fields(image_bytes).get("address")


# ══════════════════════════════════════════════════════════════════════════════
# PAN — ALL fields via GPT-4o Vision (one API call)
# ══════════════════════════════════════════════════════════════════════════════

_PAN_PROMPT = """
This is an Indian PAN (Permanent Account Number) card issued by the Income Tax Department.
Extract the following fields and respond with ONLY a valid JSON object, no explanation.

Fields to extract:
- pan_number: The 10-character PAN in format ABCDE1234F (5 letters, 4 digits, 1 letter). Example: "ABCDE1234F".
- name: Card holder's full name exactly as printed in English. Example: "NAKRANI AYUSHI BHUPATBHAI".

Respond ONLY with:
{"pan_number": "...", "name": "..."}
If any field is not visible, use null.
"""

def _extract_pan_fields_vision(image_bytes: bytes) -> dict:
    """One GPT-4o call → both PAN fields."""
    raw = _openai_vision(image_bytes, _PAN_PROMPT)
    if not raw:
        return {}
    return _parse_json_response(raw)


def extract_all_pan_fields(image_bytes: bytes) -> dict:
    """
    Extract all PAN fields in ONE GPT-4o Vision call.
    Use this in your KYC endpoint.

    Returns:
        {
            "pan_number": str | None,
            "name":       str | None,
        }
    """
    fields = _extract_pan_fields_vision(image_bytes)

    if not fields:
        return {
            "pan_number": _tesseract_pan_number(image_bytes),
            "name":       _tesseract_name_from_pan(image_bytes),
        }

    pan  = fields.get("pan_number")
    name = fields.get("name")

    return {
        "pan_number": pan.strip().upper()  if pan  and re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", pan.strip().upper())  else _tesseract_pan_number(image_bytes),
        "name":       name.strip().upper() if name and len(name.strip()) >= 3                                         else _tesseract_name_from_pan(image_bytes),
    }


# Convenience wrappers
def extract_pan_from_image(image_bytes: bytes) -> str | None:
    return extract_all_pan_fields(image_bytes).get("pan_number")

def extract_name_from_pan(image_bytes: bytes) -> str | None:
    return extract_all_pan_fields(image_bytes).get("name")


# ══════════════════════════════════════════════════════════════════════════════
# Name comparison helper
# ══════════════════════════════════════════════════════════════════════════════

def names_match(registered: str, ocr_extracted: str, threshold: float = 0.5) -> bool:
    """
    Fuzzy name match — handles OCR noise, middle name variations.
    threshold=0.5 → at least half the registered name words must appear in OCR name.
    """
    if not registered or not ocr_extracted:
        return False
    reg_words = set(registered.strip().upper().split())
    ocr_words = set(ocr_extracted.strip().upper().split())
    if not reg_words:
        return False
    matched = reg_words & ocr_words
    return (len(matched) / len(reg_words)) >= threshold


# ══════════════════════════════════════════════════════════════════════════════
# Tesseract fallbacks (used when OPENAI_API_KEY absent or LLM returns garbage)
# ══════════════════════════════════════════════════════════════════════════════

def _tesseract_aadhaar_number(image_bytes: bytes) -> str | None:
    for psm in [6, 3]:
        text    = extract_text_from_image(image_bytes, psm)
        matches = re.findall(r"\b\d{4}\s?\d{4}\s?\d{4}\b", text)
        if matches:
            return matches[0].replace(" ", "")
    return None


def _tesseract_pan_number(image_bytes: bytes) -> str | None:
    for psm in [3, 6]:
        text = extract_text_from_image(image_bytes, psm)
        matches = re.findall(r"\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b", text)
        if matches:
            return matches[0]
        text_fixed = text.replace("I", "1").replace("O", "0")
        matches2   = re.findall(r"\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b", text_fixed)
        if matches2:
            return matches2[0]
    return None


def _tesseract_dob(image_bytes: bytes) -> str | None:
    for psm in [6, 3]:
        text    = extract_text_from_image(image_bytes, psm)
        matches = re.findall(r"\b(\d{2}/\d{2}/\d{4})\b", text)
        if matches:
            return matches[0]
    return None


def _tesseract_gender(image_bytes: bytes) -> str | None:
    for psm in [6, 3]:
        text = extract_text_from_image(image_bytes, psm)
        if re.search(r"\bFEMALE\b", text): return "Female"
        if re.search(r"\bMALE\b",   text): return "Male"
    return None


def _clean_name_line(line: str) -> str:
    return re.sub(r"[^A-Za-z\s]", "", line).strip().upper()

_NAME_SKIP = {
    "GOVERNMENT", "OF", "INDIA", "UIDAI", "AADHAAR", "UNIQUE",
    "AUTHORITY", "NAME", "DOB", "DATE", "BIRTH", "MALE", "FEMALE",
    "INCOME", "TAX", "DEPARTMENT", "GOVT", "PERMANENT", "ACCOUNT",
    "NUMBER", "CARD", "PAN", "SIGNATURE", "ADDRESS", "GENDER",
}

def _is_valid_name(candidate: str) -> bool:
    clean = _clean_name_line(candidate)
    if len(clean) < 3: return False
    if not re.match(r"^[A-Z][A-Z\s]+$", clean): return False
    if set(clean.split()).issubset(_NAME_SKIP): return False
    return True


def _tesseract_name_from_aadhaar(image_bytes: bytes) -> str | None:
    for psm in [3, 6]:
        text  = extract_text_from_image(image_bytes, psm)
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        for i, line in enumerate(lines):
            if re.search(r"/\s*NAME", line.upper()):
                for j in range(i + 1, min(i + 7, len(lines))):
                    candidate = lines[j].rstrip("|").strip()
                    clean     = _clean_name_line(candidate)
                    if _is_valid_name(clean):
                        return clean
    for psm in [6, 3]:
        text  = extract_text_from_image(image_bytes, psm)
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        dob_idx = None
        for i, line in enumerate(lines):
            if re.search(r"\b\d{2}/\d{2}/\d{4}\b", line) or \
               re.search(r"\bDOB\b|\bDATE OF BIRTH\b", line.upper()):
                dob_idx = i
                break
        if dob_idx:
            for i in range(dob_idx - 1, max(dob_idx - 6, -1), -1):
                candidate = lines[i].rstrip("|").strip()
                clean     = _clean_name_line(candidate)
                if _is_valid_name(clean):
                    return clean
    return None


def _preprocess_aadhaar_image(image: Image.Image) -> Image.Image:
    arr = np.array(image.convert("RGB")).astype(np.float32)
    R, G, B = arr[:,:,0], arr[:,:,1], arr[:,:,2]
    is_watermark = (R > G + 20) & (R > B + 20) & (R > 160)
    arr[is_watermark] = [255, 255, 255]
    ch_rg = np.abs(arr[:,:,0] - arr[:,:,1])
    ch_gb = np.abs(arr[:,:,1] - arr[:,:,2])
    is_hindi_gray = ((arr[:,:,0] > 100) & (arr[:,:,0] < 195) &
                     (arr[:,:,1] > 100) & (arr[:,:,1] < 195) &
                     (arr[:,:,2] > 100) & (arr[:,:,2] < 195) &
                     (ch_rg < 25) & (ch_gb < 25))
    arr[is_hindi_gray] = [255, 255, 255]
    result = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
    w, h = result.size
    if w < 1200:
        scale = 1200 / w
        result = result.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    return result


def _tesseract_address_from_aadhaar(image_bytes: bytes) -> str | None:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    try:
        data = pytesseract.image_to_data(
            image, lang="eng", config="--psm 3 --oem 3",
            output_type=pytesseract.Output.DICT
        )
        img_w, img_h = image.size
        addr_y_bottom = None
        for i, word in enumerate(data["text"]):
            if re.search(r"^addr", word, re.IGNORECASE) and data["conf"][i] > 50:
                if data["top"][i] < img_h * 0.6:
                    addr_y_bottom = data["top"][i] + data["height"][i]
                    break
        pin_y_bottom = None
        for i, word in enumerate(data["text"]):
            if re.search(r"^\d{6}$", word.strip()) and data["conf"][i] > 40:
                y = data["top"][i]
                if addr_y_bottom and y > addr_y_bottom and y < img_h * 0.65:
                    pin_y_bottom = y + data["height"][i]
                    break
        if addr_y_bottom is not None:
            crop_top    = addr_y_bottom + 2
            crop_bottom = (pin_y_bottom + 10) if pin_y_bottom else min(addr_y_bottom + 150, img_h)
            crop_left   = int(img_w * 0.20)
            crop_right  = int(img_w * 0.82)
            if crop_bottom > crop_top + 10 and crop_right > crop_left + 50:
                addr_crop = image.crop((crop_left, crop_top, crop_right, crop_bottom))
                cw, ch = addr_crop.size
                scale   = max(1, int(600 / cw))
                addr_crop = addr_crop.resize((cw * scale, ch * scale), Image.LANCZOS)
                for psm in [6, 4]:
                    text = pytesseract.image_to_string(
                        addr_crop, lang="eng", config=f"--psm {psm} --oem 3"
                    )
                    lines = [l.strip() for l in text.splitlines() if l.strip()]
                    clean_lines = []
                    for ln in lines:
                        ln = re.sub(r"[^A-Za-z0-9\s,\-\.#/]", " ", ln)
                        ln = re.sub(r"\s{2,}", " ", ln).strip().upper()
                        ln = ln.rstrip(",").strip()
                        if len(ln) >= 3:
                            clean_lines.append(ln)
                    if clean_lines:
                        return ", ".join(clean_lines)
    except Exception:
        pass
    try:
        cleaned_image = _preprocess_aadhaar_image(image)
        def _clean_line(raw):
            if "/" in raw:
                parts = raw.split("/", 1)
                if re.search(r"[^\x00-\x7F]", parts[0]):
                    raw = parts[1].strip()
            clean = re.sub(r"[^A-Za-z0-9\s,\-\.#/]", " ", raw)
            return re.sub(r"\s{2,}", " ", clean).strip().upper()
        for psm in [6, 3]:
            text  = pytesseract.image_to_string(cleaned_image, lang="eng",
                                                config=f"--psm {psm} --oem 3")
            lines = [l.strip() for l in text.splitlines() if l.strip()]
            pin_idx = None
            for i, line in enumerate(lines):
                clean = _clean_line(line)
                if re.search(r"\b\d{6}\b", clean) and \
                   not re.search(r"\b\d{4}\s?\d{4}\s?\d{4}\b", line):
                    pin_idx = i
                    break
            if pin_idx is not None:
                _STOP = re.compile(
                    r"\b(GENDER|DOB|DATE OF BIRTH|MALE|FEMALE|NAME|AADHAAR|"
                    r"GOVERNMENT|UNIQUE|AUTHORITY|UIDAI)\b", re.IGNORECASE)
                collected = [_clean_line(lines[pin_idx])]
                for i in range(pin_idx - 1, max(pin_idx - 8, -1), -1):
                    raw   = lines[i]
                    clean = _clean_line(raw)
                    if _STOP.search(clean): break
                    if re.search(r"\b\d{4}\s?\d{4}\s?\d{4}\b", raw): break
                    has_letters = bool(re.search(r"[A-Z]{3,}", clean))
                    words       = clean.split()
                    short_ratio = sum(1 for w in words if len(w) <= 2) / max(len(words), 1)
                    if has_letters and short_ratio < 0.5:
                        collected.insert(0, clean)
                if collected:
                    return ", ".join(collected)
    except Exception:
        pass
    for psm in [6, 3]:
        text  = extract_text_from_image(image_bytes, psm)
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        pin_idx = None
        for i, line in enumerate(lines):
            if re.search(r"\b\d{6}\b", line) and \
               not re.search(r"\b\d{4}\s?\d{4}\s?\d{4}\b", line):
                pin_idx = i
                break
        if pin_idx is not None:
            _STOP = re.compile(
                r"\b(GENDER|DOB|DATE OF BIRTH|MALE|FEMALE|NAME|AADHAAR|"
                r"GOVERNMENT|UNIQUE|AUTHORITY|UIDAI)\b", re.IGNORECASE)
            addr_lines = []
            capture = False
            for i, line in enumerate(lines):
                if re.search(r"\bADDRESS\b", line, re.I):
                    capture = True
                    continue
                if capture:
                    if i > pin_idx: break
                    clean = re.sub(r"[^A-Za-z0-9\s,\-\.#/]", " ", line)
                    clean = re.sub(r"\s{2,}", " ", clean).strip().upper()
                    if len(clean) >= 3:
                        addr_lines.append(clean)
            if addr_lines:
                return ", ".join(addr_lines)
    return None


def _tesseract_name_from_pan(image_bytes: bytes) -> str | None:
    for psm in [3, 6]:
        text  = extract_text_from_image(image_bytes, psm)
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        pan_idx = None
        for i, line in enumerate(lines):
            if re.search(r"\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b", line) or \
               re.search(r"\b[A-Z]{5}[0-9IO]{4}[A-Z]{1}\b", line):
                pan_idx = i
                break
        if pan_idx is not None:
            for i in range(pan_idx + 1, min(pan_idx + 5, len(lines))):
                if re.search(r"/\s*NAME", lines[i].upper()):
                    for j in range(i + 1, min(i + 3, len(lines))):
                        candidate = lines[j].rstrip("'").strip()
                        clean     = _clean_name_line(candidate)
                        if _is_valid_name(clean):
                            return clean
            for i in range(pan_idx + 1, min(pan_idx + 6, len(lines))):
                candidate = lines[i].rstrip("'").strip()
                clean     = _clean_name_line(candidate)
                if _is_valid_name(clean):
                    return clean
    for psm in [3, 6]:
        text  = extract_text_from_image(image_bytes, psm)
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        for i, line in enumerate(lines):
            if "INCOME TAX" in line.upper() or "PERMANENT ACCOUNT" in line.upper():
                for j in range(i + 1, min(i + 8, len(lines))):
                    candidate = lines[j].rstrip("'").strip()
                    clean     = _clean_name_line(candidate)
                    if _is_valid_name(clean):
                        return clean
    return None


# ══════════════════════════════════════════════════════════════════════════════
# Document Type Validator — verify before extraction
# ══════════════════════════════════════════════════════════════════════════════

_VALIDATE_PROMPT = {
    "aadhaar": """You are a KYC document validator for an Indian NBFC.
    Look at this image and decide if it is a genuine Indian Aadhaar card.

    Validation rules:
    - REQUIRED: A 12-digit Aadhaar number must be visible
    - REQUIRED: A person's name must be visible
    - OPTIONAL: UIDAI logo — do NOT reject if not clearly visible due to photo angle or lighting
    - OPTIONAL: QR code — do NOT reject if missing or not visible
    - OPTIONAL: Date of birth

    Only reject if:
    - The image is clearly NOT an Aadhaar card (e.g. PAN card, passport, blank paper)
    - No Aadhaar number is visible at all
    - The image is too blurry to read anything

    Return ONLY this JSON, no explanation:
    {
      "is_valid": true or false,
      "document_detected": "what this actually looks like",
      "confidence": "HIGH / MEDIUM / LOW",
      "rejection_reason": null or "short reason if invalid"
    }""",
    "pan": """You are a KYC document validator for an Indian NBFC.
Look at this image and decide if it is a genuine Indian PAN card.

A genuine PAN card must have:
- "Income Tax Department" header or Government of India text
- A 10-character PAN number (format: ABCDE1234F)
- Holder's name and father's name
- Date of birth

Return ONLY this JSON, no explanation:
{
  "is_valid": true or false,
  "document_detected": "what this actually looks like",
  "confidence": "HIGH / MEDIUM / LOW",
  "rejection_reason": null or "short reason if invalid"
}"""
}


def validate_document_type(image_bytes: bytes, doc_type: str) -> dict:
    """
    Validate that the uploaded image is actually the expected document.
    doc_type: "aadhaar" or "pan"

    Returns:
        {
            "is_valid": bool,
            "document_detected": str,
            "confidence": "HIGH"|"MEDIUM"|"LOW",
            "rejection_reason": str | None
        }
    """
    if not os.getenv("OPENAI_API_KEY"):
        # No API key — skip validation, allow through
        return {"is_valid": True, "skipped": True}

    prompt = _VALIDATE_PROMPT.get(doc_type)
    if not prompt:
        return {"is_valid": True, "skipped": True}

    raw = _openai_vision(image_bytes, prompt)
    if not raw:
        return {"is_valid": False, "rejection_reason": "Could not read the uploaded image."}

    result = _parse_json_response(raw)
    if not result:
        return {"is_valid": False, "rejection_reason": "Could not verify document type."}

    return result
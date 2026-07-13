from fastapi import APIRouter, HTTPException, UploadFile, File , Form
from app.services.ocr_service import (
    extract_aadhaar_from_image, extract_name_from_aadhaar,
    extract_pan_from_image, extract_name_from_pan,
    extract_dob_from_aadhaar, extract_gender_from_aadhaar,
    extract_address_from_aadhaar,
)
import time
from app.services.pdf_decrypt import decrypt_pdf
from app.services.bank_statement_service import extract_bank_statement
from app.services.salary_slip_service import extract_salary_slip
from app.services.itr_service import extract_itr

from app.services.ocr_service import (
    validate_document_type,          # ← new
    extract_all_aadhaar_fields,      # ← use combined function
    extract_all_pan_fields,
    names_match,

)
import asyncio
router   = APIRouter()
MAX_SIZE = 5 * 1024 * 1024   # 5MB


# @router.post("/extract-aadhaar")
# async def extract_aadhaar(aadhaar_image: UploadFile = File(...)):
#     content = await aadhaar_image.read()
#     if len(content) > MAX_SIZE:
#         raise HTTPException(400, "File too large. Max 5MB.")
#
#     aadhaar_number = extract_aadhaar_from_image(content)
#     print("=== AADHAAR OCR ===")
#     print("aadhaar_number:", aadhaar_number)
#     print("name:", extract_name_from_aadhaar(content))
#     print("dob:", extract_dob_from_aadhaar(content))
#     print("gender:", extract_gender_from_aadhaar(content))
#     print("address:", extract_address_from_aadhaar(content))
#
#     return {
#         "aadhaar_number": aadhaar_number,
#         "name": extract_name_from_aadhaar(content),
#         "dob": extract_dob_from_aadhaar(content),
#         "gender": extract_gender_from_aadhaar(content),
#         "address": extract_address_from_aadhaar(content),
#         "found": aadhaar_number is not None,
#     }

# @router.post("/extract-pan")
# async def extract_pan(pan_image: UploadFile = File(...)):
#     content = await pan_image.read()
#     if len(content) > MAX_SIZE:
#         raise HTTPException(400, "File too large. Max 5MB.")
#
#     pan_number = extract_pan_from_image(content)
#     print("=== PAN OCR ===")
#     print("pan_number:", pan_number)
#     print("name:", extract_name_from_pan(content))
#
#     return {
#         "pan_number": pan_number,
#         "name": extract_name_from_pan(content),
#         "found": pan_number is not None,
#     }

@router.post("/extract-aadhaar")
async def extract_aadhaar(aadhaar_image: UploadFile = File(...)):
    content = await aadhaar_image.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "File too large. Max 5MB.")

    loop = asyncio.get_event_loop()

    # Step 1 — validate document type first
    print("\n🔍 Validating Aadhaar card...")
    validation = await loop.run_in_executor(
        None, validate_document_type, content, "aadhaar"
    )
    print(f"   Valid: {validation.get('is_valid')} | Detected: {validation.get('document_detected')} | Confidence: {validation.get('confidence')}")

    if not validation.get("is_valid") and not validation.get("skipped"):
        reason = validation.get("rejection_reason", "The uploaded image does not appear to be an Aadhaar card.")
        print(f"   ❌ REJECTED: {reason}")
        raise HTTPException(422, f"Aadhaar validation failed: {reason}")

    print("   ✅ Aadhaar validated — extracting fields...")

    # Step 2 — extract all fields in one GPT call
    fields = await loop.run_in_executor(
        None, extract_all_aadhaar_fields, content
    )
    print(f"   Extracted: {fields}")

    # Check if extraction returned all nulls
    if not any(fields.values()):
        raise HTTPException(422, "Could not extract data from Aadhaar card. Please upload a clearer image.")

    return {
        "aadhaar_number": fields.get("aadhaar_number"),
        "name":           fields.get("name"),
        "dob":            fields.get("dob"),
        "gender":         fields.get("gender"),
        "address":        fields.get("address"),
        "found":          fields.get("aadhaar_number") is not None,
    }

@router.post("/extract-pan")
async def extract_pan(pan_image: UploadFile = File(...)):
    content = await pan_image.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "File too large. Max 5MB.")

    loop = asyncio.get_event_loop()

    # Step 1 — validate document type
    print("\n🔍 Validating PAN card...")
    validation = await loop.run_in_executor(
        None, validate_document_type, content, "pan"
    )
    print(f"   Valid: {validation.get('is_valid')} | Detected: {validation.get('document_detected')} | Confidence: {validation.get('confidence')}")

    if not validation.get("is_valid") and not validation.get("skipped"):
        reason = validation.get("rejection_reason", "The uploaded image does not appear to be a PAN card.")
        print(f"   ❌ REJECTED: {reason}")
        raise HTTPException(422, f"PAN validation failed: {reason}")

    print("   ✅ PAN validated — extracting fields...")

    # Step 2 — extract
    fields = await loop.run_in_executor(
        None, extract_all_pan_fields, content
    )
    print(f"   Extracted: {fields}")

    if not any(fields.values()):
        raise HTTPException(422, "Could not extract data from PAN card. Please upload a clearer image.")

    return {
        "pan_number": fields.get("pan_number"),
        "name":       fields.get("name"),
        "found":      fields.get("pan_number") is not None,
    }

@router.post("/extract-kyc-parallel")
async def extract_kyc_parallel(
    aadhaar_image: UploadFile = File(...),
    pan_image:     UploadFile = File(...),
):
    """
    Validate + extract Aadhaar and PAN in parallel.
    Cuts KYC time from ~8s (sequential) to ~4s (parallel).
    """
    aadhaar_bytes = await aadhaar_image.read()
    pan_bytes     = await pan_image.read()

    if len(aadhaar_bytes) > MAX_SIZE:
        raise HTTPException(400, "Aadhaar file too large. Max 5MB.")
    if len(pan_bytes) > MAX_SIZE:
        raise HTTPException(400, "PAN file too large. Max 5MB.")

    loop = asyncio.get_event_loop()

    print("\n⚡ Validating Aadhaar + PAN in parallel...")
    t_start = time.time()

    def _process_aadhaar():
        v = validate_document_type(aadhaar_bytes, "aadhaar")
        if not v.get("is_valid") and not v.get("skipped"):
            return {"error": v.get("rejection_reason", "Invalid Aadhaar card.")}
        fields = extract_all_aadhaar_fields(aadhaar_bytes)
        return {"validation": v, **fields}

    def _process_pan():
        v = validate_document_type(pan_bytes, "pan")
        if not v.get("is_valid") and not v.get("skipped"):
            return {"error": v.get("rejection_reason", "Invalid PAN card.")}
        fields = extract_all_pan_fields(pan_bytes)
        return {"validation": v, **fields}

    # Run both in parallel
    aadhaar_result, pan_result = await asyncio.gather(
        loop.run_in_executor(None, _process_aadhaar),
        loop.run_in_executor(None, _process_pan),
    )

    elapsed = round(time.time() - t_start, 1)
    print(f"⚡ Both KYC docs processed in {elapsed}s (parallel)")

    # Handle errors
    if "error" in aadhaar_result:
        raise HTTPException(422, f"Aadhaar validation failed: {aadhaar_result['error']}")
    if "error" in pan_result:
        raise HTTPException(422, f"PAN validation failed: {pan_result['error']}")

    # Name cross-check — Aadhaar name vs PAN name
    from app.services.ocr_service import names_match
    name_matched = names_match(
        aadhaar_result.get("name", ""),
        pan_result.get("name", "")
    )
    if not name_matched:
        print(f"   ⚠️ Name mismatch: Aadhaar='{aadhaar_result.get('name')}' PAN='{pan_result.get('name')}'")

    return {
        "aadhaar": {
            "aadhaar_number": aadhaar_result.get("aadhaar_number"),
            "name":           aadhaar_result.get("name"),
            "dob":            aadhaar_result.get("dob"),
            "gender":         aadhaar_result.get("gender"),
            "address":        aadhaar_result.get("address"),
            "found":          aadhaar_result.get("aadhaar_number") is not None,
        },
        "pan": {
            "pan_number": pan_result.get("pan_number"),
            "name":       pan_result.get("name"),
            "found":      pan_result.get("pan_number") is not None,
        },
        "name_matched":      name_matched,
        "processing_time_s": elapsed,
    }

@router.post("/extract-bank-statement")
async def extract_bank_statement_route(
    file: UploadFile = File(...),
    password: str = Form(default="")
):
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large. Max 10MB.")

    # Decrypt if password-protected
    try:
        pdf_bytes = decrypt_pdf(content, password or None)
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Extract via GPT-4o-mini
    result = extract_bank_statement(pdf_bytes)
    if "error" in result:
        raise HTTPException(422, result["error"])

    return result

@router.post("/extract-salary-slip")
async def extract_salary_slip_route(salary_slip: UploadFile = File(...)):
    content = await salary_slip.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "File too large. Max 5MB.")

    result = extract_salary_slip(content, content_type=salary_slip.content_type)
    if "error" in result:
        raise HTTPException(422, result["error"])

    print("=== SALARY SLIP EXTRACTION ===")
    print(result)

    return result

@router.post("/extract-itr")
async def extract_itr_route(
    file: UploadFile = File(...),
    password: str = Form(default="")
):
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large. Max 10MB.")

    # Decrypt if password-protected
    try:
        pdf_bytes = decrypt_pdf(content, password or None)
    except ValueError as e:
        raise HTTPException(400, str(e))

    result = extract_itr(pdf_bytes, content_type=file.content_type)
    if "error" in result:
        raise HTTPException(422, result["error"])

    print("=== ITR EXTRACTION ===")
    print(result)

    return result
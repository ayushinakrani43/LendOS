#
#
# from fastapi import APIRouter, HTTPException, UploadFile, File, Form
# from datetime import datetime
# from typing import Optional
# import base64
# import re
#
# GST_PATTERN      = re.compile(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')
# NBFC_REG_PATTERN = re.compile(r'^[A-Z]-\d{2}\.\d{5}$')
#
# from app.models.nbfc_model import NBFCLoginRequest
# from app.core.database import database
# from app.core.auth import hash_password, verify_password, create_access_token
#
# router = APIRouter()
#
#
# # ─── REGISTER ─────────────────────────────────────────────────────────────────
#
# @router.post("/register")
# async def register_nbfc(
#     company_name:        str                  = Form(...),
#     company_type:        str                  = Form(""),
#     registration_number: str                  = Form(...),
#     gst_number:          str                  = Form(...),
#     email:               str                  = Form(...),
#     mobile:              str                  = Form(...),
#     city:                str                  = Form(""),
#     state:               str                  = Form(...),
#     password:            str                  = Form(...),
#     logo:                Optional[UploadFile] = File(None),
# ):
#     # ── Normalize ────────────────────────────────────────────────────────────
#     registration_number = registration_number.strip().upper()
#     gst_number           = gst_number.strip().upper()
#
#     # ── Format validation ───────────────────────────────────────────────────
#     if not NBFC_REG_PATTERN.match(registration_number):
#         raise HTTPException(400, "Invalid NBFC registration number format. Expected format: N-14.03112")
#
#     if not GST_PATTERN.match(gst_number):
#         raise HTTPException(400, "Invalid GSTIN format. Expected format: 22AAAAA0000A1Z5")
#
#     # ── Duplicate checks ──────────────────────────────────────────────────────
#     if await database.fetch_one("SELECT id FROM nbfcs WHERE email = :e", {"e": email}):
#         raise HTTPException(400, "An account with this email already exists. Please sign in instead.")
#
#     if await database.fetch_one("SELECT id FROM nbfcs WHERE registration_number = :r", {"r": registration_number}):
#         raise HTTPException(400, "This NBFC registration number is already registered.")
#
#     if await database.fetch_one("SELECT id FROM nbfcs WHERE gst_number = :g", {"g": gst_number}):
#         raise HTTPException(400, "This GSTIN is already registered.")
#
#     # ── Logo — optional (store as base64 data URL) ────────────────────────────
#     logo_url = None
#     if logo and logo.filename:
#         logo_bytes = await logo.read()
#         if len(logo_bytes) > 2 * 1024 * 1024:
#             raise HTTPException(400, "Logo file too large. Max 2 MB allowed.")
#         if logo.content_type not in {"image/png", "image/jpeg", "image/jpg"}:
#             raise HTTPException(400, "Logo must be PNG or JPG.")
#         b64      = base64.b64encode(logo_bytes).decode("utf-8")
#         logo_url = f"data:{logo.content_type};base64,{b64}"
#
#     # ── Insert ────────────────────────────────────────────────────────────────
#     result = await database.fetch_one(
#         """INSERT INTO nbfcs
#                (company_name, company_type, registration_number, gst_number,
#                 email, mobile, city, state, hashed_password,
#                 status, brand_color, logo_url)
#            VALUES
#                (:company_name, :company_type, :registration_number, :gst_number,
#                 :email, :mobile, :city, :state, :hashed_password,
#                 'active', '#1b5068', :logo_url)
#            RETURNING id, company_name""",
#         {
#             "company_name":        company_name,
#             "company_type":        company_type or "NBFC – Personal loan",
#             "registration_number": registration_number,
#             "gst_number":          gst_number,
#             "email":               email,
#             "mobile":              mobile,
#             "city":                city or "",
#             "state":               state,
#             "hashed_password":     hash_password(password),
#             "logo_url":            logo_url,
#         }
#     )
#
#     token = create_access_token({
#         "nbfc_id": result["id"],
#         "email":   email,
#         "role":    "nbfc",
#     })
#
#     return {
#         "message":      "NBFC registered successfully.",
#         "access_token": token,
#         "token_type":   "bearer",
#         "nbfc_id":      result["id"],
#         "company_name": result["company_name"],
#     }
#
#
# # ─── LOGIN ────────────────────────────────────────────────────────────────────
#
# @router.post("/login")
# async def login_nbfc(data: NBFCLoginRequest):
#     nbfc = await database.fetch_one("SELECT * FROM nbfcs WHERE email = :e", {"e": data.email})
#     if not nbfc:
#         raise HTTPException(401, "Invalid email or password.")
#
#     if not verify_password(data.password, nbfc["hashed_password"]):
#         raise HTTPException(401, "Invalid email or password.")
#
#     if nbfc["status"] == "suspended":
#         raise HTTPException(403, "Your account has been suspended. Contact support.")
#
#     await database.execute(
#         "UPDATE nbfcs SET last_login = :now WHERE id = :id",
#         {"now": datetime.utcnow(), "id": nbfc["id"]}
#     )
#
#     token = create_access_token({
#         "nbfc_id": nbfc["id"],
#         "email":   nbfc["email"],
#         "role":    "nbfc",
#     })
#
#     return {
#         "access_token": token,
#         "token_type":   "bearer",
#         "nbfc_id":      nbfc["id"],
#         "company_name": nbfc["company_name"],
#     }
#
#
# # ─── LIVE DUPLICATE CHECKS (called while user is typing) ─────────────────────
#
# @router.get("/check-email/{email}")
# async def check_email(email: str):
#     row = await database.fetch_one("SELECT id FROM nbfcs WHERE email = :e", {"e": email})
#     return {"available": row is None}
#
#
# @router.get("/check-reg/{reg_number}")
# async def check_reg(reg_number: str):
#     row = await database.fetch_one("SELECT id FROM nbfcs WHERE registration_number = :r", {"r": reg_number})
#     return {"available": row is None}
#
#
# @router.get("/check-gst/{gst:path}")
# async def check_gst(gst: str):
#     if not gst.strip():
#         return {"available": True}
#     row = await database.fetch_one(
#         "SELECT id FROM nbfcs WHERE gst_number = :g AND gst_number != ''", {"g": gst.strip()}
#     )
#     return {"available": row is None}
#
#
# # ─── PROFILE ──────────────────────────────────────────────────────────────────
#
# @router.get("/profile")
# async def get_profile(nbfc_id: int):
#     nbfc = await database.fetch_one(
#         """SELECT id, company_name, company_type, registration_number, gst_number,
#                   email, mobile, city, state, status, logo_url, brand_color,
#                   created_at, last_login
#            FROM nbfcs WHERE id = :id""",
#         {"id": nbfc_id}
#     )
#     if not nbfc:
#         raise HTTPException(404, "NBFC not found.")
#     return dict(nbfc)
#
#
# # ─── LIST ALL NBFCs (for borrower browse page) ────────────────────────────────
#
# @router.get("/list")
# async def list_nbfcs():
#     """Returns all active NBFCs — used by borrower to choose their NBFC."""
#     rows = await database.fetch_all(
#         """SELECT id, company_name, company_type, city, state,
#                   logo_url, interest_rate, min_loan_amount,
#                   max_loan_amount, min_credit_score
#            FROM nbfcs WHERE status = 'active'
#            ORDER BY company_name"""
#     )
#     return [dict(r) for r in rows]

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from datetime import datetime
from typing import Optional, Dict
from pydantic import BaseModel
import base64
import re

GST_PATTERN = re.compile(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')
NBFC_REG_PATTERN = re.compile(r'^[A-Z]-\d{2}\.\d{5}$')

from app.models.nbfc_model import NBFCLoginRequest
from app.core.database import database
from app.core.auth import hash_password, verify_password, create_access_token
from app.services.email_service import send_password_reset_email, generate_otp

router = APIRouter()

# ─── IN-MEMORY OTP STORAGE ────────────────────────────────────────────────────
nbfc_otp_storage: Dict[str, str] = {}


# ─── PYDANTIC MODELS ──────────────────────────────────────────────────────────
class NBFCForgotPasswordRequest(BaseModel):
    email: str


class NBFCResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str


# ─── REGISTER ─────────────────────────────────────────────────────────────────

@router.post("/register")
async def register_nbfc(
        company_name: str = Form(...),
        company_type: str = Form(""),
        registration_number: str = Form(...),
        gst_number: str = Form(...),
        email: str = Form(...),
        mobile: str = Form(...),
        city: str = Form(""),
        state: str = Form(...),
        password: str = Form(...),
        logo: Optional[UploadFile] = File(None),
):
    # ── Normalize ────────────────────────────────────────────────────────────
    registration_number = registration_number.strip().upper()
    gst_number = gst_number.strip().upper()

    # ── Format validation ───────────────────────────────────────────────────
    if not NBFC_REG_PATTERN.match(registration_number):
        raise HTTPException(400, "Invalid NBFC registration number format. Expected format: N-14.03112")

    if not GST_PATTERN.match(gst_number):
        raise HTTPException(400, "Invalid GSTIN format. Expected format: 22AAAAA0000A1Z5")

    # ── Duplicate checks ──────────────────────────────────────────────────────
    if await database.fetch_one("SELECT id FROM nbfcs WHERE email = :e", {"e": email}):
        raise HTTPException(400, "An account with this email already exists. Please sign in instead.")

    if await database.fetch_one("SELECT id FROM nbfcs WHERE registration_number = :r", {"r": registration_number}):
        raise HTTPException(400, "This NBFC registration number is already registered.")

    if await database.fetch_one("SELECT id FROM nbfcs WHERE gst_number = :g", {"g": gst_number}):
        raise HTTPException(400, "This GSTIN is already registered.")

    # ── Logo — optional (store as base64 data URL) ────────────────────────────
    logo_url = None
    if logo and logo.filename:
        logo_bytes = await logo.read()
        if len(logo_bytes) > 2 * 1024 * 1024:
            raise HTTPException(400, "Logo file too large. Max 2 MB allowed.")
        if logo.content_type not in {"image/png", "image/jpeg", "image/jpg"}:
            raise HTTPException(400, "Logo must be PNG or JPG.")
        b64 = base64.b64encode(logo_bytes).decode("utf-8")
        logo_url = f"data:{logo.content_type};base64,{b64}"

    # ── Insert ────────────────────────────────────────────────────────────────
    result = await database.fetch_one(
        """INSERT INTO nbfcs
               (company_name, company_type, registration_number, gst_number,
                email, mobile, city, state, hashed_password,
                status, brand_color, logo_url)
           VALUES
               (:company_name, :company_type, :registration_number, :gst_number,
                :email, :mobile, :city, :state, :hashed_password,
                'active', '#1b5068', :logo_url)
           RETURNING id, company_name""",
        {
            "company_name": company_name,
            "company_type": company_type or "NBFC – Personal loan",
            "registration_number": registration_number,
            "gst_number": gst_number,
            "email": email,
            "mobile": mobile,
            "city": city or "",
            "state": state,
            "hashed_password": hash_password(password),
            "logo_url": logo_url,
        }
    )

    token = create_access_token({
        "nbfc_id": result["id"],
        "email": email,
        "role": "nbfc",
    })

    return {
        "message": "NBFC registered successfully.",
        "access_token": token,
        "token_type": "bearer",
        "nbfc_id": result["id"],
        "company_name": result["company_name"],
    }


# ─── LOGIN ────────────────────────────────────────────────────────────────────

@router.post("/login")
async def login_nbfc(data: NBFCLoginRequest):
    nbfc = await database.fetch_one("SELECT * FROM nbfcs WHERE email = :e", {"e": data.email})
    if not nbfc:
        raise HTTPException(401, "Invalid email or password.")

    if not verify_password(data.password, nbfc["hashed_password"]):
        raise HTTPException(401, "Invalid email or password.")

    if nbfc["status"] == "suspended":
        raise HTTPException(403, "Your account has been suspended. Contact support.")

    await database.execute(
        "UPDATE nbfcs SET last_login = :now WHERE id = :id",
        {"now": datetime.utcnow(), "id": nbfc["id"]}
    )

    token = create_access_token({
        "nbfc_id": nbfc["id"],
        "email": nbfc["email"],
        "role": "nbfc",
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "nbfc_id": nbfc["id"],
        "company_name": nbfc["company_name"],
    }


# ─── PASSWORD RESET ───────────────────────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(request: NBFCForgotPasswordRequest):
    email = request.email.strip().lower()

    nbfc = await database.fetch_one(
        "SELECT id, company_name, email FROM nbfcs WHERE LOWER(email) = :email",
        {"email": email}
    )

    if not nbfc:
        raise HTTPException(
            status_code=400,
            detail="If this email is registered, an OTP has been sent."
        )

    otp = generate_otp(length=6)
    nbfc_otp_storage[email] = otp

    try:
        send_password_reset_email(to_email=nbfc["email"], user_name=nbfc["company_name"], otp=otp)
        return {"message": "OTP sent to your email."}
    except Exception as e:
        print(f"Email Sending Error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to send OTP email. Please try again later."
        )


@router.post("/reset-password")
async def reset_password(request: NBFCResetPasswordRequest):
    email = request.email.strip().lower()

    stored_otp = nbfc_otp_storage.get(email)

    if not stored_otp or stored_otp != request.otp.strip():
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OTP."
        )

    hashed_pw = hash_password(request.new_password)

    await database.execute(
        "UPDATE nbfcs SET hashed_password = :ph WHERE LOWER(email) = :email",
        {"ph": hashed_pw, "email": email}
    )

    del nbfc_otp_storage[email]

    return {"message": "Password successfully reset."}


# ─── LIVE DUPLICATE CHECKS (called while user is typing) ─────────────────────

@router.get("/check-email/{email}")
async def check_email(email: str):
    row = await database.fetch_one("SELECT id FROM nbfcs WHERE email = :e", {"e": email})
    return {"available": row is None}


@router.get("/check-reg/{reg_number}")
async def check_reg(reg_number: str):
    row = await database.fetch_one("SELECT id FROM nbfcs WHERE registration_number = :r", {"r": reg_number})
    return {"available": row is None}


@router.get("/check-gst/{gst:path}")
async def check_gst(gst: str):
    if not gst.strip():
        return {"available": True}
    row = await database.fetch_one(
        "SELECT id FROM nbfcs WHERE gst_number = :g AND gst_number != ''", {"g": gst.strip()}
    )
    return {"available": row is None}


# ─── PROFILE ──────────────────────────────────────────────────────────────────

@router.get("/profile")
async def get_profile(nbfc_id: int):
    nbfc = await database.fetch_one(
        """SELECT id, company_name, company_type, registration_number, gst_number,
                  email, mobile, city, state, status, logo_url, brand_color,
                  created_at, last_login
           FROM nbfcs WHERE id = :id""",
        {"id": nbfc_id}
    )
    if not nbfc:
        raise HTTPException(404, "NBFC not found.")
    return dict(nbfc)


# ─── LIST ALL NBFCs (for borrower browse page) ────────────────────────────────

@router.get("/list")
async def list_nbfcs():
    """Returns all active NBFCs — used by borrower to choose their NBFC."""
    rows = await database.fetch_all(
        """SELECT id, company_name, company_type, city, state,
                  logo_url, interest_rate, min_loan_amount,
                  max_loan_amount, min_credit_score
           FROM nbfcs WHERE status = 'active'
           ORDER BY company_name"""
    )
    return [dict(r) for r in rows]
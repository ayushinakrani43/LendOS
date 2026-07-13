

from fastapi import APIRouter, HTTPException , Depends
from datetime import datetime
from app.models.borrower_model import BorrowerRegisterRequest, BorrowerLoginRequest
from app.core.database import database
from app.core.auth import hash_password, verify_password, create_access_token
from app.core.auth import decode_token
from fastapi.security import OAuth2PasswordBearer
import json
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/borrower/login")
router = APIRouter()


# ─── REGISTER ─────────────────────────────────────────────────────────────────

@router.post("/register")
async def register_borrower(data: BorrowerRegisterRequest):

    # 1. Check email
    if await database.fetch_one("SELECT id FROM borrowers WHERE email = :v", {"v": data.email}):
        raise HTTPException(400, "An account with this email already exists.")

    # 2. Check mobile
    if await database.fetch_one("SELECT id FROM borrowers WHERE mobile = :v", {"v": data.mobile}):
        raise HTTPException(400, "An account with this mobile number already exists.")

    # 3. Check aadhaar (if provided)
    if data.aadhaar_number:
        if await database.fetch_one("SELECT id FROM borrowers WHERE aadhaar_number = :v", {"v": data.aadhaar_number}):
            raise HTTPException(400, "This Aadhaar number is already registered.")

    # 4. Check PAN (if provided)
    if data.pan_number:
        if await database.fetch_one("SELECT id FROM borrowers WHERE pan_number = :v", {"v": data.pan_number}):
            raise HTTPException(400, "This PAN number is already registered.")

    # 5. Insert — nbfc_id is NULL at registration (set after scoring)
    result = await database.fetch_one(
        """INSERT INTO borrowers
                       (full_name, email, mobile, hashed_password,
                        aadhaar_number, pan_number,
                        date_of_birth, gender, address,
                        employment_type,
                        kyc_status, loan_status, status)
                   VALUES
                       (:full_name, :email, :mobile, :hashed_password,
                        :aadhaar_number, :pan_number,
                        :date_of_birth, :gender, :address,
                        :employment_type,
                        'pending', 'none', 'active')
           RETURNING id, full_name, email, mobile, kyc_status, loan_status, aadhaar_number, pan_number""",
        {
            "full_name":       data.full_name,
            "email":           data.email,
            "mobile":          data.mobile,
            "hashed_password": hash_password(data.password),
            "aadhaar_number":  data.aadhaar_number or None,
            "pan_number":      data.pan_number or None,
            "date_of_birth": data.date_of_birth or None,
            "gender": data.gender or None,
            "address": data.address or None,
            "employment_type": data.employment_type or None,
        }
    )

    token = create_access_token({
        "borrower_id": result["id"],
        "email":       result["email"],
        "role":        "borrower",
    })

    return {
        "message":        "Account created successfully.",
        "access_token":   token,
        "token_type":     "bearer",
        "borrower_id":    result["id"],
        "full_name":      result["full_name"],
        "email":          result["email"],
        "kyc_status":     result["kyc_status"],
        "loan_status":    result["loan_status"],
        "aadhaar_number": data.aadhaar_number or "",
        "pan_number":     data.pan_number or "",
        "employment_type": data.employment_type or "",
        "next_step": "dashboard",
    }


# ─── LOGIN ────────────────────────────────────────────────────────────────────

@router.post("/login")
async def login_borrower(data: BorrowerLoginRequest):

    borrower = await database.fetch_one(
        "SELECT * FROM borrowers WHERE email = :email", {"email": data.email}
    )
    if not borrower:
        raise HTTPException(401, "Invalid email or password.")

    if not verify_password(data.password, borrower["hashed_password"]):
        raise HTTPException(401, "Invalid email or password.")

    if borrower["status"] == "blocked":
        raise HTTPException(403, "Your account has been blocked. Please contact support.")

    await database.execute(
        "UPDATE borrowers SET last_login = :now WHERE id = :id",
        {"now": datetime.utcnow(), "id": borrower["id"]}
    )

    token = create_access_token({
        "borrower_id": borrower["id"],
        "email":       borrower["email"],
        "role":        "borrower",
    })

    next_step = "dashboard"

    return {
        "access_token":   token,
        "token_type":     "bearer",
        "borrower_id":    borrower["id"],
        "full_name":      borrower["full_name"],
        "email":          borrower["email"],
        "kyc_status":     borrower["kyc_status"],
        "loan_status":    borrower["loan_status"],
        "aadhaar_number": borrower["aadhaar_number"] or "",
        "pan_number":     borrower["pan_number"] or "",
        "employment_type": borrower["employment_type"] or "",
        "nbfc_id":        borrower["nbfc_id"],
        "next_step":      next_step,
        "credit_score": borrower["credit_score"],
        "bank_data": json.loads(borrower["bank_data"]) if borrower["bank_data"] else None,
        "income_data": json.loads(borrower["income_data"]) if borrower["income_data"] else None,
    }


# ─── AVAILABILITY CHECKS ─────────────────────────────────────────────────────

@router.get("/check-email/{email:path}")
async def check_email(email: str):
    row = await database.fetch_one("SELECT id FROM borrowers WHERE LOWER(email) = LOWER(:v)", {"v": email})
    return {"available": row is None}

@router.get("/check-mobile/{mobile}")
async def check_mobile(mobile: str):
    row = await database.fetch_one("SELECT id FROM borrowers WHERE mobile = :v", {"v": mobile})
    return {"available": row is None}

@router.get("/check-aadhaar/{aadhaar}")
async def check_aadhaar(aadhaar: str):
    row = await database.fetch_one("SELECT id FROM borrowers WHERE aadhaar_number = :v", {"v": aadhaar})
    return {"available": row is None}

@router.get("/check-pan/{pan}")
async def check_pan(pan: str):
    row = await database.fetch_one("SELECT id FROM borrowers WHERE UPPER(pan_number) = UPPER(:v)", {"v": pan})
    return {"available": row is None}


# ─── PROFILE ──────────────────────────────────────────────────────────────────
#
# @router.get("/profile")
# async def get_borrower_profile(token: str = Depends(oauth2_scheme)):
#     try:
#         payload = decode_token(token)
#     except Exception:
#         raise HTTPException(401, "Invalid or expired token.")
#
#     if not payload:
#         raise HTTPException(401, "Invalid or expired token.")
#
#     borrower_id = payload.get("borrower_id")
#     if not borrower_id:
#         raise HTTPException(401, "Invalid token payload.")
#
#     borrower = await database.fetch_one(...)
#     if not borrower:
#         raise HTTPException(404, "Borrower not found.")
#     return dict(borrower)

@router.get("/profile")
async def get_borrower_profile(token: str = Depends(oauth2_scheme)):
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token.")

    if not payload:
        raise HTTPException(401, "Invalid or expired token.")

    borrower_id = payload.get("borrower_id")
    if not borrower_id:
        raise HTTPException(401, "Invalid token payload.")

    # ← THIS was missing — replace the literal ...
    borrower = await database.fetch_one(
        """SELECT id, full_name, email, mobile, aadhaar_number, pan_number,
       kyc_status, loan_status, employment_type,
       credit_score, score_factors,
       bank_data, income_data,
       nbfc_id, status, created_at, last_login
FROM borrowers WHERE id = :id""",
        {"id": borrower_id}
    )
    if not borrower:
        raise HTTPException(404, "Borrower not found.")
    return dict(borrower)
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from app.core.database import database
from app.core.auth import decode_token
from app.models.loan_model import LoanApplicationRequest
from fastapi.responses import JSONResponse
from app.services.agreement_service import generate_loan_agreement
from app.services.email_service import send_otp_email, generate_otp, send_disbursement_email_to_nbfc
from datetime import datetime, timedelta , timezone


router = APIRouter(prefix="/api/borrower", tags=["Loan Application"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/borrower/login")


@router.post("/loan-application")
async def submit_loan_application(
    payload: LoanApplicationRequest,
    token: str = Depends(oauth2_scheme),
):
    # ── 1. Auth ──────────────────────────────────────────────────
    try:
        tok = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token.")

    if tok.get("borrower_id") != payload.borrower_id:
        raise HTTPException(403, "Access denied.")

    # ── 2. Check borrower exists + no active loan ─────────────────
    borrower = await database.fetch_one(
        "SELECT id, loan_status FROM borrowers WHERE id = :id",
        {"id": payload.borrower_id}
    )
    if not borrower:
        raise HTTPException(404, "Borrower not found.")
    # if borrower["loan_status"] in ("applied", "approved", "active"):
    #     raise HTTPException(400, "You already have an active or pending loan application.")
    if borrower["loan_status"] in ("pending_agreement", "applied", "approved", "active"):
        existing_row = await database.fetch_one(
            """SELECT id, amount, tenure_months, purpose FROM loan_applications
               WHERE borrower_id = :bid
               AND status IN ('pending', 'applied', 'approved', 'active')
               ORDER BY applied_at DESC LIMIT 1""",
            {"bid": payload.borrower_id}
        )
        if existing_row:
            # If borrower changed amount/tenure/purpose → clear cached agreement so it regenerates
            values_changed = (
                    abs(float(existing_row["amount"]) - payload.loan_amount) > 1 or
                    existing_row["tenure_months"] != payload.tenure_months or
                    existing_row["purpose"] != payload.purpose
            )
            if values_changed:
                await database.execute(
                    """UPDATE loan_applications
                       SET amount = :amount, tenure_months = :tenure,
                           purpose = :purpose, interest_rate = :rate,
                           emi_amount = :emi, approved_amount = :amount,
                           total_interest = :ti,
                           total_payable = :tp, processing_fee_amount = :fee,
                           amount_disbursed = :disbursed,
                           agreement_text = NULL
                       WHERE id = :id""",
                    {
                        "amount": payload.loan_amount,
                        "tenure": payload.tenure_months,
                        "purpose": payload.purpose,
                        "rate": payload.interest_rate,
                        "emi": payload.emi_amount,
                        "ti": payload.total_interest,
                        "tp": payload.total_payable,
                        "fee": payload.processing_fee_amount,
                        "disbursed": payload.amount_disbursed,
                        "id": existing_row["id"],
                    }
                )
            return JSONResponse(status_code=400, content={
                "error": "already_applied",
                "application_id": existing_row["id"],
            })
        else:
            # Stale loan_status — reset and allow fresh application
            await database.execute(
                "UPDATE borrowers SET loan_status = 'none', nbfc_id = NULL WHERE id = :id",
                {"id": payload.borrower_id}
            )
            # Fall through to create new application
    # ── 3. Fetch NBFC ─────────────────────────────────────────────
    nbfc = await database.fetch_one(
        """SELECT id, max_foir_percent, min_loan_amount, max_loan_amount,
                  min_tenure_months, max_tenure_months, status
           FROM nbfcs WHERE id = :id""",
        {"id": payload.nbfc_id}
    )
    if not nbfc or nbfc["status"] != "active":
        raise HTTPException(404, "Lender not found or inactive.")

    # ── 4. Validate loan amount + tenure ─────────────────────────
    if payload.loan_amount < float(nbfc["min_loan_amount"]):
        raise HTTPException(400, f"Minimum loan amount is ₹{int(nbfc['min_loan_amount']):,}.")
    if payload.loan_amount > float(nbfc["max_loan_amount"]):
        raise HTTPException(400, f"Maximum loan amount is ₹{int(nbfc['max_loan_amount']):,}.")
    if payload.tenure_months < nbfc["min_tenure_months"]:
        raise HTTPException(400, f"Minimum tenure is {nbfc['min_tenure_months']} months.")
    if payload.tenure_months > nbfc["max_tenure_months"]:
        raise HTTPException(400, f"Maximum tenure is {nbfc['max_tenure_months']} months.")

    # ── 5. Backend FOIR re-validation ─────────────────────────────
    if payload.monthly_income and payload.monthly_income > 0:
        foir_limit  = float(nbfc["max_foir_percent"] or 50)
        existing    = float(payload.existing_emis or 0)
        safe_emi    = (payload.monthly_income * foir_limit / 100) - existing
        foir_actual = ((existing + payload.emi_amount) / payload.monthly_income) * 100

        if foir_actual > foir_limit + 10:
            r = payload.interest_rate / 1200
            n = payload.tenure_months
            max_safe_loan = safe_emi * ((1 + r) ** n - 1) / (r * (1 + r) ** n)
            raise HTTPException(400, {
                "error": "emi_too_high",
                "detail": f"EMI exceeds safe FOIR limit of {foir_limit}%.",
                "max_safe_loan": round(max_safe_loan),
            })

    # ── 6. Insert loan application ────────────────────────────────
    row = await database.fetch_one(
        """INSERT INTO loan_applications (
               borrower_id, nbfc_id, amount, tenure_months, purpose,
               interest_rate, emi_amount, approved_amount,
               total_interest, total_payable, processing_fee_amount, amount_disbursed,
               monthly_income, existing_emis, safe_emi, foir_at_application,
               status
           ) VALUES (
               :borrower_id, :nbfc_id, :loan_amount, :tenure_months, :purpose,
               :interest_rate, :emi_amount, :loan_amount,
               :total_interest, :total_payable, :processing_fee_amount, :amount_disbursed,
               :monthly_income, :existing_emis, :safe_emi, :foir_at_application,
               'pending'
           ) RETURNING id, applied_at""",
        {
            "borrower_id":           payload.borrower_id,
            "nbfc_id":               payload.nbfc_id,
            "loan_amount":           payload.loan_amount,
            "tenure_months":         payload.tenure_months,
            "purpose":               payload.purpose,
            "interest_rate":         payload.interest_rate,
            "emi_amount":            payload.emi_amount,
            "total_interest":        payload.total_interest,
            "total_payable":         payload.total_payable,
            "processing_fee_amount": payload.processing_fee_amount,
            "amount_disbursed":      payload.amount_disbursed,
            "monthly_income":        payload.monthly_income,
            "existing_emis":         payload.existing_emis,
            "safe_emi":              payload.safe_emi,
            "foir_at_application":   payload.foir_at_application,
        }
    )

    # ── 7. Update borrower status ─────────────────────────────────
    await database.execute(
        "UPDATE borrowers SET loan_status = 'pending_agreement', nbfc_id = :nbfc_id WHERE id = :id",
        {"nbfc_id": payload.nbfc_id, "id": payload.borrower_id}
    )

    return {
        "message":        "Loan application submitted successfully.",
        "application_id": row["id"],
        "applied_at":     str(row["applied_at"]),
    }



@router.get("/loan-application/{application_id}/agreement")
async def get_loan_agreement(
        application_id: int,
        token: str = Depends(oauth2_scheme),
):
    # ── 1. Auth ───────────────────────────────────────────────────────────────
    try:
        tok = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token.")

    # ── 2. Fetch loan application ─────────────────────────────────────────────
    loan = await database.fetch_one(
        """SELECT la.id, la.borrower_id, la.nbfc_id, la.amount, la.tenure_months,
                  la.purpose, la.interest_rate, la.emi_amount,
                  la.total_interest, la.total_payable, la.processing_fee_amount,
                  la.amount_disbursed, la.monthly_income, la.foir_at_application,
                  la.status, la.rejection_reason, la.applied_at, la.agreement_text 
           FROM loan_applications la
           WHERE la.id = :id""",
        {"id": application_id},
    )
    if not loan:
        raise HTTPException(404, "Loan application not found.")

    # ── 3. Verify borrower owns this application ──────────────────────────────
    if tok.get("borrower_id") != loan["borrower_id"]:
        raise HTTPException(403, "Access denied.")

    # ── 4. Fetch borrower details ─────────────────────────────────────────────
    borrower = await database.fetch_one(
        """SELECT full_name, email, mobile, aadhaar_number, pan_number,
                  address, date_of_birth, gender, employment_type, credit_score
           FROM borrowers WHERE id = :id""",
        {"id": loan["borrower_id"]},
    )

    # ── 5. Fetch NBFC details ─────────────────────────────────────────────────
    nbfc = await database.fetch_one(
        """SELECT company_name, registration_number, email, mobile,
                  city, state, interest_rate, processing_fee,
                  late_penalty_flat, grace_period_days
           FROM nbfcs WHERE id = :id""",
        {"id": loan["nbfc_id"]},
    )

    # ── 6. Build response payload (shared by cached + fresh paths) ────────────
    def build_response(agreement_text: str) -> dict:
        return {
            "application_id": application_id,
            "status": loan["status"],
            "rejection_reason": loan["rejection_reason"],
            "agreement_text": agreement_text,
            "loan": {
                "amount": loan["amount"],
                "tenure_months": loan["tenure_months"],
                "interest_rate": loan["interest_rate"],
                "emi_amount": loan["emi_amount"],
                "total_interest": loan["total_interest"],
                "total_payable": loan["total_payable"],
                "processing_fee": loan["processing_fee_amount"],
                "amount_disbursed": loan["amount_disbursed"],
                "purpose": loan["purpose"],
                "applied_at": str(loan["applied_at"]),
            },
            "borrower": {
                "full_name": borrower["full_name"],
                "email": borrower["email"],
                "mobile": borrower["mobile"],
                "pan_number": borrower["pan_number"],
                "credit_score": borrower["credit_score"],
            },
            "nbfc": {
                "company_name": nbfc["company_name"],
                "registration_number": nbfc["registration_number"],
                "city": nbfc["city"],
                "state": nbfc["state"],
            },
        }

    # ── 7. Return cached agreement if already generated ───────────────────────
    if loan["agreement_text"]:
        return build_response(loan["agreement_text"])

    # ── 8. Generate agreement via service (prompt lives in agreement_service.py)
    try:
        agreement_text = generate_loan_agreement(
            loan=dict(loan),
            borrower=dict(borrower),
            nbfc=dict(nbfc),
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        raise HTTPException(500, f"Agreement generation failed: {str(e)}")

    # ── 9. Cache generated agreement in DB ────────────────────────────────────
    await database.execute(
        "UPDATE loan_applications SET agreement_text = :txt WHERE id = :id",
        {"txt": agreement_text, "id": application_id},
    )

    return build_response(agreement_text)

@router.post("/loan-application/{application_id}/accept")
async def accept_loan_agreement(
    application_id: int,
    token: str = Depends(oauth2_scheme),
):
    try:
        tok = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token.")

    loan = await database.fetch_one(
        "SELECT id, borrower_id, status FROM loan_applications WHERE id = :id",
        {"id": application_id}
    )
    if not loan:
        raise HTTPException(404, "Loan application not found.")

    if tok.get("borrower_id") != loan["borrower_id"]:
        raise HTTPException(403, "Access denied.")

    if loan["status"] != "pending":
        raise HTTPException(400, f"Cannot accept agreement in status '{loan['status']}'.")

    await database.execute(
        "UPDATE loan_applications SET status = 'applied' WHERE id = :id",
        {"id": application_id}
    )
    await database.execute(
        "UPDATE borrowers SET loan_status = 'applied' WHERE id = :id",
        {"id": loan["borrower_id"]}
    )

    return {"message": "Agreement accepted. Your application is now under review."}

@router.get("/my-loan")
async def get_my_loan(token: str = Depends(oauth2_scheme)):
    try:
        tok = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token.")

    borrower_id = tok.get("borrower_id")

    loan = await database.fetch_one(
        """SELECT la.id, la.amount, la.tenure_months, la.purpose,
                  la.interest_rate, la.emi_amount, la.total_payable,
                  la.processing_fee_amount, la.amount_disbursed,
                  la.status, la.applied_at,
                  la.rejection_reason, 
                  n.company_name AS nbfc_name
           FROM loan_applications la
           JOIN nbfcs n ON n.id = la.nbfc_id
           WHERE la.borrower_id = :bid
           AND la.status IN ('pending', 'applied', 'approved', 'active', 'disbursed')
           ORDER BY la.applied_at DESC LIMIT 1""",
        {"bid": borrower_id}
    )

    if not loan:
        return {"loan": None}

    return {
        "loan": {
            "id":             loan["id"],
            "nbfc_name":      loan["nbfc_name"],
            "amount":         loan["amount"],
            "tenure_months":  loan["tenure_months"],
            "purpose":        loan["purpose"],
            "interest_rate":  loan["interest_rate"],
            "emi_amount":     loan["emi_amount"],
            "total_payable":  loan["total_payable"],
            "processing_fee": loan["processing_fee_amount"],
            "disbursed":      loan["amount_disbursed"],
            "status":         loan["status"],
            "applied_at":     str(loan["applied_at"]),
            "rejection_reason": loan["rejection_reason"],
        }
    }


@router.post("/loan-application/{application_id}/decline")
async def decline_loan_agreement(
    application_id: int,
    token: str = Depends(oauth2_scheme),
):
    try:
        tok = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token.")

    loan = await database.fetch_one(
        "SELECT id, borrower_id, status FROM loan_applications WHERE id = :id",
        {"id": application_id}
    )
    if not loan:
        raise HTTPException(404, "Loan application not found.")
    if tok.get("borrower_id") != loan["borrower_id"]:
        raise HTTPException(403, "Access denied.")

    if loan["status"] not in ("pending", "rejected"):
        raise HTTPException(400, f"Cannot decline in status '{loan['status']}'.")

        # Mark as declined if borrower is declining a pending agreement
    if loan["status"] == "pending":
        await database.execute(
            "UPDATE loan_applications SET status = 'declined' WHERE id = :id",
            {"id": application_id}
        )

        # Keep record for NBFC audit — only reset borrower status so they can reapply
    await database.execute(
        "UPDATE borrowers SET loan_status = 'none', nbfc_id = NULL WHERE id = :id",
        {"id": loan["borrower_id"]}
    )
    return {"message": "Application declined."}


# ─── Send OTP ─────────────────────────────────────────────────────────────────
@router.post("/loan-application/{app_id}/send-otp")
async def send_signing_otp(
        app_id: int,
        token: str = Depends(oauth2_scheme),
):
    tok = decode_token(token)
    if not tok:
        raise HTTPException(401, "Invalid or expired token.")

    # ── Verify loan ──────────────────────────────────────────────────────────
    loan = await database.fetch_one(
        """SELECT la.id, la.borrower_id, la.status, la.amount,
                  n.company_name as nbfc_name
           FROM loan_applications la
           JOIN nbfcs n ON n.id = la.nbfc_id
           WHERE la.id = :id""",
        {"id": app_id}
    )
    if not loan:
        raise HTTPException(404, "Loan application not found.")
    if loan["borrower_id"] != tok.get("borrower_id"):
        raise HTTPException(403, "Access denied.")
    if loan["status"] != "approved":
        raise HTTPException(400, f"Loan must be approved before signing. Current status: '{loan['status']}'.")

    # ── Get borrower email ───────────────────────────────────────────────────
    borrower = await database.fetch_one(
        "SELECT full_name, email FROM borrowers WHERE id = :id",
        {"id": tok.get("borrower_id")}
    )
    if not borrower or not borrower["email"]:
        raise HTTPException(400, "Borrower email not found.")

    # ── Delete old unused OTPs ───────────────────────────────────────────────
    await database.execute(
        "DELETE FROM loan_otps WHERE loan_id = :loan_id AND is_used = false",
        {"loan_id": app_id}
    )

    # ── Generate + save OTP ──────────────────────────────────────────────────
    otp = generate_otp()
    from datetime import timezone
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    await database.execute(
        """INSERT INTO loan_otps (borrower_id, loan_id, otp_code, expires_at, is_used)
           VALUES (:borrower_id, :loan_id, :otp_code, :expires_at, false)""",
        {
            "borrower_id": tok.get("borrower_id"),
            "loan_id": app_id,
            "otp_code": otp,
            "expires_at": expires_at,
        }
    )

    # ── Send email ───────────────────────────────────────────────────────────
    loan_amount = f"₹{int(loan['amount']):,}"
    try:
        send_otp_email(
            to_email=borrower["email"],
            borrower_name=borrower["full_name"],
            otp=otp,
            loan_amount=loan_amount,
            nbfc_name=loan["nbfc_name"],
        )
    except RuntimeError as e:
        # Email not configured — dev mode
        print(f"[DEV] OTP for {borrower['email']}: {otp}")
        return {
            "message": "Email not configured. OTP shown in dev mode only.",
            "dev_otp": otp,
            "dev_mode": True,
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to send OTP email: {str(e)}")

    # Mask email for response
    parts = borrower["email"].split("@")
    masked = parts[0][:2] + "***@" + parts[1]

    return {
        "message": f"OTP sent to {masked}",
        "expires_in": 600,
        "dev_mode": False,
    }


# ─── Verify OTP + Sign ────────────────────────────────────────────────────────
@router.post("/loan-application/{app_id}/sign")
async def sign_loan_agreement(
        app_id: int,
        otp_code: str,
        token: str = Depends(oauth2_scheme),
):
    tok = decode_token(token)
    if not tok:
        raise HTTPException(401, "Invalid or expired token.")

    # ── Verify loan ──────────────────────────────────────────────────────────
    loan = await database.fetch_one(
        "SELECT id, borrower_id, status FROM loan_applications WHERE id = :id",
        {"id": app_id}
    )
    if not loan:
        raise HTTPException(404, "Loan application not found.")
    if loan["borrower_id"] != tok.get("borrower_id"):
        raise HTTPException(403, "Access denied.")
    if loan["status"] != "approved":
        raise HTTPException(400, f"Loan must be approved before signing. Current status: '{loan['status']}'.")

    # ── Verify OTP ───────────────────────────────────────────────────────────
    otp_row = await database.fetch_one(
        """SELECT id, expires_at, is_used
           FROM loan_otps
           WHERE loan_id    = :loan_id
             AND borrower_id = :borrower_id
             AND otp_code   = :otp_code
             AND (is_used = false OR is_used IS NULL)
           ORDER BY created_at DESC
           LIMIT 1""",
        {
            "loan_id": app_id,
            "borrower_id": tok.get("borrower_id"),
            "otp_code": otp_code.strip(),
        }
    )

    if not otp_row:
        raise HTTPException(400, "Invalid OTP. Please check and try again.")

    expires = otp_row["expires_at"]
    now_utc = datetime.now(timezone.utc)
    # Make expires timezone-aware if it isn't
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now_utc > expires:
        raise HTTPException(400, "OTP has expired. Please request a new one.")

    # ── Mark OTP used ────────────────────────────────────────────────────────
    await database.execute(
        "UPDATE loan_otps SET is_used = true WHERE id = :id",
        {"id": otp_row["id"]}
    )

    # ── Activate loan ────────────────────────────────────────────────────────
    await database.execute(
        "UPDATE loan_applications SET status = 'active' WHERE id = :id",
        {"id": app_id}
    )
    await database.execute(
        "UPDATE borrowers SET loan_status = 'active' WHERE id = :id",
        {"id": tok.get("borrower_id") or tok.get("id")}
    )

    # ── Fetch data for disbursement email ─────────────────────────────────────
    try:
        loan_data = await database.fetch_one(
            """SELECT la.amount, la.amount_disbursed, la.tenure_months,
                      la.interest_rate, la.emi_amount, la.purpose,
                      b.full_name, b.email as borrower_email,
                      b.mobile,
                      n.company_name as nbfc_name,
                      n.email as nbfc_email
               FROM loan_applications la
               JOIN borrowers b ON b.id = la.borrower_id
               JOIN nbfcs n     ON n.id = la.nbfc_id
               WHERE la.id = :id""",
            {"id": app_id}
        )

        # Get borrower bank details from bank_data JSON
        bank_row = await database.fetch_one(
            "SELECT bank_data FROM borrowers WHERE id = :id",
            {"id": tok.get("borrower_id") or tok.get("id")}
        )

        bank_info = {}
        if bank_row and bank_row["bank_data"]:
            import json
            bank_info = json.loads(bank_row["bank_data"])

        # Send disbursement email to NBFC
        send_disbursement_email_to_nbfc(
            to_email=loan_data["nbfc_email"],
            nbfc_name=loan_data["nbfc_name"],
            borrower_name=loan_data["full_name"],
            borrower_mobile=loan_data["mobile"],
            loan_id=app_id,
            loan_amount=loan_data["amount_disbursed"] or loan_data["amount"],
            bank_name=bank_info.get("bank_name", "—"),
            account_number=bank_info.get("account_number", "—"),
            ifsc_code=bank_info.get("ifsc_code", "—"),
            emi_amount=loan_data["emi_amount"],
            tenure_months=loan_data["tenure_months"],
        )
    except Exception as e:
        print(f"[EMAIL ERROR] Disbursement email failed: {e}")
        # Don't block the response if email fails

    return {
        "message": "Agreement signed successfully. Your loan is now active.",
        "application_id": app_id,
    }

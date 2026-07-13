from fastapi import APIRouter, HTTPException, Depends , Query
from fastapi.security import OAuth2PasswordBearer
from datetime import datetime , date
from typing import Optional
from pydantic import BaseModel
from app.services.email_service import send_disbursement_email_to_borrower,send_emi_confirmation_email ,  send_disbursement_email_to_borrower
from app.core.database import database
from app.core.auth import decode_token, hash_password, verify_password
from app.models.emi_model import EMIDisputeRequest, EMIClaimPaymentRequest


router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/nbfc/login")


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class LoanRulesUpdate(BaseModel):
    interest_rate:     float
    min_loan_amount:   int
    max_loan_amount:   int
    min_tenure_months: int
    max_tenure_months: int
    processing_fee:    float
    min_credit_score:  int
    late_penalty_flat: int
    grace_period_days: int
    max_foir_percent:  float = 50.0
    upi_id: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None


class LoanApproveRequest(BaseModel):
    notes: Optional[str] = None


class LoanRejectRequest(BaseModel):
    rejection_reason: str

class DisburseRequest(BaseModel):
    utr_number:        str
    disbursement_mode: str  # NEFT / IMPS / RTGS / UPI

class RateRevisionRequest(BaseModel):
    new_rate: float

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# ─── Auth helper ──────────────────────────────────────────────────────────────

def get_nbfc_id_from_token(token: str) -> int:
    try:
        payload = decode_token(token)
        nbfc_id = payload.get("nbfc_id")
        if not nbfc_id:
            raise HTTPException(401, "Invalid token.")
        return int(nbfc_id)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "Invalid or expired token.")


# ─── 1. PROFILE ───────────────────────────────────────────────────────────────

@router.get("/profile/{nbfc_id}")
async def get_nbfc_profile(nbfc_id: int):
    nbfc = await database.fetch_one(
        """SELECT id, company_name, company_type, registration_number,
                  gst_number, email, mobile, city, state,
                  logo_url, brand_color, status, rules_configured,
                  interest_rate, min_loan_amount, max_loan_amount,
                  min_tenure_months, max_tenure_months,
                  processing_fee, min_credit_score,
                  late_penalty_flat, grace_period_days,
                  max_foir_percent,
                   upi_id, bank_name, bank_account_no, bank_ifsc,
                  created_at, last_login
           FROM nbfcs WHERE id = :id""",
        {"id": nbfc_id}
    )
    if not nbfc:
        raise HTTPException(404, "NBFC not found.")
    return dict(nbfc)


# ─── 2. STATS ─────────────────────────────────────────────────────────────────

@router.get("/stats/{nbfc_id}")
async def get_dashboard_stats(nbfc_id: int):
    nbfc = await database.fetch_one(
        "SELECT id FROM nbfcs WHERE id = :id", {"id": nbfc_id}
    )
    if not nbfc:
        raise HTTPException(404, "NBFC not found.")

    # Total unique borrowers who applied to this NBFC
    total_borrowers = await database.fetch_one(
        """SELECT COUNT(DISTINCT borrower_id) as count
           FROM loan_applications WHERE nbfc_id = :id""",
        {"id": nbfc_id}
    )

    # Active loans
    active_loans = await database.fetch_one(
        """SELECT COUNT(*) as count FROM loan_applications
           WHERE nbfc_id = :id AND status IN ('active', 'disbursed')""",
        {"id": nbfc_id}
    )

    # Total disbursed amount
    total_disbursed = await database.fetch_one(
        """SELECT COALESCE(SUM(amount_disbursed), 0) as total FROM loan_applications
           WHERE nbfc_id = :id AND status IN ('disbursed', 'closed')""",
        {"id": nbfc_id}
    )

    # Pending = 'applied' status (borrower confirmed agreement, awaiting NBFC action)
    pending_loans = await database.fetch_one(
        """SELECT COUNT(*) as count FROM loan_applications
           WHERE nbfc_id = :id AND status = 'applied'""",
        {"id": nbfc_id}
    )

    # EMI stats
    emi_due_month = 0
    overdue_emis  = 0
    try:
        now         = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        next_month  = month_start.replace(month=month_start.month % 12 + 1) \
                      if month_start.month < 12 \
                      else month_start.replace(year=month_start.year + 1, month=1)

        emi_row = await database.fetch_one(
            """SELECT COALESCE(SUM(es.amount), 0) as total
               FROM emi_schedule es
               JOIN loan_applications la ON la.id = es.loan_application_id
               WHERE la.nbfc_id = :id
                 AND es.due_date >= :start AND es.due_date < :end""",
            {"id": nbfc_id, "start": month_start, "end": next_month}
        )
        overdue_row = await database.fetch_one(
            """SELECT COUNT(*) as count FROM emi_schedule es
               JOIN loan_applications la ON la.id = es.loan_application_id
               WHERE la.nbfc_id = :id
                 AND (es.status = 'overdue'
                      OR (es.status = 'pending' AND es.due_date < :today))""",
            {"id": nbfc_id, "today": date.today()}
        )
        emi_due_month = emi_row["total"]     if emi_row     else 0
        overdue_emis  = overdue_row["count"] if overdue_row else 0
    except Exception:
        pass

    return {
        "total_borrowers": total_borrowers["count"] if total_borrowers else 0,
        "active_loans":    active_loans["count"]    if active_loans    else 0,
        "pending_loans":   pending_loans["count"]   if pending_loans   else 0,
        "total_disbursed": float(total_disbursed["total"]) if total_disbursed else 0,
        "emi_due_month":   float(emi_due_month),
        "overdue_emis":    int(overdue_emis),
    }


# ─── 3. RECENT ────────────────────────────────────────────────────────────────

@router.get("/recent/{nbfc_id}")
async def get_recent_applications(nbfc_id: int):
    nbfc = await database.fetch_one(
        "SELECT id FROM nbfcs WHERE id = :id", {"id": nbfc_id}
    )
    if not nbfc:
        raise HTTPException(404, "NBFC not found.")

    try:
        rows = await database.fetch_all(
            """SELECT la.id, la.amount, la.tenure_months, la.status, la.applied_at,
                      b.full_name AS borrower_name, b.email, b.credit_score
               FROM loan_applications la
               JOIN borrowers b ON b.id = la.borrower_id
               WHERE la.nbfc_id = :id
               ORDER BY la.applied_at DESC
               LIMIT 5""",
            {"id": nbfc_id}
        )
        return {"recent": [dict(r) for r in rows]}
    except Exception:
        return {"recent": []}


# ─── 4. SETTINGS ──────────────────────────────────────────────────────────────

@router.put("/settings/{nbfc_id}")
async def update_loan_rules(nbfc_id: int, data: LoanRulesUpdate):
    nbfc = await database.fetch_one(
        "SELECT id FROM nbfcs WHERE id = :id", {"id": nbfc_id}
    )
    if not nbfc:
        raise HTTPException(404, "NBFC not found.")

    if data.min_loan_amount >= data.max_loan_amount:
        raise HTTPException(400, "Min loan amount must be less than max.")
    if data.min_tenure_months >= data.max_tenure_months:
        raise HTTPException(400, "Min tenure must be less than max.")
    if data.interest_rate <= 0:
        raise HTTPException(400, "Interest rate must be greater than 0.")
    if not (300 <= data.min_credit_score <= 900):
        raise HTTPException(400, "Min credit score must be between 300 and 900.")

    await database.execute(
        """UPDATE nbfcs SET
               interest_rate     = :interest_rate,
               min_loan_amount   = :min_loan_amount,
               max_loan_amount   = :max_loan_amount,
               min_tenure_months = :min_tenure_months,
               max_tenure_months = :max_tenure_months,
               processing_fee    = :processing_fee,
               min_credit_score  = :min_credit_score,
               late_penalty_flat = :late_penalty_flat,
               grace_period_days = :grace_period_days,
               max_foir_percent  = :max_foir_percent,
               upi_id            = :upi_id,
               bank_name         = :bank_name,
               bank_account_no   = :bank_account_no,
               bank_ifsc         = :bank_ifsc,
               rules_configured  = 'true'
           WHERE id = :nbfc_id""",
        {**data.dict(), "nbfc_id": nbfc_id}
    )
    return {"message": "Loan rules saved successfully.", "rules_configured": True}


# ─── 5. BORROWERS ─────────────────────────────────────────────────────────────

@router.get("/borrowers/{nbfc_id}")
async def get_borrowers(nbfc_id: int, page: int = 1, limit: int = 15):
    offset = (page - 1) * limit
    try:
        borrowers = await database.fetch_all(
            """SELECT DISTINCT b.id, b.full_name, b.email, b.mobile,
                      b.pan_number,b.kyc_status, b.credit_score, b.loan_status,
                      b.employment_type, b.created_at,
                      COUNT(la.id) as loan_count
               FROM borrowers b
               JOIN loan_applications la ON la.borrower_id = b.id
               WHERE la.nbfc_id = :nbfc_id
             GROUP BY b.id, b.full_name, b.email, b.mobile,
                        b.pan_number, b.kyc_status, b.credit_score, b.loan_status,
                        b.employment_type, b.created_at
               ORDER BY b.created_at DESC
               LIMIT :limit OFFSET :offset""",
            {"nbfc_id": nbfc_id, "limit": limit, "offset": offset}
        )
        total_row = await database.fetch_one(
            """SELECT COUNT(DISTINCT b.id) as count
               FROM borrowers b
               JOIN loan_applications la ON la.borrower_id = b.id
               WHERE la.nbfc_id = :id""",
            {"id": nbfc_id}
        )
        return {
            "borrowers": [dict(b) for b in borrowers],
            "total":     total_row["count"] if total_row else 0,
            "page":      page,
            "limit":     limit,
        }
    except Exception as e:
        return {"borrowers": [], "total": 0, "page": page, "limit": limit}


# ─── 6. LOANS ─────────────────────────────────────────────────────────────────

@router.get("/loans/{nbfc_id}")
async def get_loan_applications(
    nbfc_id: int,
    status:  Optional[str] = None,
    page:    int = 1,
    limit:   int = 15,
):
    offset = (page - 1) * limit
    params = {"nbfc_id": nbfc_id, "limit": limit, "offset": offset}
    status_clause = ""

    if status and status != "all":
        # Map frontend filter 'pending' → DB status 'applied'
        # (borrower confirmed agreement = 'applied' = awaiting NBFC review)
        # Map frontend tab names to actual DB status values
        status_map = {
            "pending": ["pending", "pending_agreement"],
            "applied": ["applied"],
            "approved": ["approved"],
            "active": ["active", "disbursed"],
            "rejected": ["rejected"],
            "closed": ["closed"],
        }
        db_statuses = status_map.get(status, [status])
        status_clause = f"AND la.status IN ({','.join([':s' + str(i) for i in range(len(db_statuses))])})"
        for i, s in enumerate(db_statuses):
            params[f"s{i}"] = s

    try:
        loans = await database.fetch_all(
            f"""SELECT la.id, la.amount, la.tenure_months, la.interest_rate,
                       la.emi_amount, la.total_interest, la.total_payable,
                       la.processing_fee_amount, la.amount_disbursed,
                       la.monthly_income, la.foir_at_application,
                       la.purpose, la.status, la.applied_at,
                       la.rejection_reason,
                       b.full_name  AS borrower_name,
                       b.email      AS borrower_email,
                       b.mobile     AS borrower_mobile,
                       b.credit_score,
                       b.employment_type,
                       b.kyc_status,
                       b.pan_number
                FROM loan_applications la
                JOIN borrowers b ON b.id = la.borrower_id
                WHERE la.nbfc_id = :nbfc_id {status_clause}
                ORDER BY la.applied_at DESC
                LIMIT :limit OFFSET :offset""",
            params
        )
        count_params = {k: v for k, v in params.items() if k not in ("limit", "offset")}
        total_row = await database.fetch_one(
            f"""SELECT COUNT(*) as count FROM loan_applications la
                WHERE la.nbfc_id = :nbfc_id {status_clause}""",
            count_params
        )
        return {
            "loans": [dict(l) for l in loans],
            "total": total_row["count"] if total_row else 0,
            "page":  page,
            "limit": limit,
        }
    except Exception as e:
        return {"loans": [], "total": 0, "page": page, "limit": limit}


# ─── 7. LOAN DETAIL ───────────────────────────────────────────────────────────


@router.get("/loans/{nbfc_id}/detail/{loan_id}")
async def get_loan_detail(nbfc_id: int, loan_id: int):
   row = await database.fetch_one(
        """SELECT la.id, la.amount, la.tenure_months, la.interest_rate,
                  la.emi_amount, la.total_interest, la.total_payable,
                  la.processing_fee_amount, la.amount_disbursed,
                  la.purpose, la.status, la.applied_at, la.rejection_reason,
                  la.monthly_income, la.existing_emis, la.foir_at_application,
                  la.utr_number, la.disbursement_mode, la.disbursed_at,
                  b.id as borrower_id, b.full_name, b.email, b.mobile,
                  b.pan_number, b.aadhaar_number, b.date_of_birth,
                  b.gender, b.employment_type, b.credit_score,
                  b.kyc_status, b.address, b.bank_data,
                    n.company_name as nbfc_name,
                    n.max_foir_percent
           FROM loan_applications la
           JOIN borrowers b ON b.id = la.borrower_id
           JOIN nbfcs n     ON n.id = la.nbfc_id
           WHERE la.id = :loan_id AND la.nbfc_id = :nbfc_id""",
       {"loan_id": loan_id, "nbfc_id": nbfc_id}
   )
   if not row:
       raise HTTPException(404, "Loan application not found.")
   return dict(row)





# ─── 8. APPROVE LOAN ──────────────────────────────────────────────────────────

@router.post("/loans/{loan_id}/approve")
async def approve_loan(
    loan_id: int,
    data: LoanApproveRequest,
    token: str = Depends(oauth2_scheme),
):
    nbfc_id = get_nbfc_id_from_token(token)

    loan = await database.fetch_one(
        "SELECT id, borrower_id, nbfc_id, status FROM loan_applications WHERE id = :id",
        {"id": loan_id}
    )
    if not loan:
        raise HTTPException(404, "Loan application not found.")
    if loan["nbfc_id"] != nbfc_id:
        raise HTTPException(403, "Access denied.")
    if loan["status"] not in ("applied", "pending"):
        raise HTTPException(400, f"Cannot approve loan in '{loan['status']}' status.")

    await database.execute(
        """UPDATE loan_applications
           SET status = 'approved', 
           approved_amount = amount,notes = :notes, decided_at = NOW()
           WHERE id = :id""",
        {"notes": data.notes, "id": loan_id}
    )
    await database.execute(
        "UPDATE borrowers SET loan_status = 'approved' WHERE id = :id",
        {"id": loan["borrower_id"]}
    )
    return {"message": "Loan approved successfully.", "loan_id": loan_id, "status": "approved"}


# ─── 9. REJECT LOAN ───────────────────────────────────────────────────────────

@router.post("/loans/{loan_id}/reject")
async def reject_loan(
    loan_id: int,
    data: LoanRejectRequest,
    token: str = Depends(oauth2_scheme),
):
    nbfc_id = get_nbfc_id_from_token(token)

    loan = await database.fetch_one(
        "SELECT id, borrower_id, nbfc_id, status FROM loan_applications WHERE id = :id",
        {"id": loan_id}
    )
    if not loan:
        raise HTTPException(404, "Loan application not found.")
    if loan["nbfc_id"] != nbfc_id:
        raise HTTPException(403, "Access denied.")
    if loan["status"] not in ("applied", "pending"):
        raise HTTPException(400, f"Cannot reject loan in '{loan['status']}' status.")

    await database.execute(
        """UPDATE loan_applications
           SET status = 'rejected', rejection_reason = :reason, decided_at = NOW()
           WHERE id = :id""",
        {"reason": data.rejection_reason, "id": loan_id}
    )
    await database.execute(
        "UPDATE borrowers SET loan_status = 'none', nbfc_id = NULL WHERE id = :id",
        {"id": loan["borrower_id"]}
    )
    return {"message": "Loan rejected.", "loan_id": loan_id, "status": "rejected"}


@router.get("/borrower/{borrower_id}")
async def get_borrower_profile(borrower_id: int, nbfc_id: int):
    # Verify borrower belongs to this NBFC
    row = await database.fetch_one(
        """SELECT b.id, b.full_name, b.email, b.mobile,
                  b.pan_number, b.aadhaar_number, b.date_of_birth,
                  b.gender, b.employment_type, b.credit_score,
                  b.loan_status, b.created_at,
                  la.id as loan_id, la.amount, la.status as loan_app_status,
                  la.emi_amount, la.tenure_months, la.applied_at
           FROM borrowers b
           LEFT JOIN loan_applications la ON la.borrower_id = b.id AND la.nbfc_id = :nbfc_id
           WHERE b.id = :borrower_id""",
        {"borrower_id": borrower_id, "nbfc_id": nbfc_id}
    )
    if not row:
        raise HTTPException(404, "Borrower not found.")
    return dict(row)

@router.put("/loans/{loan_id}/disburse")
async def disburse_loan(loan_id: int, data: DisburseRequest, nbfc_id: int = Query(...)):
    from datetime import date
    from dateutil.relativedelta import relativedelta

    # ── 1. Verify loan belongs to this NBFC ──────────────────────
    loan = await database.fetch_one(
        """SELECT la.id, la.nbfc_id, la.status, la.amount, la.amount_disbursed,
                  la.tenure_months, la.interest_rate, la.emi_amount,
                  la.borrower_id,
                  n.company_name as nbfc_name
           FROM loan_applications la
           JOIN nbfcs n ON n.id = la.nbfc_id
           WHERE la.id = :id AND la.nbfc_id = :nbfc_id""",
        {"id": loan_id, "nbfc_id": nbfc_id}
    )
    if not loan:
        raise HTTPException(404, "Loan not found.")
    if loan["status"] != "active":
        raise HTTPException(400, f"Loan must be active to disburse. Current status: '{loan['status']}'.")
    if not data.utr_number.strip():
        raise HTTPException(400, "UTR number is required.")

    # ── 2. Update loan status ─────────────────────────────────────
    await database.execute(
        """UPDATE loan_applications
           SET status            = 'disbursed',
               utr_number        = :utr,
               disbursement_mode = :mode,
               disbursed_at      = NOW()
           WHERE id = :id""",
        {
            "utr":  data.utr_number.strip().upper(),
            "mode": data.disbursement_mode,
            "id":   loan_id,
        }
    )

    # ── 3. Update borrower loan_status ────────────────────────────
    await database.execute(
        "UPDATE borrowers SET loan_status = 'disbursed' WHERE id = :id",
        {"id": loan["borrower_id"]}
    )

    # ── 4. Generate EMI schedule ──────────────────────────────────
    principal = float(loan["amount"])
    r         = float(loan["interest_rate"]) / 12 / 100
    n         = int(loan["tenure_months"])
    emi       = float(loan["emi_amount"])
    balance   = principal
    today     = date.today()

    for i in range(1, n + 1):
        interest       = round(balance * r, 2)
        principal_part = round(emi - interest, 2)
        balance        = round(max(balance - principal_part, 0), 2)
        due_date       = today + relativedelta(months=i)

        await database.execute(
            """INSERT INTO emi_schedule
               (loan_application_id, instalment_number, due_date,
                amount, principal_component, interest_component,
                outstanding_balance, status)
               VALUES (:loan_id, :num, :due_date, :amount,
                       :principal, :interest, :balance, 'pending')""",
            {
                "loan_id":  loan_id,
                "num":      i,
                "due_date": due_date,
                "amount":   round(emi, 2),
                "principal":principal_part,
                "interest": interest,
                "balance":  balance,
            }
        )

    # ── 5. Calculate first EMI date for email ─────────────────────
    first_emi_date = (today + relativedelta(months=1)).strftime("%d %b %Y")

    # ── 6. Fetch borrower email ───────────────────────────────────
    borrower = await database.fetch_one(
        "SELECT full_name, email FROM borrowers WHERE id = :id",
        {"id": loan["borrower_id"]}
    )

    # ── 7. Send disbursement email to borrower ────────────────────
    if borrower and borrower["email"]:
        try:
            send_disbursement_email_to_borrower(
                to_email         = borrower["email"],
                borrower_name    = borrower["full_name"],
                nbfc_name        = loan["nbfc_name"],
                loan_id          = loan_id,
                loan_amount      = float(loan["amount"]),
                amount_disbursed = float(loan["amount_disbursed"] or loan["amount"]),
                utr_number       = data.utr_number.strip().upper(),
                transfer_mode    = data.disbursement_mode,
                emi_amount       = float(loan["emi_amount"]),
                tenure_months    = loan["tenure_months"],
                first_emi_date   = first_emi_date,
            )
        except Exception as e:
            # Don't fail disbursement if email fails — just log it
            print(f"[WARN] Disbursement email to borrower failed: {e}")

    return {
        "message":    "Loan marked as disbursed successfully.",
        "loan_id":    loan_id,
        "utr_number": data.utr_number.strip().upper(),
        "first_emi":  first_emi_date,
    }

# ─── 9. GET EMIs FOR MONTH ────────────────────────────────────────────────────
# JS calls: GET /api/nbfc/dashboard/emis/{nbfc_id}?year=X&month=Y

# @router.get("/emis/{nbfc_id}")
# async def get_nbfc_emis(nbfc_id: int, year: int, month: int):
#     from datetime import date
#     import calendar
#
#     month_start = date(year, month, 1)
#     last_day    = calendar.monthrange(year, month)[1]
#     month_end   = date(year, month, last_day)
#
#     rows = await database.fetch_all(
#         """SELECT es.id, es.instalment_number, es.due_date, es.amount,
#                   es.status, es.paid_at, es.paid_amount,
#                   la.id as loan_id, la.amount as loan_amount,
#                   b.full_name, b.email
#            FROM emi_schedule es
#            JOIN loan_applications la ON la.id = es.loan_application_id
#            JOIN borrowers b ON b.id = la.borrower_id
#            WHERE la.nbfc_id = :nbfc_id
#              AND es.due_date >= :start
#              AND es.due_date <= :end
#            ORDER BY es.due_date ASC""",
#         {"nbfc_id": nbfc_id, "start": month_start, "end": month_end}
#     )
#
#     emis = [dict(r) for r in rows]
#
#     total_due     = sum(e["amount"] for e in emis)
#     collected     = sum(e["paid_amount"] or 0 for e in emis if e["status"] == "paid")
#     pending_count = sum(1 for e in emis if e["status"] == "pending")
#     overdue_count = sum(1 for e in emis if e["status"] == "overdue")
#
#     return {
#         "emis":          emis,
#         "total_due":     total_due,
#         "collected":     collected,
#         "pending_count": pending_count,
#         "overdue_count": overdue_count,
#     }


@router.get("/emis/{nbfc_id}")
async def get_nbfc_emis(nbfc_id: int, year: int, month: int):
    from datetime import date
    import calendar

    month_start = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    month_end = date(year, month, last_day)

    rows = await database.fetch_all(
        """SELECT es.id, es.instalment_number, es.due_date, es.amount,
                  es.status, es.paid_at, es.paid_amount,
                  es.payment_reference, es.claimed_amount, es.claimed_at,
                  es.dispute_reason, es.late_fee_amount,
                  es.principal_component, es.interest_component,
                  la.interest_rate,
                  la.processing_fee_amount,
                  la.id as loan_id, la.amount as loan_amount,
                 b.full_name as borrower_name, b.email
           FROM emi_schedule es
           JOIN loan_applications la ON la.id = es.loan_application_id
           JOIN borrowers b ON b.id = la.borrower_id
           WHERE la.nbfc_id = :nbfc_id
             AND es.due_date >= :start
             AND es.due_date <= :end
           ORDER BY es.due_date ASC""",
        {"nbfc_id": nbfc_id, "start": month_start, "end": month_end}
    )

    # AFTER
    emis = [dict(r) for r in rows]

    today = date.today()
    for e in emis:
        if e["status"] == "pending" and e["due_date"] < today:
            e["status"] = "overdue"

    total_due = sum(e["amount"] for e in emis)
    collected = sum(e["paid_amount"] or 0 for e in emis if e["status"] == "paid")
    pending_count = sum(1 for e in emis if e["status"] == "pending")
    claimed_count = sum(1 for e in emis if e["status"] == "payment_claimed")
    overdue_count = sum(1 for e in emis if e["status"] == "overdue")

    # Interest and principal from paid EMIs
    interest_earned = sum(float(e.get("interest_component") or 0) for e in emis if e["status"] == "paid")
    principal_collected = sum(float(e.get("principal_component") or 0) for e in emis if e["status"] == "paid")
    processing_fee_total = sum(float(e.get("processing_fee_amount") or 0) for e in emis if e["status"] == "paid")
    net_profit = interest_earned + processing_fee_total

    return {
        "emis": emis,
        "total_due": total_due,
        "collected": collected,
        "pending_count": pending_count,
        "claimed_count": claimed_count,
        "overdue_count": overdue_count,
        "interest_earned": round(interest_earned, 2),
        "principal_collected": round(principal_collected, 2),
        "processing_fee_total": round(processing_fee_total, 2),
        "net_profit": round(net_profit, 2),
    }

# ─── 10. MARK EMI AS PAID ──────────────────────────────────────────────────────
@router.post("/emis/{emi_id}/confirm")
async def confirm_emi_payment(emi_id: int, nbfc_id: int = Query(...)):
    emi = await database.fetch_one(
        """SELECT es.id, es.amount, es.status, es.claimed_amount,
                  es.instalment_number, es.loan_application_id,
                  la.nbfc_id, la.borrower_id,
                  b.full_name, b.email, n.company_name as nbfc_name
           FROM emi_schedule es
           JOIN loan_applications la ON la.id = es.loan_application_id
           JOIN borrowers b ON b.id = la.borrower_id
           JOIN nbfcs n ON n.id = la.nbfc_id
           WHERE es.id = :id""",
        {"id": emi_id}
    )
    # TO:
    if not emi:
        raise HTTPException(404, "EMI not found.")
    if emi["nbfc_id"] != nbfc_id:
        raise HTTPException(403, "Access denied.")
    if emi["status"] == "paid":
        raise HTTPException(400, "EMI is already marked as paid.")
    if emi["status"] != "payment_claimed":
        raise HTTPException(
            400,
            "Cannot confirm payment until the borrower submits a payment "
            "reference. Ask the borrower to click 'Mark as Paid' first."
        )

    paid_amt = emi["claimed_amount"]

    await database.execute(
        """UPDATE emi_schedule
           SET status = 'paid', paid_at = NOW(), paid_amount = :amount
           WHERE id = :id""",
        {"amount": paid_amt, "id": emi_id}
    )

    # ── Was that the last unpaid EMI on this loan? If so, close it ──────────
    remaining = await database.fetch_val(
        """SELECT COUNT(*) FROM emi_schedule
           WHERE loan_application_id = :lid AND status NOT IN ('paid', 'waived')""",
        {"lid": emi["loan_application_id"]}
    )

    if remaining == 0:
        await database.execute(
            "UPDATE loan_applications SET status = 'closed' WHERE id = :id",
            {"id": emi["loan_application_id"]}
        )
        await database.execute(
            """UPDATE borrowers
               SET loan_status = 'none', nbfc_id = NULL,
                   credit_score = NULL, score_factors = NULL,
                   kyc_status = 'pending'
               WHERE id = :id""",
            {"id": emi["borrower_id"]}
        )

    # Send confirmation email to borrower
    if emi["email"]:
        try:
            send_emi_confirmation_email(
                to_email       = emi["email"],
                borrower_name  = emi["full_name"],
                nbfc_name      = emi["nbfc_name"],
                instalment_no  = emi["instalment_number"],
                amount         = float(paid_amt),
            )
        except Exception as e:
            print(f"[WARN] EMI confirmation email failed: {e}")

    return {"message": "EMI marked as paid successfully."}

# ─── NBFC disputes a claimed payment ─────────────────────────────────────────
# JS calls: POST /api/nbfc/dashboard/emis/{emi_id}/dispute

@router.post("/emis/{emi_id}/dispute")
async def dispute_emi_payment(emi_id: int, data: EMIDisputeRequest, nbfc_id: int = Query(...)):
    emi = await database.fetch_one(
        """SELECT es.id, es.status, la.nbfc_id
           FROM emi_schedule es
           JOIN loan_applications la ON la.id = es.loan_application_id
           WHERE es.id = :id""",
        {"id": emi_id}
    )
    if not emi:
        raise HTTPException(404, "EMI not found.")
    if emi["nbfc_id"] != nbfc_id:
        raise HTTPException(403, "Access denied.")
    if emi["status"] != "payment_claimed":
        raise HTTPException(400, "Only claimed payments can be disputed.")
    if not data.dispute_reason.strip():
        raise HTTPException(400, "Dispute reason is required.")

    await database.execute(
        """UPDATE emi_schedule
           SET status            = 'pending',
               dispute_reason    = :reason,
               disputed_at       = :now,
               payment_reference = NULL,
               claimed_amount    = NULL,
               claimed_at        = NULL
           WHERE id = :id""",
        {"reason": data.dispute_reason.strip(), "now": datetime.utcnow(), "id": emi_id}
    )

    return {"message": "Payment disputed. EMI status reverted to pending."}

@router.get("/emis-all/{nbfc_id}")
async def get_all_nbfc_emis(nbfc_id: int):
    """Returns ALL pending/claimed/overdue EMIs regardless of month — used as default view."""
    from datetime import date

    rows = await database.fetch_all(
        """SELECT es.id, es.instalment_number, es.due_date, es.amount,
                  es.status, es.paid_at, es.paid_amount,
                  es.payment_reference, es.claimed_amount, es.claimed_at,
                  es.dispute_reason,
                  la.id as loan_id, la.amount as loan_amount,
                  b.full_name as borrower_name, b.email
           FROM emi_schedule es
           JOIN loan_applications la ON la.id = es.loan_application_id
           JOIN borrowers b ON b.id = la.borrower_id
       WHERE la.nbfc_id = :nbfc_id
           ORDER BY es.due_date ASC""",
        {"nbfc_id": nbfc_id}
    )

    emis = [dict(r) for r in rows]
    today = date.today()
    for e in emis:
        if e["status"] == "pending" and e["due_date"] < today:
            e["status"] = "overdue"

    total_due     = sum(e["amount"] for e in emis)
    pending_count = sum(1 for e in emis if e["status"] == "pending")
    claimed_count = sum(1 for e in emis if e["status"] == "payment_claimed")
    overdue_count = sum(1 for e in emis if e["status"] == "overdue")

    collected = sum(e["paid_amount"] or 0 for e in emis if e["status"] == "paid")

    return {
        "emis": emis,
        "total_due": total_due,
        "collected": collected,
        "pending_count": pending_count,
        "claimed_count": claimed_count,
        "overdue_count": overdue_count,
    }

# ─── REPORTS: All EMIs for reports page ───────────────────────────────────────
@router.get("/reports/{nbfc_id}")
async def get_reports_data(nbfc_id: int):
    """Single endpoint for reports page — returns loans + all EMI summary."""
    from datetime import date

    # All loans
    loans = await database.fetch_all(
        """SELECT la.id, la.amount, la.tenure_months, la.interest_rate,
                  la.emi_amount, la.total_interest, la.total_payable,
                  la.processing_fee_amount, la.amount_disbursed,
                  la.purpose, la.status, la.applied_at, la.rejection_reason,
                  b.full_name AS borrower_name,
                  b.mobile    AS borrower_mobile,
                  b.credit_score
           FROM loan_applications la
           JOIN borrowers b ON b.id = la.borrower_id
           WHERE la.nbfc_id = :nbfc_id
           ORDER BY la.applied_at DESC""",
        {"nbfc_id": nbfc_id}
    )

    # All EMIs
    emis = await database.fetch_all(
        """SELECT es.id, es.instalment_number, es.due_date, es.amount,
                  es.status, es.paid_amount, es.outstanding_balance,
                  es.interest_component, es.principal_component,
                  la.id AS loan_id,
                  b.full_name AS borrower_name,
                  b.mobile    AS borrower_mobile
           FROM emi_schedule es
           JOIN loan_applications la ON la.id = es.loan_application_id
           JOIN borrowers b ON b.id = la.borrower_id
           WHERE la.nbfc_id = :nbfc_id
           ORDER BY es.due_date ASC""",
        {"nbfc_id": nbfc_id}
    )

    today = date.today()
    emis_list = [dict(e) for e in emis]
    for e in emis_list:
        if e["status"] == "pending" and e["due_date"] < today:
            e["status"] = "overdue"

    return {
        "loans": [dict(l) for l in loans],
        "emis":  emis_list,
    }

@router.put("/change-password/{nbfc_id}")
async def change_password(nbfc_id: int, data: ChangePasswordRequest, token: str = Depends(oauth2_scheme)):
    token_nbfc_id = get_nbfc_id_from_token(token)
    if token_nbfc_id != nbfc_id:
        raise HTTPException(403, "Access denied.")

    nbfc = await database.fetch_one("SELECT hashed_password FROM nbfcs WHERE id = :id", {"id": nbfc_id})
    if not nbfc:
        raise HTTPException(404, "NBFC not found.")

    if not verify_password(data.current_password, nbfc["hashed_password"]):
        raise HTTPException(400, "Current password is incorrect.")
    if len(data.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters.")

    await database.execute(
        "UPDATE nbfcs SET hashed_password = :ph WHERE id = :id",
        {"ph": hash_password(data.new_password), "id": nbfc_id}
    )
    return {"message": "Password updated successfully."}


@router.delete("/account/{nbfc_id}")
async def delete_account(nbfc_id: int, token: str = Depends(oauth2_scheme)):
    token_nbfc_id = get_nbfc_id_from_token(token)
    if token_nbfc_id != nbfc_id:
        raise HTTPException(403, "Access denied.")

    active_loans = await database.fetch_one(
        "SELECT COUNT(*) as count FROM loan_applications WHERE nbfc_id = :id AND status IN ('active','disbursed')",
        {"id": nbfc_id}
    )
    if active_loans["count"] > 0:
        raise HTTPException(400, "Cannot delete account with active/disbursed loans outstanding.")

    await database.execute(
        "UPDATE nbfcs SET status = 'deleted' WHERE id = :id",
        {"id": nbfc_id}
    )
    return {"message": "Account deactivated."}
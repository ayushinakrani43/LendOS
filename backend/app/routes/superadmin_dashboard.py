# # ─────────────────────────────────────────────────────────────────────────────
# #  app/routes/superadmin_dashboard.py
# #  Super Admin dashboard routes for LendOS.
# #  Prefix: /api/admin
# # ─────────────────────────────────────────────────────────────────────────────
#
# from fastapi import APIRouter, HTTPException, Depends
# from fastapi.security import OAuth2PasswordBearer
# from app.core.database import database
# from app.core.auth import decode_token
# from datetime import date
#
# router = APIRouter(prefix="/api/admin", tags=["Super Admin"])
# oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")
#
#
# # ── Auth guard ────────────────────────────────────────────────────────────────
# def get_admin(token: str = Depends(oauth2_scheme)) -> dict:
#     tok = decode_token(token)
#     if not tok or tok.get("role") != "superadmin":
#         raise HTTPException(401, "Invalid or expired admin token.")
#     return tok
#
#
# # ── GET /api/admin/overview ───────────────────────────────────────────────────
# @router.get("/overview")
# async def admin_overview(admin: dict = Depends(get_admin)):
#     """
#     Single endpoint powering the Super Admin overview page.
#     Returns:
#       - Platform-wide KPI counts
#       - NBFC list with loan counts
#       - Recent loan applications (last 10)
#       - Loan status breakdown counts
#       - Recent borrowers (last 10)
#     """
#
#     # ── 1. NBFC stats ─────────────────────────────────────────────────────────
#     nbfc_rows = await database.fetch_all(
#         """SELECT n.id, n.company_name, n.city, n.state,
#                   n.interest_rate, n.status,
#                   COUNT(la.id) AS loan_count
#            FROM nbfcs n
#            LEFT JOIN loan_applications la ON la.nbfc_id = n.id
#            GROUP BY n.id, n.company_name, n.city, n.state,
#                     n.interest_rate, n.status
#            ORDER BY loan_count DESC"""
#     )
#     nbfcs         = [dict(r) for r in nbfc_rows]
#     nbfc_active   = sum(1 for n in nbfcs if n["status"] == "active")
#     nbfc_suspended= sum(1 for n in nbfcs if n["status"] == "suspended")
#
#     # ── 2. Borrower stats ─────────────────────────────────────────────────────
#     bor_row = await database.fetch_one(
#         """SELECT
#              COUNT(*)                                            AS total_borrowers,
#              COUNT(*) FILTER (WHERE kyc_status = 'submitted')   AS kyc_submitted,
#              COUNT(*) FILTER (WHERE kyc_status = 'verified')    AS kyc_verified
#            FROM borrowers"""
#     )
#
#     # ── 3. Loan stats ─────────────────────────────────────────────────────────
#     loan_row = await database.fetch_one(
#         """SELECT
#              COUNT(*)                                             AS total_loans,
#              COUNT(*) FILTER (WHERE status = 'active')           AS active_loans,
#              COUNT(*) FILTER (WHERE status = 'disbursed')        AS disbursed_loans,
#              COUNT(*) FILTER (WHERE status = 'pending')          AS pending_loans,
#              COUNT(*) FILTER (WHERE status = 'applied')          AS applied_loans,
#              COUNT(*) FILTER (WHERE status = 'approved')         AS approved_loans,
#              COUNT(*) FILTER (WHERE status = 'rejected')         AS rejected_loans,
#              COUNT(*) FILTER (WHERE status = 'closed')           AS closed_loans,
#              COALESCE(SUM(amount_disbursed)
#                FILTER (WHERE status IN ('active','disbursed','closed')), 0) AS total_disbursed
#            FROM loan_applications"""
#     )
#
#     # ── 4. EMI stats (overdue + collected) ────────────────────────────────────
#     emi_row = await database.fetch_one(
#         """SELECT
#              COUNT(*) FILTER (
#                WHERE status = 'overdue'
#                OR (status = 'pending' AND due_date < :today)
#              )                                                    AS overdue_emis,
#              COALESCE(SUM(paid_amount) FILTER (WHERE status = 'paid'), 0) AS total_collected
#            FROM emi_schedule""",
#         {"today": date.today()}
#     )
#
#     # ── 5. Recent loan applications (last 10) ─────────────────────────────────
#     recent_loan_rows = await database.fetch_all(
#         """SELECT la.id, la.amount, la.status, la.applied_at,
#                   b.full_name AS borrower_name,
#                   n.company_name AS nbfc_name
#            FROM loan_applications la
#            JOIN borrowers b ON b.id = la.borrower_id
#            JOIN nbfcs n     ON n.id = la.nbfc_id
#            ORDER BY la.applied_at DESC
#            LIMIT 10"""
#     )
#
#     # ── 6. Loan status breakdown ──────────────────────────────────────────────
#     status_rows = await database.fetch_all(
#         """SELECT status, COUNT(*) AS count
#            FROM loan_applications
#            GROUP BY status"""
#     )
#     loan_status_counts = {r["status"]: r["count"] for r in status_rows}
#
#     # ── 7. Recent borrowers (last 10) ─────────────────────────────────────────
#     recent_bor_rows = await database.fetch_all(
#         """SELECT id, full_name, email, mobile, credit_score,
#                   kyc_status, loan_status, created_at
#            FROM borrowers
#            ORDER BY created_at DESC
#            LIMIT 10"""
#     )
#
#     # ── Build response ────────────────────────────────────────────────────────
#     return {
#         # KPIs
#         "nbfc_active":      nbfc_active,
#         "nbfc_suspended":   nbfc_suspended,
#         "total_borrowers":  bor_row["total_borrowers"],
#         "kyc_submitted":    bor_row["kyc_submitted"],
#         "kyc_verified":     bor_row["kyc_verified"],
#         "total_loans":      loan_row["total_loans"],
#         "active_loans":     loan_row["active_loans"],
#         "disbursed_loans":  loan_row["disbursed_loans"],
#         "pending_loans":    loan_row["pending_loans"],
#         "total_disbursed":  float(loan_row["total_disbursed"] or 0),
#         "overdue_emis":     emi_row["overdue_emis"],
#         "total_collected":  float(emi_row["total_collected"] or 0),
#
#         # Lists
#         "nbfcs":              [dict(r) for r in nbfc_rows],
#         "recent_loans":       [dict(r) for r in recent_loan_rows],
#         "loan_status_counts": loan_status_counts,
#         "recent_borrowers":   [dict(r) for r in recent_bor_rows],
#     }


from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from typing import Optional
from app.core.database import database
from app.core.auth import decode_token
from datetime import date

router = APIRouter(prefix="/api/admin/dashboard", tags=["Super Admin"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/admin/login")


def get_admin(token: str = Depends(oauth2_scheme)) -> dict:
    tok = decode_token(token)
    if not tok or tok.get("role") != "superadmin":
        raise HTTPException(401, "Invalid or expired admin token.")
    return tok


# ── GET /overview ── (unchanged from your version, working as-is)
@router.get("/overview")
async def admin_overview(admin: dict = Depends(get_admin)):
    nbfc_rows = await database.fetch_all(
        """SELECT n.id, n.company_name, n.city, n.state,
                  n.interest_rate, n.status,
                  COUNT(la.id) AS loan_count
           FROM nbfcs n
           LEFT JOIN loan_applications la ON la.nbfc_id = n.id
           GROUP BY n.id, n.company_name, n.city, n.state,
                    n.interest_rate, n.status
           ORDER BY loan_count DESC"""
    )
    nbfcs = [dict(r) for r in nbfc_rows]
    nbfc_active = sum(1 for n in nbfcs if n["status"] == "active")
    nbfc_suspended = sum(1 for n in nbfcs if n["status"] == "suspended")

    bor_row = await database.fetch_one(
        """SELECT COUNT(*) AS total_borrowers,
                  COUNT(*) FILTER (WHERE kyc_status = 'submitted') AS kyc_submitted,
                  COUNT(*) FILTER (WHERE kyc_status = 'verified') AS kyc_verified
           FROM borrowers"""
    )
    loan_row = await database.fetch_one(
        """SELECT COUNT(*) AS total_loans,
                  COUNT(*) FILTER (WHERE status = 'active') AS active_loans,
                  COUNT(*) FILTER (WHERE status = 'disbursed') AS disbursed_loans,
                  COUNT(*) FILTER (WHERE status = 'pending') AS pending_loans,
                  COALESCE(SUM(amount_disbursed) FILTER (WHERE status IN ('active','disbursed','closed')), 0) AS total_disbursed
           FROM loan_applications"""
    )
    emi_row = await database.fetch_one(
        """SELECT COUNT(*) FILTER (WHERE status = 'overdue' OR (status = 'pending' AND due_date < :today)) AS overdue_emis,
                  COALESCE(SUM(paid_amount) FILTER (WHERE status = 'paid'), 0) AS total_collected
           FROM emi_schedule""",
        {"today": date.today()}
    )
    recent_loan_rows = await database.fetch_all(
        """SELECT la.id, la.amount, la.status, la.applied_at,
                  b.full_name AS borrower_name, n.company_name AS nbfc_name
           FROM loan_applications la
           JOIN borrowers b ON b.id = la.borrower_id
           JOIN nbfcs n ON n.id = la.nbfc_id
           ORDER BY la.applied_at DESC LIMIT 10"""
    )
    status_rows = await database.fetch_all(
        "SELECT status, COUNT(*) AS count FROM loan_applications GROUP BY status"
    )
    recent_bor_rows = await database.fetch_all(
        """SELECT id, full_name, email, mobile, credit_score, kyc_status, loan_status, created_at
           FROM borrowers ORDER BY created_at DESC LIMIT 10"""
    )

    return {
        "nbfc_active": nbfc_active,
        "nbfc_suspended": nbfc_suspended,
        "total_borrowers": bor_row["total_borrowers"],
        "kyc_submitted": bor_row["kyc_submitted"],
        "kyc_verified": bor_row["kyc_verified"],
        "total_loans": loan_row["total_loans"],
        "active_loans": loan_row["active_loans"],
        "disbursed_loans": loan_row["disbursed_loans"],
        "pending_loans": loan_row["pending_loans"],
        "total_disbursed": float(loan_row["total_disbursed"] or 0),
        "overdue_emis": emi_row["overdue_emis"],
        "total_collected": float(emi_row["total_collected"] or 0),
        "nbfcs": nbfcs,
        "recent_loans": [dict(r) for r in recent_loan_rows],
        "loan_status_counts": {r["status"]: r["count"] for r in status_rows},
        "recent_borrowers": [dict(r) for r in recent_bor_rows],
    }


# ── GET /nbfcs ── (list, with search — needed by admin-nbfcs.js table)
@router.get("/nbfcs")
async def list_all_nbfcs(search: Optional[str] = None, admin: dict = Depends(get_admin)):
    query = """
        SELECT n.id, n.company_name, n.registration_number, n.city, n.state,
               n.interest_rate, n.min_loan_amount, n.max_loan_amount,
               n.status, n.logo_url, n.created_at,
               COUNT(la.id) AS loan_count,
               COALESCE(SUM(la.amount_disbursed) FILTER (WHERE la.status IN ('active','disbursed','closed')), 0) AS total_disbursed
        FROM nbfcs n
        LEFT JOIN loan_applications la ON la.nbfc_id = n.id
    """
    params = {}
    if search:
        query += " WHERE n.company_name ILIKE :s OR n.city ILIKE :s"
        params["s"] = f"%{search}%"
    query += """
        GROUP BY n.id, n.company_name, n.registration_number, n.city, n.state,
                 n.interest_rate, n.min_loan_amount, n.max_loan_amount,
                 n.status, n.logo_url, n.created_at
        ORDER BY n.created_at DESC
    """
    rows = await database.fetch_all(query, params)
    return [dict(r) for r in rows]


# ── GET /nbfcs/{id} ── (detail modal — needed by admin-nbfcs.js)
@router.get("/nbfcs/{nbfc_id}")
async def nbfc_detail(nbfc_id: int, admin: dict = Depends(get_admin)):
    nbfc = await database.fetch_one("SELECT * FROM nbfcs WHERE id = :id", {"id": nbfc_id})
    if not nbfc:
        raise HTTPException(404, "NBFC not found.")

    loan_agg = await database.fetch_one(
        """SELECT COUNT(*) AS loan_count,
                  COALESCE(SUM(amount_disbursed) FILTER (WHERE status IN ('active','disbursed','closed')), 0) AS total_disbursed
           FROM loan_applications WHERE nbfc_id = :id""",
        {"id": nbfc_id}
    )
    borrowers = await database.fetch_all(
        """SELECT DISTINCT b.id, b.full_name, b.mobile
           FROM borrowers b
           JOIN loan_applications la ON la.borrower_id = b.id
           WHERE la.nbfc_id = :id""",
        {"id": nbfc_id}
    )

    return {
        "nbfc": dict(nbfc),
        "loan_count": loan_agg["loan_count"],
        "total_disbursed": float(loan_agg["total_disbursed"] or 0),
        "borrowers": [dict(b) for b in borrowers],
    }


# ── PUT /nbfcs/{id}/status ── (fixed: uses get_admin, not undefined function)
class NBFCStatusUpdate(BaseModel):
    status: str
    reason: Optional[str] = None

@router.put("/nbfcs/{nbfc_id}/status")
async def update_nbfc_status(nbfc_id: int, data: NBFCStatusUpdate, admin: dict = Depends(get_admin)):
    if data.status not in ("active", "suspended", "pending"):
        raise HTTPException(400, "Invalid status.")

    result = await database.fetch_one("SELECT id FROM nbfcs WHERE id = :id", {"id": nbfc_id})
    if not result:
        raise HTTPException(404, "NBFC not found.")

    await database.execute(
        "UPDATE nbfcs SET status = :s, suspension_reason = :r WHERE id = :id",
        {"s": data.status, "r": data.reason, "id": nbfc_id}
    )
    return {"message": f"Status updated to '{data.status}'."}


# ── Borrower detail ───────────────────────────────────────────────────────────
@router.get("/borrowers/{borrower_id}")
async def get_borrower_detail(borrower_id: int, admin=Depends(get_admin)):
    b = await database.fetch_one(
        """SELECT b.id, b.full_name, b.email, b.mobile, b.credit_score,
                  b.kyc_status, b.loan_status, b.status, b.created_at,
                  b.aadhaar_number, b.pan_number, b.date_of_birth,
                  b.gender, b.address, b.employment_type,
                  n.company_name as nbfc_name
           FROM borrowers b
           LEFT JOIN nbfcs n ON n.id = b.nbfc_id
           WHERE b.id = :id""",
        {"id": borrower_id}
    )
    if not b:
        raise HTTPException(404, "Borrower not found")

    loans = await database.fetch_all(
        """SELECT la.id, la.amount, la.emi_amount, la.status, la.applied_at,
                  n.company_name as nbfc_name
           FROM loan_applications la
           JOIN nbfcs n ON n.id = la.nbfc_id
           WHERE la.borrower_id = :id
           ORDER BY la.applied_at DESC""",
        {"id": borrower_id}
    )
    return {
        "borrower": dict(b),
        "loans": [dict(l) for l in loans],
    }

@router.get("/borrowers")
async def list_all_borrowers(admin: dict = Depends(get_admin)):
    rows = await database.fetch_all(
        """SELECT b.id, b.full_name, b.email, b.mobile, b.credit_score,
                  b.kyc_status, b.loan_status, b.status, b.created_at,
                  n.company_name as nbfc_name
           FROM borrowers b
           LEFT JOIN nbfcs n ON n.id = b.nbfc_id
           ORDER BY b.created_at DESC"""
    )
    return {"borrowers": [dict(r) for r in rows]}


# ── GET /loans ── (list, with search — needed by admin-loans.js table)
@router.get("/loans")
async def list_all_loans(search: Optional[str] = None, admin: dict = Depends(get_admin)):
    query = """
      SELECT la.id, la.amount, la.tenure_months, la.purpose,
               la.approved_amount, la.interest_rate, la.emi_amount,
               la.amount_disbursed, la.status, la.applied_at,
               la.decided_at, la.disbursed_at, la.closed_at,
               b.id as borrower_id, b.full_name as borrower_name, b.mobile as borrower_mobile,
               b.requested_loan_amount,
               n.id as nbfc_id, n.company_name as nbfc_name
        FROM loan_applications la
        JOIN borrowers b ON b.id = la.borrower_id
        JOIN nbfcs n ON n.id = la.nbfc_id
    """
    params = {}
    if search:
        query += " WHERE b.full_name ILIKE :s OR n.company_name ILIKE :s OR b.mobile ILIKE :s"
        params["s"] = f"%{search}%"
    query += " ORDER BY la.applied_at DESC"

    rows = await database.fetch_all(query, params)
    return [dict(r) for r in rows]


# ── GET /loans/{id} ── (detail modal — needed by admin-loans.js)
@router.get("/loans/{loan_id}")
async def loan_detail(loan_id: int, admin: dict = Depends(get_admin)):
    loan = await database.fetch_one(
        """SELECT la.*, b.full_name as borrower_name, b.email as borrower_email,
                  b.mobile as borrower_mobile, b.credit_score,
                  n.company_name as nbfc_name, n.city as nbfc_city
           FROM loan_applications la
           JOIN borrowers b ON b.id = la.borrower_id
           JOIN nbfcs n ON n.id = la.nbfc_id
           WHERE la.id = :id""",
        {"id": loan_id}
    )
    if not loan:
        raise HTTPException(404, "Loan not found.")

    emis = await database.fetch_all(
        """SELECT id, instalment_number, due_date, amount, status,
                  paid_at, paid_amount, late_fee_amount
           FROM emi_schedule
           WHERE loan_application_id = :id
           ORDER BY instalment_number ASC""",
        {"id": loan_id}
    )

    return {
        "loan": dict(loan),
        "emis": [dict(e) for e in emis],
    }


# ── GET /scores ── (list all credit-score records — needed by admin-scores.js)
@router.get("/scores")
async def list_all_scores(grade: Optional[str] = None, search: Optional[str] = None,
                           admin: dict = Depends(get_admin)):
    query = """
        SELECT cs.id, cs.borrower_id, cs.final_score, cs.grade, cs.nbfc_action, cs.created_at,
               b.full_name as borrower_name, b.mobile as borrower_mobile,
               n.company_name as nbfc_name
        FROM credit_scores cs
        JOIN borrowers b ON b.id = cs.borrower_id
        LEFT JOIN nbfcs n ON n.id = b.nbfc_id
    """
    conditions = []
    params = {}
    if grade and grade != "all":
        conditions.append("cs.grade = :grade")
        params["grade"] = grade
    if search:
        conditions.append("(b.full_name ILIKE :s OR b.mobile ILIKE :s)")
        params["s"] = f"%{search}%"
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY cs.created_at DESC"

    rows = await database.fetch_all(query, params)
    return [dict(r) for r in rows]


# ── GET /scores/{id} ── (full step-by-step breakdown for the detail modal)
@router.get("/scores/{score_id}")
async def score_detail(score_id: int, admin: dict = Depends(get_admin)):
    row = await database.fetch_one(
        """SELECT cs.*, b.full_name as borrower_name, b.mobile as borrower_mobile,
                  b.email as borrower_email, n.company_name as nbfc_name
           FROM credit_scores cs
           JOIN borrowers b ON b.id = cs.borrower_id
           LEFT JOIN nbfcs n ON n.id = b.nbfc_id
           WHERE cs.id = :id""",
        {"id": score_id}
    )
    if not row:
        raise HTTPException(404, "Score record not found.")
    return dict(row)

# ── GET /platform-reports ── (single endpoint powering the Platform Reports page)
# @router.get("/platform-reports")
# async def platform_reports(admin: dict = Depends(get_admin)):
#     today = date.today()
#     # Last 12 calendar months, oldest first, e.g. ["2025-08", ..., "2026-07"]
#     def months_back(d: date, n: int) -> date:
#         total = d.year * 12 + (d.month - 1) - n
#         return date(total // 12, total % 12 + 1, 1)
#
#     month_keys = [months_back(today, i) for i in range(11, -1, -1)]
#     month_labels = [m.strftime("%b %y") for m in month_keys]
#     month_str_keys = [m.strftime("%Y-%m") for m in month_keys]
#
#     def fill_months(rows, key_field, val_field):
#         """rows: list of {key_field: 'YYYY-MM', val_field: number} -> zero-filled 12-month list"""
#         lookup = {r[key_field]: r[val_field] for r in rows}
#         return [float(lookup.get(k, 0) or 0) for k in month_str_keys]
#
#     # ── 1. Overview strip ──────────────────────────────────────────────────
#     active_nbfcs   = await database.fetch_val("SELECT COUNT(*) FROM nbfcs WHERE status = 'active'")
#     total_loans    = await database.fetch_val("SELECT COUNT(*) FROM loan_applications")
#     total_disbursed = await database.fetch_val(
#         """SELECT COALESCE(SUM(amount_disbursed), 0) FROM loan_applications
#            WHERE status IN ('active', 'disbursed', 'closed')"""
#     )
#     total_borrowers = await database.fetch_val("SELECT COUNT(*) FROM borrowers")
#
#     # ── 2. Loan Portfolio ──────────────────────────────────────────────────
#     status_rows = await database.fetch_all(
#         "SELECT status, COUNT(*) as cnt FROM loan_applications GROUP BY status"
#     )
#     status_distribution = {r["status"]: r["cnt"] for r in status_rows}
#
#     monthly_disbursed_count_rows = await database.fetch_all(
#         """SELECT to_char(date_trunc('month', disbursed_at), 'YYYY-MM') as month_key,
#                   COUNT(*) as cnt
#            FROM loan_applications
#            WHERE disbursed_at IS NOT NULL AND disbursed_at >= :since
#            GROUP BY month_key""",
#         {"since": month_keys[0]}
#     )
#     monthly_disbursed_amount_rows = await database.fetch_all(
#         """SELECT to_char(date_trunc('month', disbursed_at), 'YYYY-MM') as month_key,
#                   COALESCE(SUM(amount_disbursed), 0) as total
#            FROM loan_applications
#            WHERE disbursed_at IS NOT NULL AND disbursed_at >= :since
#            GROUP BY month_key""",
#         {"since": month_keys[0]}
#     )
#
#     # ── 3. Borrower Analytics ──────────────────────────────────────────────
#     new_borrowers_rows = await database.fetch_all(
#         """SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') as month_key,
#                   COUNT(*) as cnt
#            FROM borrowers
#            WHERE created_at >= :since
#            GROUP BY month_key""",
#         {"since": month_keys[0]}
#     )
#
#     # Latest credit score per borrower, bucketed by grade
#     latest_scores = await database.fetch_all(
#         """SELECT DISTINCT ON (borrower_id) borrower_id, grade
#            FROM credit_scores
#            ORDER BY borrower_id, created_at DESC"""
#     )
#     score_distribution = {}
#     for r in latest_scores:
#         score_distribution[r["grade"]] = score_distribution.get(r["grade"], 0) + 1
#
#     employment_rows = await database.fetch_all(
#         """SELECT employment_type, COUNT(*) as cnt
#            FROM borrowers
#            WHERE employment_type IS NOT NULL
#            GROUP BY employment_type"""
#     )
#     employment_distribution = {r["employment_type"]: r["cnt"] for r in employment_rows}
#
#     # ── 4. Collection Performance ──────────────────────────────────────────
#     collection_overall = await database.fetch_one(
#         """SELECT COALESCE(SUM(amount), 0) as due, COALESCE(SUM(paid_amount), 0) as collected
#            FROM emi_schedule
#            WHERE due_date <= :today"""
#         , {"today": today}
#     )
#     due_total = float(collection_overall["due"] or 0)
#     collected_total = float(collection_overall["collected"] or 0)
#     collection_rate = round((collected_total / due_total) * 100, 1) if due_total > 0 else 0
#
#     per_nbfc_collection = await database.fetch_all(
#         """SELECT n.id, n.company_name,
#                   COALESCE(SUM(es.amount), 0) as due,
#                   COALESCE(SUM(es.paid_amount), 0) as collected
#            FROM nbfcs n
#            JOIN loan_applications la ON la.nbfc_id = n.id
#            JOIN emi_schedule es ON es.loan_application_id = la.id
#            WHERE es.due_date <= :today
#            GROUP BY n.id, n.company_name
#            ORDER BY due DESC""",
#         {"today": today}
#     )
#     per_nbfc_collection_list = []
#     for r in per_nbfc_collection:
#         due = float(r["due"] or 0)
#         collected = float(r["collected"] or 0)
#         rate = round((collected / due) * 100, 1) if due > 0 else 0
#         per_nbfc_collection_list.append({
#             "nbfc_name": r["company_name"], "due": due, "collected": collected, "rate": rate
#         })
#
#     overdue_trend_rows = await database.fetch_all(
#         """SELECT to_char(date_trunc('month', due_date), 'YYYY-MM') as month_key,
#                   COUNT(*) as cnt
#            FROM emi_schedule
#            WHERE status = 'overdue' AND due_date >= :since
#            GROUP BY month_key""",
#         {"since": month_keys[0]}
#     )
#
#     # ── 5. NBFC Leaderboard ─────────────────────────────────────────────────
#     leaderboard_rows = await database.fetch_all(
#         """SELECT n.id, n.company_name,
#                   COUNT(la.id) FILTER (WHERE la.status IN ('active','disbursed')) as active_loans,
#                   COALESCE(SUM(la.amount_disbursed) FILTER (WHERE la.status IN ('active','disbursed','closed')), 0) as total_disbursed
#            FROM nbfcs n
#            LEFT JOIN loan_applications la ON la.nbfc_id = n.id
#            GROUP BY n.id, n.company_name
#            ORDER BY total_disbursed DESC"""
#     )
#     collection_by_nbfc_id = {r["id"]: r for r in per_nbfc_collection}
#     leaderboard = []
#     for r in leaderboard_rows:
#         cr = collection_by_nbfc_id.get(r["id"])
#         rate = 0
#         if cr:
#             due = float(cr["due"] or 0)
#             collected = float(cr["collected"] or 0)
#             rate = round((collected / due) * 100, 1) if due > 0 else 0
#         leaderboard.append({
#             "nbfc_name": r["company_name"],
#             "active_loans": r["active_loans"],
#             "total_disbursed": float(r["total_disbursed"] or 0),
#             "collection_rate": rate,
#         })
#
#     return {
#         "month_labels": month_labels,
#         "overview": {
#             "active_nbfcs": active_nbfcs,
#             "total_loans": total_loans,
#             "total_disbursed": float(total_disbursed or 0),
#             "total_borrowers": total_borrowers,
#         },
#         "loan_portfolio": {
#             "status_distribution": status_distribution,
#             "monthly_disbursed_count": fill_months(monthly_disbursed_count_rows, "month_key", "cnt"),
#             "monthly_disbursed_amount": fill_months(monthly_disbursed_amount_rows, "month_key", "total"),
#         },
#         "borrower_analytics": {
#             "new_borrowers_per_month": fill_months(new_borrowers_rows, "month_key", "cnt"),
#             "score_distribution": score_distribution,
#             "employment_distribution": employment_distribution,
#         },
#         "collection_performance": {
#             "overall_rate": collection_rate,
#             "due_total": due_total,
#             "collected_total": collected_total,
#             "per_nbfc": per_nbfc_collection_list,
#             "overdue_trend": fill_months(overdue_trend_rows, "month_key", "cnt"),
#         },
#         "nbfc_leaderboard": leaderboard,
#     }

@router.get("/platform-reports")
async def platform_reports(admin: dict = Depends(get_admin)):
    today = date.today()
    # Last 12 calendar months, oldest first, e.g. ["2025-08", ..., "2026-07"]
    def months_back(d: date, n: int) -> date:
        total = d.year * 12 + (d.month - 1) - n
        return date(total // 12, total % 12 + 1, 1)

    month_keys = [months_back(today, i) for i in range(11, -1, -1)]
    month_labels = [m.strftime("%b %y") for m in month_keys]
    month_str_keys = [m.strftime("%Y-%m") for m in month_keys]

    def fill_months(rows, key_field, val_field):
        """rows: list of {key_field: 'YYYY-MM', val_field: number} -> zero-filled 12-month list"""
        lookup = {r[key_field]: r[val_field] for r in rows}
        return [float(lookup.get(k, 0) or 0) for k in month_str_keys]

    # ── 1. Overview strip ──────────────────────────────────────────────────
    active_nbfcs   = await database.fetch_val("SELECT COUNT(*) FROM nbfcs WHERE status = 'active'")
    total_loans    = await database.fetch_val("SELECT COUNT(*) FROM loan_applications")
    total_disbursed = await database.fetch_val(
        """SELECT COALESCE(SUM(amount_disbursed), 0) FROM loan_applications
           WHERE status IN ('active', 'disbursed', 'closed')"""
    )
    total_borrowers = await database.fetch_val("SELECT COUNT(*) FROM borrowers")

    # ── 2. Loan Portfolio ──────────────────────────────────────────────────
    status_rows = await database.fetch_all(
        "SELECT status, COUNT(*) as cnt FROM loan_applications GROUP BY status"
    )
    status_distribution = {r["status"]: r["cnt"] for r in status_rows}

    monthly_disbursed_count_rows = await database.fetch_all(
        """SELECT to_char(date_trunc('month', disbursed_at), 'YYYY-MM') as month_key,
                  COUNT(*) as cnt
           FROM loan_applications
           WHERE disbursed_at IS NOT NULL AND disbursed_at >= :since
           GROUP BY month_key""",
        {"since": month_keys[0]}
    )
    monthly_disbursed_amount_rows = await database.fetch_all(
        """SELECT to_char(date_trunc('month', disbursed_at), 'YYYY-MM') as month_key,
                  COALESCE(SUM(amount_disbursed), 0) as total
           FROM loan_applications
           WHERE disbursed_at IS NOT NULL AND disbursed_at >= :since
           GROUP BY month_key""",
        {"since": month_keys[0]}
    )

    # ── 3. Borrower Analytics ──────────────────────────────────────────────
    new_borrowers_rows = await database.fetch_all(
        """SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') as month_key,
                  COUNT(*) as cnt
           FROM borrowers
           WHERE created_at >= :since
           GROUP BY month_key""",
        {"since": month_keys[0]}
    )

    # Latest credit score per borrower, bucketed by grade
    latest_scores = await database.fetch_all(
        """SELECT DISTINCT ON (borrower_id) borrower_id, grade
           FROM credit_scores
           ORDER BY borrower_id, created_at DESC"""
    )
    score_distribution = {}
    for r in latest_scores:
        score_distribution[r["grade"]] = score_distribution.get(r["grade"], 0) + 1

    employment_rows = await database.fetch_all(
        """SELECT employment_type, COUNT(*) as cnt
           FROM borrowers
           WHERE employment_type IS NOT NULL
           GROUP BY employment_type"""
    )
    employment_distribution = {r["employment_type"]: r["cnt"] for r in employment_rows}

    # ── 4. Collection Performance ──────────────────────────────────────────
    collection_overall = await database.fetch_one(
        """SELECT COALESCE(SUM(amount), 0) as due, COALESCE(SUM(paid_amount), 0) as collected
           FROM emi_schedule
           WHERE due_date <= :today"""
        , {"today": today}
    )
    due_total = float(collection_overall["due"] or 0)
    collected_total = float(collection_overall["collected"] or 0)
    collection_rate = round((collected_total / due_total) * 100, 1) if due_total > 0 else 0

    per_nbfc_collection = await database.fetch_all(
        """SELECT n.id, n.company_name,
                  COALESCE(SUM(es.amount), 0) as due,
                  COALESCE(SUM(es.paid_amount), 0) as collected,
                  COUNT(es.id) FILTER (
                      WHERE es.status = 'overdue'
                         OR (es.status = 'pending' AND es.due_date < :today)
                  ) as overdue_count
           FROM nbfcs n
           JOIN loan_applications la ON la.nbfc_id = n.id
           JOIN emi_schedule es ON es.loan_application_id = la.id
           WHERE es.due_date <= :today
           GROUP BY n.id, n.company_name
           ORDER BY due DESC""",
        {"today": today}
    )
    per_nbfc_collection_list = []
    for r in per_nbfc_collection:
        due = float(r["due"] or 0)
        collected = float(r["collected"] or 0)
        rate = round((collected / due) * 100, 1) if due > 0 else 0
        per_nbfc_collection_list.append({
            "nbfc_name": r["company_name"], "due": due, "collected": collected,
            "rate": rate, "overdue": r["overdue_count"]
        })
    overdue_trend_rows = await database.fetch_all(
        """SELECT to_char(date_trunc('month', due_date), 'YYYY-MM') as month_key,
                  COUNT(*) as cnt
           FROM emi_schedule
           WHERE (status = 'overdue' OR (status = 'pending' AND due_date < :today))
             AND due_date >= :since
           GROUP BY month_key""",
        {"since": month_keys[0], "today": today}
    )

    # ── 5. NBFC Leaderboard ─────────────────────────────────────────────────
    leaderboard_rows = await database.fetch_all(
        """SELECT n.id, n.company_name, n.registration_number,
                  COUNT(la.id) as total_loans,
                  COUNT(la.id) FILTER (WHERE la.status IN ('active','disbursed')) as active_loans,
                  COALESCE(SUM(la.amount_disbursed) FILTER (WHERE la.status IN ('active','disbursed','closed')), 0) as total_disbursed
           FROM nbfcs n
           LEFT JOIN loan_applications la ON la.nbfc_id = n.id
           GROUP BY n.id, n.company_name, n.registration_number
           ORDER BY total_disbursed DESC"""
    )
    collection_by_nbfc_id = {r["id"]: r for r in per_nbfc_collection}
    leaderboard = []
    for r in leaderboard_rows:
        cr = collection_by_nbfc_id.get(r["id"])
        rate = 0
        if cr:
            due = float(cr["due"] or 0)
            collected = float(cr["collected"] or 0)
            rate = round((collected / due) * 100, 1) if due > 0 else 0
        leaderboard.append({
            "nbfc_name": r["company_name"],
            "registration_number": r["registration_number"],
            "total_loans": r["total_loans"],
            "active_loans": r["active_loans"],
            "total_disbursed": float(r["total_disbursed"] or 0),
            "collection_rate": rate,
        })

    return {
        "month_labels": month_labels,
        "overview": {
            "active_nbfcs": active_nbfcs,
            "total_loans": total_loans,
            "total_disbursed": float(total_disbursed or 0),
            "total_borrowers": total_borrowers,
        },
        "loan_portfolio": {
            "status_distribution": status_distribution,
            "monthly_disbursed_count": fill_months(monthly_disbursed_count_rows, "month_key", "cnt"),
            "monthly_disbursed_amount": fill_months(monthly_disbursed_amount_rows, "month_key", "total"),
        },
        "borrower_analytics": {
            "new_borrowers_per_month": fill_months(new_borrowers_rows, "month_key", "cnt"),
            "score_distribution": score_distribution,
            "employment_distribution": employment_distribution,
        },
        "collection_performance": {
            "overall_rate": collection_rate,
            "due_total": due_total,
            "collected_total": collected_total,
            "per_nbfc": per_nbfc_collection_list,
            "overdue_trend": fill_months(overdue_trend_rows, "month_key", "cnt"),
        },
        "nbfc_leaderboard": leaderboard,
    }
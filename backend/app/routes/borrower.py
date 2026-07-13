
import json
import asyncio
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.security import OAuth2PasswordBearer
from app.core.database import database
from app.core.auth import decode_token
from app.services.pdf_decrypt import decrypt_pdf
from app.services.bank_statement_service import extract_bank_statement
from app.services.salary_slip_service import extract_salary_slip
from app.services.credit_scoring_service import calculate_credit_score
from app.services.document_validator import verify_document , validate_bank_statement_quality, validate_itr_quality
from app.services.itr_service import extract_itr
from app.models.emi_model import EMIClaimPaymentRequest
from datetime import datetime
from app.core.auth import hash_password, verify_password
from app.models.emi_model import EMIClaimPaymentRequest
from app.services.chatbot_service import ask_chatbot

router = APIRouter(prefix="/api/borrower", tags=["Borrower"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/borrower/login")

MAX_SIZE = 10 * 1024 * 1024  # 10MB

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
@router.get("/profile/{borrower_id}")
async def get_borrower_profile(
        borrower_id: int,
        token: str = Depends(oauth2_scheme),
):
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    if payload.get("borrower_id") != borrower_id:
        raise HTTPException(status_code=403, detail="Access denied")

    row = await database.fetch_one(
        """
        SELECT id, full_name, email, mobile,
               aadhaar_number, pan_number,
               date_of_birth, gender,
               employment_type,
               credit_score, kyc_status,
               bank_data, income_data
        FROM borrowers
        WHERE id = :borrower_id
        """,
        {"borrower_id": borrower_id},
    )

    if not row:
        raise HTTPException(status_code=404, detail="Borrower not found")

    return {
        "id": row["id"],
        "full_name": row["full_name"],
        "email": row["email"],
        "mobile": row["mobile"],
        "aadhaar_number": row["aadhaar_number"],
        "pan_number": row["pan_number"],
        "date_of_birth": str(row["date_of_birth"]) if row["date_of_birth"] else None,
        "gender": row["gender"],
        "employment_type": row["employment_type"],
        "credit_score": row["credit_score"],
        "kyc_status": row["kyc_status"],
        "bank_data": json.loads(row["bank_data"]) if row["bank_data"] else None,
        "income_data": json.loads(row["income_data"]) if row["income_data"] else None,
    }


@router.post("/upload-documents")
async def upload_documents(
        borrower_id: int = Form(...),
        bank_statement: UploadFile = File(...),
        bank_statement_password: str = Form(default=""),
        salary_slip: UploadFile | None = File(default=None),
        itr: UploadFile | None = File(default=None),
        itr_password: str = Form(default=""),
        requested_loan_amount: float = Form(default=0),
        token: str = Depends(oauth2_scheme),
):
    # ── Auth check ──────────────────────────────────────────────────────────
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(401, "Invalid or expired token.")

    if not payload or payload.get("borrower_id") != borrower_id:
        raise HTTPException(401, "Invalid token or borrower mismatch.")

    borrower = await database.fetch_one(
        "SELECT id, employment_type FROM borrowers WHERE id = :id", {"id": borrower_id}
    )
    if not borrower:
        raise HTTPException(404, "Borrower not found.")

    # ── 1. Read + decrypt all uploaded files first ─────────────────────────
    bank_bytes = await bank_statement.read()
    if len(bank_bytes) > MAX_SIZE:
        raise HTTPException(400, "Bank statement file too large. Max 10MB.")
    try:
        bank_bytes = decrypt_pdf(bank_bytes, bank_statement_password or None)
    except ValueError as e:
        raise HTTPException(400, f"Bank statement: {str(e)}")

    # Determine income doc type and read its bytes
    income_doc_type = None
    salary_bytes = None
    itr_bytes = None

    if salary_slip is not None:
        salary_bytes = await salary_slip.read()
        if len(salary_bytes) > MAX_SIZE:
            raise HTTPException(400, "Salary slip file too large. Max 10MB.")
        income_doc_type = "salary_slip"

    elif itr is not None:
        itr_bytes = await itr.read()
        if len(itr_bytes) > MAX_SIZE:
            raise HTTPException(400, "ITR file too large. Max 10MB.")
        if itr.content_type == "application/pdf":
            try:
                itr_bytes = decrypt_pdf(itr_bytes, itr_password or None)
            except ValueError as e:
                raise HTTPException(400, f"ITR: {str(e)}")
        income_doc_type = "itr"

    else:
        raise HTTPException(400, "Either salary_slip or itr must be provided.")

    # ── 2. Verify both documents in PARALLEL ───────────────────────────────
    print("\n⚡ Verifying documents in parallel...")
    loop = asyncio.get_event_loop()

    income_bytes_for_verify = salary_bytes if income_doc_type == "salary_slip" else itr_bytes
    income_content_type = (
        salary_slip.content_type if income_doc_type == "salary_slip"
        else itr.content_type
    )

    bank_verify, income_verify = await asyncio.gather(
        loop.run_in_executor(
            None, verify_document, bank_bytes, "bank_statement", "application/pdf"
        ),
        loop.run_in_executor(
            None, verify_document, income_bytes_for_verify, income_doc_type, income_content_type
        ),
    )

    # Check bank statement verification
    print(f"   Bank   → Valid: {bank_verify.get('is_valid')} | Detected: {bank_verify.get('document_type_detected')} | Confidence: {bank_verify.get('confidence')}")
    if not bank_verify.get("is_valid"):
        reason = bank_verify.get("rejection_reason", "The uploaded file does not appear to be a valid bank statement.")
        print(f"   ❌ Bank REJECTED: {reason}")
        raise HTTPException(422, f"Bank statement verification failed: {reason}")
    print(f"   ✅ Bank verified — {bank_verify.get('bank_name', 'Unknown Bank')}")

    # Check income document verification
    print(f"   Income → Valid: {income_verify.get('is_valid')} | Detected: {income_verify.get('document_type_detected')} | Confidence: {income_verify.get('confidence')}")
    if not income_verify.get("is_valid"):
        if income_doc_type == "salary_slip":
            reason = income_verify.get("rejection_reason", "The uploaded file does not appear to be a valid salary slip.")
            print(f"   ❌ Salary slip REJECTED: {reason}")
            raise HTTPException(422, f"Salary slip verification failed: {reason}")
        else:
            reason = income_verify.get("rejection_reason", "The uploaded file does not appear to be a valid ITR document.")
            print(f"   ❌ ITR REJECTED: {reason}")
            raise HTTPException(422, f"ITR verification failed: {reason}")

    if income_doc_type == "salary_slip":
        print(f"   ✅ Salary slip verified — {income_verify.get('employer_name', 'Unknown Employer')}")
    else:
        print(f"   ✅ ITR verified — PAN: {income_verify.get('pan_number')} | AY: {income_verify.get('assessment_year')}")

    # ── 3. Extract both documents in PARALLEL ──────────────────────────────
    print("\n⚡ Extracting documents in parallel...")
    salary_data = None

    if income_doc_type == "salary_slip":
        # Run bank extraction + salary extraction together
        salary_content_type = salary_slip.content_type

        bank_result, salary_result = await asyncio.gather(
            loop.run_in_executor(None, extract_bank_statement, bank_bytes),
            loop.run_in_executor(None, extract_salary_slip, salary_bytes, salary_content_type),
        )

        if "error" in salary_result:
            raise HTTPException(422, f"Salary slip extraction failed: {salary_result['error']}")
        salary_data = salary_result

        print("\n" + "=" * 60)
        print("💰 SALARY SLIP EXTRACTED")
        print("=" * 60)
        print(f"  Employer Name  : {salary_result.get('employer_name')}")
        print(f"  Designation    : {salary_result.get('designation')}")
        print(f"  Net Pay        : {salary_result.get('net_pay')}")
        print(f"  Gross Pay      : {salary_result.get('gross_pay')}")
        print(f"  Month/Year     : {salary_result.get('pay_period')}")
        print("=" * 60 + "\n")


    else:

        itr_content_type = itr.content_type if itr else "application/pdf"

        bank_result, itr_result = await asyncio.gather(

            loop.run_in_executor(None, extract_bank_statement, bank_bytes),

            loop.run_in_executor(None, extract_itr, itr_bytes, itr_content_type),

        )

        if "error" in itr_result:
            raise HTTPException(422, f"ITR extraction failed: {itr_result['error']}")

        itr_quality = validate_itr_quality(itr_result)
        if not itr_quality["is_valid"]:
            raise HTTPException(422, {
                "type": "itr_quality",
                "reason": itr_quality["reason"],
                "message": itr_quality["user_message"],
            })

        itr_income = itr_result.get("income", {})

        # net_income = itr_income.get("net_taxable_income", 0) or 0
        net_income = itr_income.get("gross_total_income", 0) or itr_income.get("net_taxable_income", 0) or 0
        biz_income = itr_income.get("business_profession_income", 0) or 0

        sal_income = itr_income.get("salary_income", 0) or 0

        total_income = net_income or (biz_income + sal_income)

        avg_monthly = round(total_income / 12, 2) if total_income else 0


        salary_data = {
            "net_pay": avg_monthly,
            "gross_pay": avg_monthly,
            "pay_period": itr_result.get("assessment_year"),
            "employment_type": itr_result.get("employment_type", "SELF_EMPLOYED"),
            "annual_income": total_income,
            "employee_name": itr_result.get("taxpayer", {}).get("name"),
            "pan_number": itr_result.get("taxpayer", {}).get("pan"),
            "_source": "itr",
            "_itr_raw": itr_result,
        }

        print(f"\n📋 ITR EXTRACTED")

        print(f"  ITR Type     : {itr_result.get('itr_type')}")

        print(f"  AY           : {itr_result.get('assessment_year')}")

        print(f"  PAN          : {itr_result.get('taxpayer', {}).get('pan')}")

        print(f"  Net Income   : ₹{net_income:,.2f}")

        print(f"  Avg Monthly  : ₹{avg_monthly:,.2f}  ← used for scoring")
        # Step 2/7 fall back to bank-statement-derived income and self-declared employment_type.

    if "error" in bank_result:
        raise HTTPException(422, f"Bank statement extraction failed: {bank_result['error']}")

    print("\n" + "=" * 60)
    print("📄 BANK STATEMENT EXTRACTED")
    print("=" * 60)
    print(f"  Account Holder : {bank_result.get('account_holder')}")
    print(f"  Bank Name      : {bank_result.get('bank_name')}")
    print(f"  Account Number : {bank_result.get('account_number')}")
    print(f"  IFSC Code      : {bank_result.get('ifsc_code')}")
    print(f"  Period         : {bank_result.get('statement_period')}")
    print(f"  Opening Balance: {bank_result.get('opening_balance')}")
    print(f"  Months Found   : {list(bank_result.get('monthly_transactions', {}).keys())}")

    # ── Per-month totals + closing balance ──────────────────────────────────
    grand_credit = 0.0
    grand_debit = 0.0
    final_closing = 0.0
    monthly_txns = bank_result.get("monthly_transactions", {})

    print(f"\n  {'Month':<12} {'Transactions':>13} {'Total Credit':>14} {'Total Debit':>13} {'Closing Bal':>13}")
    print(f"  {'-' * 12} {'-' * 13} {'-' * 14} {'-' * 13} {'-' * 13}")

    for month, txns in monthly_txns.items():
        m_credit = sum(float(t.get("credit", 0) or 0) for t in txns)
        m_debit = sum(float(t.get("debit", 0) or 0) for t in txns)
        m_close = round(m_credit - m_debit, 2)
        grand_credit += m_credit
        grand_debit += m_debit
        final_closing = m_close
        print(f"  {month:<12} {len(txns):>13} {m_credit:>14,.2f} {m_debit:>13,.2f} {m_close:>13,.2f}")

    print(f"  {'-' * 12} {'-' * 13} {'-' * 14} {'-' * 13} {'-' * 13}")
    print(f"  {'TOTAL':<12} {'':>13} {grand_credit:>14,.2f} {grand_debit:>13,.2f} {final_closing:>13,.2f}")
    print(f"\n  Net Flow (Credit - Debit): ₹{grand_credit - grand_debit:,.2f}")
    print("=" * 60)
    print("\n📋 FULL EXTRACTED JSON:")
    print(json.dumps(bank_result, indent=2, ensure_ascii=False))
    print("=" * 60 + "\n")

    monthly_transactions = bank_result.get("monthly_transactions", {})
    if not monthly_transactions:
        raise HTTPException(422, "Could not extract transactions from bank statement.")

    quality = validate_bank_statement_quality(monthly_transactions)
    if not quality["is_valid"]:
        raise HTTPException(422, {
            "type": "bank_statement_quality",
            "reason": quality["reason"],
            "message": quality["user_message"],
        })
    # ── 3. Run credit scoring ────────────────────────────────────────────────
    score_result = calculate_credit_score(
        monthly_transactions=monthly_transactions,
        salary_slip=salary_data,
        requested_loan_amount=requested_loan_amount,
        declared_employment_type=borrower["employment_type"],
    )
    # ── LOG 4: Final score breakdown ───────────────────────────────────────
    print("\n" + "=" * 60)
    print("🏆 CREDIT SCORE RESULT")
    print("=" * 60)
    print(f"  Final Score    : {score_result['final_score']}")
    print(f"  Grade          : {score_result['grade']}")
    print(f"  NBFC Action    : {score_result['nbfc_action']}")
    print(f"  Step1 FOIR     : {score_result['step1_foir']['foir_pct']}% → {score_result['step1_foir']['points']} pts")
    print(
        f"  Step2 Income   : ₹{score_result['step2_income_level']['income']} → {score_result['step2_income_level']['points']} pts")
    print(
        f"  Step3 Consist. : {score_result['step3_income_consistency']['variation_pct']}% → {score_result['step3_income_consistency']['points']} pts")
    print(
        f"  Step4 Bounces  : {score_result['step4_bounce_record']['total_bounces']} ")
    bounce_r = score_result['step4_bounce_record']
    risk_level = bounce_r.get('risk_level', 'N/A')
    is_risky = bounce_r.get('is_risky', False)
    risk_icon = '🚨 RISKY — AUTO REJECT' if is_risky else '✅ OK'
    print(f"    Risk Level     : {risk_level} ({bounce_r['points']} pts)  {risk_icon}")
    print(f"    Per Month      : {score_result['step4_bounce_record'].get('monthly_bounces', {})}")
    if score_result.get('risk_flag'):
        print(f"  ⚠️  RISK OVERRIDE  : {score_result.get('risk_reason')}")
    print(
        f"  Step5 Balance  : ₹{score_result['step5_average_balance']['avg_balance']} → {score_result['step5_average_balance']['points']} pts")
    print(f"  Step6 LTI      : {score_result['step6_lti']['lti']}x → {score_result['step6_lti']['points']} pts")
    print(
        f"  Step7 Emp.Type : {score_result['step7_employment_type']['category']} → {score_result['step7_employment_type']['points']} pts")
    print("=" * 60 + "\n")

    # ── 4. Store in credit_scores table ─────────────────────────────────────
    row = await database.fetch_one(
        """INSERT INTO credit_scores (
               borrower_id, base_score, final_score, grade, nbfc_action,
               step1_avg_obligations, step1_avg_income, step1_foir_pct, step1_points,
               step2_avg_bank_credits, step2_salary_net_pay, step2_income, step2_points,
               step3_avg_income, step3_std_dev, step3_variation_pct, step3_points,
               step4_total_bounces, step4_points,
               step5_avg_balance, step5_points,
               step6_annual_income, step6_requested_loan, step6_lti, step6_points,
               step7_category, step7_points,
               full_breakdown
           ) VALUES (
               :borrower_id, :base_score, :final_score, :grade, :nbfc_action,
               :step1_avg_obligations, :step1_avg_income, :step1_foir_pct, :step1_points,
               :step2_avg_bank_credits, :step2_salary_net_pay, :step2_income, :step2_points,
               :step3_avg_income, :step3_std_dev, :step3_variation_pct, :step3_points,
               :step4_total_bounces, :step4_points,
               :step5_avg_balance, :step5_points,
               :step6_annual_income, :step6_requested_loan, :step6_lti, :step6_points,
               :step7_category, :step7_points,
               :full_breakdown
           )
           RETURNING id, final_score, grade, nbfc_action, created_at""",
        {
            "borrower_id": borrower_id,
            "base_score": score_result["base_score"],
            "final_score": score_result["final_score"],
            "grade": score_result["grade"],
            "nbfc_action": score_result["nbfc_action"],

            "step1_avg_obligations": score_result["step1_foir"]["avg_monthly_obligations"],
            "step1_avg_income": score_result["step1_foir"]["avg_monthly_income"],
            "step1_foir_pct": score_result["step1_foir"]["foir_pct"],
            "step1_points": score_result["step1_foir"]["points"],

            "step2_avg_bank_credits": score_result["step2_income_level"]["avg_bank_credits"],
            "step2_salary_net_pay": score_result["step2_income_level"]["salary_slip_net_pay"],
            "step2_income": score_result["step2_income_level"]["income"],
            "step2_points": score_result["step2_income_level"]["points"],

            "step3_avg_income": score_result["step3_income_consistency"]["avg_income"],
            "step3_std_dev": score_result["step3_income_consistency"]["std_dev"],
            "step3_variation_pct": score_result["step3_income_consistency"]["variation_pct"],
            "step3_points": score_result["step3_income_consistency"]["points"],

            "step4_total_bounces": score_result["step4_bounce_record"]["total_bounces"],
            "step4_points": score_result["step4_bounce_record"]["points"],

            "step5_avg_balance": score_result["step5_average_balance"]["avg_balance"],
            "step5_points": score_result["step5_average_balance"]["points"],

            "step6_annual_income": score_result["step6_lti"]["annual_income"],
            "step6_requested_loan": score_result["step6_lti"]["requested_loan_amount"],
            "step6_lti": score_result["step6_lti"]["lti"],
            "step6_points": score_result["step6_lti"]["points"],

            "step7_category": score_result["step7_employment_type"]["category"],
            "step7_points": score_result["step7_employment_type"]["points"],

            "full_breakdown": json.dumps(score_result),
        }
    )

    # ── 5. Update borrower quick-access fields ──────────────────────────────

    # Build display-friendly data for the verified view
    bank_display = {
        "bank_name": bank_result.get("bank_name"),
        "account_holder": bank_result.get("account_holder"),
        "account_number": bank_result.get("account_number"),
        "statement_period": bank_result.get("statement_period"),
        "opening_balance": bank_result.get("opening_balance"),
        "ifsc_code": bank_result.get("ifsc_code"),
        "closing_balance": bank_result.get("closing_balance"),
        # "closing_balance": final_closing or bank_result.get("closing_balance"),
        "total_credits": round(grand_credit, 2),
        "total_debits": round(grand_debit, 2),
        "bounce_count": score_result["step4_bounce_record"]["total_bounces"],
        "avg_closing_balance": score_result["step5_average_balance"]["avg_balance"],
    }


    income_display = None
    if salary_data:
        if salary_data.get("_source") == "itr":
            itr_raw = salary_data.get("_itr_raw", {})
            itr_income = itr_raw.get("income", {}) if itr_raw else {}
            income_display = {
                "source": "itr",
                "taxpayer_name": salary_data.get("employee_name"),
                "pan_number": salary_data.get("pan_number"),
                "assessment_year": salary_data.get("pay_period"),
                "itr_type": itr_raw.get("itr_type") if itr_raw else None,
                "employment_type": salary_data.get("employment_type"),
                "gross_total_income": itr_income.get("gross_total_income", 0),
                "net_taxable_income": itr_income.get("net_taxable_income", 0),
                "monthly_equivalent": salary_data.get("net_pay"),
                "business_income": itr_income.get("business_profession_income", 0),
                "salary_income": itr_income.get("salary_income", 0),
            }
        else:
            pay_period = salary_data.get("pay_period") or ""
            parts = pay_period.split()
            income_display = {
                "source": "salary_slip",
                "employer_name": salary_data.get("employer_name"),
                "employee_name": salary_data.get("employee_name"),
                "designation": salary_data.get("designation"),
                "month": parts[0] if len(parts) >= 1 else None,
                "year": parts[-1] if len(parts) >= 2 else None,
                "gross_salary": salary_data.get("gross_pay"),
                "net_salary": salary_data.get("net_pay"),
                "total_deductions": salary_data.get("total_deductions"),
            }

    await database.execute(
        """UPDATE borrowers
                   SET credit_score = :score,
                       score_factors = :factors,
                       kyc_status = 'submitted',
                       bank_data = :bank_data,
                       income_data = :income_data,
                       requested_loan_amount = :req_amount
                   WHERE id = :id""",
        {
            "score": score_result["final_score"],
            "factors": json.dumps(score_result),
            "bank_data": json.dumps(bank_display),
            "income_data": json.dumps(income_display) if income_display else None,
            "req_amount": requested_loan_amount,
            "id": borrower_id,
        }
    )
    return {
        "message": "Documents processed successfully.",
        "credit_score_id": row["id"],
        "credit_score": row["final_score"],
        "grade": row["grade"],
        "nbfc_action": row["nbfc_action"],
        "factors": {
            "foir": score_result["step1_foir"]["points"],
            "income_level": score_result["step2_income_level"]["points"],
            "income_consistency": score_result["step3_income_consistency"]["points"],
            "bounce_record": score_result["step4_bounce_record"]["points"],
            "avg_balance": score_result["step5_average_balance"]["points"],
            "loan_to_income": score_result["step6_lti"]["points"],
            "employment_type": score_result["step7_employment_type"]["points"],
        },
        "breakdown": score_result,
        "bank_data": bank_display,
        "income_data": income_display,
    }


# @router.get("/score/{borrower_id}")
# async def get_credit_score(
#         borrower_id: int,
#         token: str = Depends(oauth2_scheme),
# ):
#     payload = decode_token(token)
#     if not payload or payload.get("borrower_id") != borrower_id:
#         raise HTTPException(401, "Invalid or expired token.")
#
#     row = await database.fetch_one(
#         """SELECT final_score, grade, nbfc_action, full_breakdown, created_at
#            FROM credit_scores
#            WHERE borrower_id = :id
#            ORDER BY created_at DESC
#            LIMIT 1""",
#         {"id": borrower_id}
#     )
#
#     if not row:
#         return {"score": None, "grade": None, "nbfc_action": None, "breakdown": None}
#
#
#     import json as _json
#
#     raw_breakdown = row["full_breakdown"]
#     # full_breakdown is stored as JSON string — parse it back to dict
#     if isinstance(raw_breakdown, str):
#         try:
#             raw_breakdown = _json.loads(raw_breakdown)
#         except Exception:
#             raw_breakdown = None
#
#     return {
#         "score": row["final_score"],
#         "grade": row["grade"],
#         "nbfc_action": row["nbfc_action"],
#         "breakdown": raw_breakdown,
#         "scored_at": str(row["created_at"]),
#     }

@router.get("/score/{borrower_id}")
async def get_credit_score(
        borrower_id: int,
        token: str = Depends(oauth2_scheme),
):
    payload = decode_token(token)
    if not payload or payload.get("borrower_id") != borrower_id:
        raise HTTPException(401, "Invalid or expired token.")

    row = await database.fetch_one(
        "SELECT credit_score, score_factors FROM borrowers WHERE id = :id",
        {"id": borrower_id}
    )

    if not row or not row["credit_score"]:
        return {"score": None, "grade": None, "nbfc_action": None, "breakdown": None}

    import json as _json

    raw_breakdown = row["score_factors"]
    if isinstance(raw_breakdown, str):
        try:
            raw_breakdown = _json.loads(raw_breakdown)
        except Exception:
            raw_breakdown = None

    return {
        "score": row["credit_score"],
        "grade": raw_breakdown.get("grade") if raw_breakdown else None,
        "nbfc_action": raw_breakdown.get("nbfc_action") if raw_breakdown else None,
        "breakdown": raw_breakdown,
    }

@router.get("/nbfcs")
async def get_eligible_nbfcs(score: int = 0, token: str = Depends(oauth2_scheme)):
    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "Invalid or expired token.")

    rows = await database.fetch_all(
        """SELECT id, company_name, company_type, city, state,
                  logo_url, interest_rate, min_loan_amount,
                  max_loan_amount, min_tenure_months, max_tenure_months,
                  processing_fee, min_credit_score,max_foir_percent
           FROM nbfcs
           WHERE status = 'active'
             AND rules_configured = 'true'
           ORDER BY
             CASE WHEN (:score = 0 OR min_credit_score <= :score) THEN 0 ELSE 1 END,
             interest_rate ASC""",
        {"score": score}
    )

    nbfcs = []
    for r in rows:
        d = dict(r)
        d["eligible"] = (score > 0 and d["min_credit_score"] <= score)
        nbfcs.append(d)

    return {"nbfcs": nbfcs}

@router.get("/loans/{borrower_id}")
async def get_borrower_loans(
    borrower_id: int,
    token: str = Depends(oauth2_scheme)
):
    tok = decode_token(token)
    if not tok:
        raise HTTPException(401, "Invalid token.")

    bid = tok.get("borrower_id") or tok.get("id")
    if bid != borrower_id:
        raise HTTPException(403, "Access denied.")

    rows = await database.fetch_all(
        """SELECT la.id, la.amount, la.tenure_months, la.interest_rate,
                  la.emi_amount, la.total_interest, la.total_payable,
                  la.processing_fee_amount, la.amount_disbursed,
                  la.purpose, la.status, la.applied_at,
                  la.rejection_reason, la.utr_number,
                  la.disbursement_mode, la.disbursed_at,
                  n.company_name as nbfc_name,
                  n.logo_url     as nbfc_logo
                  
           FROM loan_applications la
           JOIN nbfcs n ON n.id = la.nbfc_id
           WHERE la.borrower_id = :borrower_id
           ORDER BY la.applied_at DESC""",
        {"borrower_id": borrower_id}
    )

    return {"loans": [dict(r) for r in rows]}


@router.get("/loans/{borrower_id}/emi/{loan_id}")
async def get_emi_schedule(
    borrower_id: int,
    loan_id: int,
    token: str = Depends(oauth2_scheme)
):
    tok = decode_token(token)
    if not tok:
        raise HTTPException(401, "Invalid token.")

    bid = tok.get("borrower_id") or tok.get("id")
    if bid != borrower_id:
        raise HTTPException(403, "Access denied.")

    # Verify loan belongs to borrower
    loan = await database.fetch_one(
        "SELECT id FROM loan_applications WHERE id = :id AND borrower_id = :borrower_id",
        {"id": loan_id, "borrower_id": borrower_id}
    )
    if not loan:
        raise HTTPException(404, "Loan not found.")

    rows = await database.fetch_all(
        """SELECT id , instalment_number, due_date, amount,
                  principal_component, interest_component,
                  outstanding_balance, status, paid_at, paid_amount
           FROM emi_schedule
           WHERE loan_application_id = :loan_id
           ORDER BY instalment_number ASC""",
        {"loan_id": loan_id}
    )

    return {"emi_schedule": [dict(r) for r in rows]}


@router.post("/emi/{emi_id}/claim-payment")
async def claim_emi_payment(
        emi_id: int,
        data: EMIClaimPaymentRequest,
        token: str = Depends(oauth2_scheme),
):
    tok = decode_token(token)
    if not tok:
        raise HTTPException(401, "Invalid or expired token.")

    borrower_id = tok.get("borrower_id") or tok.get("id")

    # Verify EMI belongs to this borrower
    emi = await database.fetch_one(
        """SELECT es.id, es.status, es.amount, la.borrower_id
           FROM emi_schedule es
           JOIN loan_applications la ON la.id = es.loan_application_id
           WHERE es.id = :emi_id""",
        {"emi_id": emi_id}
    )
    if not emi:
        raise HTTPException(404, "EMI not found.")
    if emi["borrower_id"] != borrower_id:
        raise HTTPException(403, "Access denied.")
    if emi["status"] not in ("pending", "overdue"):
        raise HTTPException(400, f"Cannot claim payment for EMI with status '{emi['status']}'.")

    if not data.payment_reference.strip():
        raise HTTPException(400, "Payment reference is required.")
    if data.claimed_amount <= 0:
        raise HTTPException(400, "Claimed amount must be greater than 0.")

    await database.execute(
        """UPDATE emi_schedule
           SET status            = 'payment_claimed',
               payment_reference = :ref,
               claimed_amount    = :amount,
               claimed_at        = :now
           WHERE id = :id""",
        {
            "ref": data.payment_reference.strip(),
            "amount": data.claimed_amount,
            "now": datetime.now(),
            "id": emi_id,
        }
    )

    return {"message": "Payment claim submitted. Waiting for lender confirmation."}


@router.post("/emi/{emi_id}/claim")
async def claim_emi_payment(
    emi_id: int,
    payload: EMIClaimPaymentRequest,
    token: str = Depends(oauth2_scheme),
):
    tok = decode_token(token)
    if not tok:
        raise HTTPException(401, "Invalid or expired token.")

    emi = await database.fetch_one(
        """SELECT es.id, es.status, la.borrower_id
           FROM emi_schedule es
           JOIN loan_applications la ON la.id = es.loan_application_id
           WHERE es.id = :id""",
        {"id": emi_id}
    )
    if not emi:
        raise HTTPException(404, "EMI instalment not found.")
    if emi["borrower_id"] != tok.get("borrower_id"):
        raise HTTPException(403, "Access denied.")
    if emi["status"] not in ("pending", "overdue"):
        raise HTTPException(400, f"Cannot claim payment for EMI in status '{emi['status']}'.")

    await database.execute(
        """UPDATE emi_schedule
           SET status = 'payment_claimed',
               payment_reference = :ref,
               claimed_amount = :amount,
               claimed_at = NOW()
           WHERE id = :id""",
        {"ref": payload.payment_reference, "amount": payload.claimed_amount, "id": emi_id}
    )

    return {"message": "Payment claim submitted. Awaiting NBFC confirmation."}

@router.get("/loans/{borrower_id}/bank-details/{loan_id}")
async def get_loan_bank_details(
    borrower_id: int, loan_id: int,
    token: str = Depends(oauth2_scheme),
):
    tok = decode_token(token)
    if not tok or tok.get("borrower_id") != borrower_id:
        raise HTTPException(403, "Access denied.")

    row = await database.fetch_one(
        """SELECT n.bank_name, n.bank_account_no, n.bank_ifsc, n.upi_id
           FROM loan_applications la
           JOIN nbfcs n ON n.id = la.nbfc_id
           WHERE la.id = :loan_id AND la.borrower_id = :borrower_id""",
        {"loan_id": loan_id, "borrower_id": borrower_id}
    )
    if not row:
        raise HTTPException(404, "Loan not found.")
    return dict(row)

@router.put("/change-password/{borrower_id}")
async def change_password(borrower_id: int, data: ChangePasswordRequest, token: str = Depends(oauth2_scheme)):
    payload = decode_token(token)
    if payload.get("borrower_id") != borrower_id:
        raise HTTPException(403, "Access denied.")

    borrower = await database.fetch_one("SELECT hashed_password FROM borrowers WHERE id = :id", {"id": borrower_id})
    if not borrower:
        raise HTTPException(404, "Borrower not found.")

    if not verify_password(data.current_password, borrower["hashed_password"]):
        raise HTTPException(400, "Current password is incorrect.")
    if len(data.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters.")

    await database.execute(
        "UPDATE borrowers SET hashed_password = :ph WHERE id = :id",
        {"ph": hash_password(data.new_password), "id": borrower_id}
    )
    return {"message": "Password updated successfully."}


@router.delete("/account/{borrower_id}")
async def delete_account(borrower_id: int, token: str = Depends(oauth2_scheme)):
    payload = decode_token(token)
    if payload.get("borrower_id") != borrower_id:
        raise HTTPException(403, "Access denied.")

    active_loans = await database.fetch_one(
        "SELECT COUNT(*) as count FROM loan_applications WHERE borrower_id = :id AND status IN ('active','disbursed')",
        {"id": borrower_id}
    )
    if active_loans["count"] > 0:
        raise HTTPException(400, "Cannot delete account with active/disbursed loans outstanding.")

    await database.execute(
        "UPDATE borrowers SET status = 'blocked' WHERE id = :id",
        {"id": borrower_id}
    )
    return {"message": "Account deactivated."}


@router.delete("/account/{borrower_id}")
async def delete_account(borrower_id: int, token: str = Depends(oauth2_scheme)):
    payload = decode_token(token)
    if payload.get("borrower_id") != borrower_id:
        raise HTTPException(403, "Access denied.")

    active_loans = await database.fetch_one(
        "SELECT COUNT(*) as count FROM loan_applications WHERE borrower_id = :id AND status IN ('active','disbursed')",
        {"id": borrower_id}
    )
    if active_loans["count"] > 0:
        raise HTTPException(400, "Cannot delete account with active/disbursed loans outstanding.")

    await database.execute(
        "UPDATE borrowers SET status = 'blocked' WHERE id = :id",
        {"id": borrower_id}
    )
    return {"message": "Account deactivated."}


# ── Chatbot ─────────────────────────────────────────────────────────────────

class ChatbotRequest(BaseModel):
    message: str
    history: list = []   # [{"role": "user"|"assistant", "content": str}, ...]


@router.post("/chatbot")
async def chatbot(data: ChatbotRequest, token: str = Depends(oauth2_scheme)):
    tok = decode_token(token)
    if not tok:
        raise HTTPException(401, "Invalid or expired token.")
    borrower_id = tok.get("borrower_id") or tok.get("id")

    if not data.message.strip():
        raise HTTPException(400, "Message cannot be empty.")

    try:
        reply = await ask_chatbot(borrower_id, data.message.strip(), data.history)
    except Exception as e:
        raise HTTPException(500, f"Chatbot is temporarily unavailable: {e}")

    return {"reply": reply}
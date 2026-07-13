
import statistics

BASE_SCORE = 300

EMI_KEYWORDS = [
    "EMI", "LOAN", "NACH", "ECS", "NEFT EMI",
    "MANDATE", "AUTO DEBIT", "AUTODEBIT",
    "REPAYMENT", "INSTALMENT", "INSTALLMENT"
]
BOUNCE_KEYWORDS = [
    "BOUNCE", "RETURN", "DISHONOUR", "DISHONOR",
    "INSUFFICIENT FUNDS", "INSUFF FUNDS",
    "CHQ RTN", "CHEQUE RETURN", "ACH RETURN",
    "NACH RETURN", "UNPAID", "NOT PAID"
]
GOVT_KEYWORDS     = ["GOVERNMENT", "STATE", "CENTRAL", "MINISTRY"]
CONTRACT_KEYWORDS = ["CONTRACT", "TEMP"]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _matches_any(description: str, keywords: list[str]) -> bool:
    desc = (description or "").upper()
    return any(k in desc for k in keywords)


def _monthly_credit_total(transactions: list[dict]) -> float:
    # FIX: use .get() — avoids KeyError if key missing
    return sum(float(t.get("credit", 0) or 0) for t in transactions)


def _monthly_debit_total(transactions: list[dict]) -> float:
    # FIX: use .get() — avoids KeyError if key missing
    return sum(float(t.get("debit", 0) or 0) for t in transactions)


def _monthly_emi_total(transactions: list[dict]) -> float:
    return sum(
        float(t.get("debit", 0) or 0) for t in transactions
        if float(t.get("debit", 0) or 0) > 0
        and _matches_any(t.get("description", ""), EMI_KEYWORDS)
    )


def _month_bounce_count(transactions: list[dict]) -> int:
    return sum(
        1 for t in transactions
        if _matches_any(t.get("description", ""), BOUNCE_KEYWORDS)
    )


# def _month_closing_balance(transactions: list[dict]) -> float:
#     """
#     Returns closing balance for the month.
#     FIX: falls back to credit - debit if balance field is missing or zero.
#     """
#     if not transactions:
#         return 0.0
#     last_bal = float(transactions[-1].get("balance", 0) or 0)
#     if last_bal:
#         return last_bal
#     # fallback — compute net from transactions
#     total_credit = _monthly_credit_total(transactions)
#     total_debit  = _monthly_debit_total(transactions)
#     return round(total_credit - total_debit, 2)

def _month_closing_balance(transactions: list[dict]) -> float:
    if not transactions:
        return 0.0
    total_credit = _monthly_credit_total(transactions)
    total_debit  = _monthly_debit_total(transactions)
    return round(total_credit - total_debit, 2)

def _is_itr(salary_data: dict | None) -> bool:
    """Returns True if income data came from ITR (self-employed path)."""
    return bool(salary_data and salary_data.get("_source") == "itr")


# ─── Step 1 — FOIR (Max 150) ──────────────────────────────────────────────────
# Same for salaried and ITR — EMI obligations from bank ÷ avg monthly credits

def calc_foir(monthly_transactions: dict) -> dict:
    obligations_per_month = []
    income_per_month      = []

    for month, txns in monthly_transactions.items():
        obligations_per_month.append(_monthly_emi_total(txns))
        income_per_month.append(_monthly_credit_total(txns))

    avg_obligations = statistics.mean(obligations_per_month) if obligations_per_month else 0
    avg_income      = statistics.mean(income_per_month) if income_per_month else 0
    foir_pct        = (avg_obligations / avg_income * 100) if avg_income > 0 else 100

    if foir_pct < 30:    points = 150
    elif foir_pct < 40:  points = 120
    elif foir_pct < 50:  points = 80
    elif foir_pct <= 60: points = 40
    else:                points = 0

    return {
        "avg_monthly_obligations": round(avg_obligations, 2),
        "avg_monthly_income":      round(avg_income, 2),
        "foir_pct":                round(foir_pct, 2),
        "points":                  points,
        "max_points":              150,
    }


# ─── Step 2 — Income Level (Max 120) ──────────────────────────────────────────
# Salaried  → salary slip net pay  (or bank credits if no slip)
# ITR       → net taxable income ÷ 12  (do NOT mix with bank credits)

def calc_income_level(
    monthly_transactions: dict,
    salary_slip_net_pay:  float,
    salary_data:          dict | None = None,
) -> dict:
    income_per_month = [_monthly_credit_total(txns) for txns in monthly_transactions.values()]
    avg_bank_credits = statistics.mean(income_per_month) if income_per_month else 0

    if _is_itr(salary_data):
        # ITR path: use declared annual income ÷ 12
        # Business credits in bank ≠ income (GST inflows, transfers etc. inflate bank credits)
        income = float(salary_slip_net_pay or 0)
        source = "ITR_ANNUAL_÷12"
    else:
        # Salaried path: take whichever is higher — slip or bank credits
        income = max(salary_slip_net_pay or 0, avg_bank_credits)
        source = "SALARY_SLIP" if salary_slip_net_pay else "BANK_STATEMENT"

    if income > 100000:   points = 120
    elif income >= 75000: points = 100
    elif income >= 50000: points = 80
    elif income >= 30000: points = 60
    elif income >= 15000: points = 40
    else:                 points = 20

    return {
        "avg_bank_credits":    round(avg_bank_credits, 2),
        "salary_slip_net_pay": salary_slip_net_pay or 0,
        "income":              round(income, 2),
        "source":              source,
        "points":              points,
        "max_points":          120,
    }


# ─── Step 3 — Income Consistency (Max 100) ────────────────────────────────────
# Salaried  → strict (salary should be identical each month, < 10% variation)
# ITR       → relaxed (business income is seasonal, up to 30% variation OK)

def calc_income_consistency(
    monthly_transactions: dict,
    salary_data:          dict | None = None,
) -> dict:
    income_per_month = [_monthly_credit_total(txns) for txns in monthly_transactions.values()]

    avg_income    = statistics.mean(income_per_month) if income_per_month else 0
    std_dev       = statistics.pstdev(income_per_month) if len(income_per_month) > 1 else 0
    variation_pct = (std_dev / avg_income * 100) if avg_income > 0 else 100

    if _is_itr(salary_data):
        # Self-employed: wider tolerance — seasonal and project-based income is normal
        if variation_pct < 30:    points = 100
        elif variation_pct < 50:  points = 80
        elif variation_pct < 70:  points = 55
        elif variation_pct <= 90: points = 30
        else:                     points = 10
        note = "ITR self-employed tolerance applied"
    else:
        # Salaried: strict — salary should be near-identical every month
        if variation_pct < 10:    points = 100
        elif variation_pct < 20:  points = 80
        elif variation_pct < 35:  points = 55
        elif variation_pct <= 50: points = 30
        else:                     points = 10
        note = "salaried consistency check"

    return {
        "monthly_income": [round(v, 2) for v in income_per_month],
        "avg_income":     round(avg_income, 2),
        "std_dev":        round(std_dev, 2),
        "variation_pct":  round(variation_pct, 2),
        "note":           note,
        "points":         points,
        "max_points":     100,
    }


# ─── Step 4 — Bounce Record (Max 100) ─────────────────────────────────────────
# Same for salaried and ITR — bounces come from bank statement

def calc_bounce_record(monthly_transactions: dict) -> dict:
    monthly_bounces = {
        month: _month_bounce_count(txns)
        for month, txns in monthly_transactions.items()
    }
    total_bounces = sum(monthly_bounces.values())

    if total_bounces == 0:
        points     = 100
        risk_level = "NONE"
    elif total_bounces == 1:
        points     = 70
        risk_level = "LOW"
    elif total_bounces == 2:
        points     = 40
        risk_level = "MEDIUM"
    else:
        # > 2 bounces — HIGH RISK, 0 points, triggers AUTO_REJECT override
        points     = 0
        risk_level = "HIGH"

    return {
        "total_bounces":   total_bounces,
        "monthly_bounces": monthly_bounces,
        "risk_level":      risk_level,
        "is_risky":        total_bounces > 2,
        "points":          points,
        "max_points":      100,
    }


# ─── Step 5 — Average Balance (Max 80) ────────────────────────────────────────
# Same for salaried and ITR — balance comes from bank statement

def calc_average_balance(monthly_transactions: dict) -> dict:
    closing_balances = [
        _month_closing_balance(txns)
        for txns in monthly_transactions.values()
    ]
    avg_balance = statistics.mean(closing_balances) if closing_balances else 0

    if avg_balance > 50000:    points = 80
    elif avg_balance >= 25000: points = 65
    elif avg_balance >= 10000: points = 45
    elif avg_balance >= 5000:  points = 25
    else:                      points = 10

    return {
        "monthly_closing_balances": [round(v, 2) for v in closing_balances],
        "avg_balance":              round(avg_balance, 2),
        "points":                   points,
        "max_points":               80,
    }


# ─── Step 6 — Loan-to-Income Ratio (Max 30) ───────────────────────────────────
# Salaried  → monthly salary × 12
# ITR       → annual income directly from ITR (more accurate than × 12)

def calc_lti(
    monthly_income:        float,
    requested_loan_amount: float,
    salary_data:           dict | None = None,
) -> dict:
    if _is_itr(salary_data):
        # Use full annual income from ITR — avoids double-conversion
        annual_income = float(salary_data.get("annual_income", 0) or 0)
        if not annual_income:
            annual_income = (monthly_income or 0) * 12   # fallback
        source = "ITR_ANNUAL"
    else:
        annual_income = (monthly_income or 0) * 12
        source        = "SALARY_MONTHLY_×12"

    lti = (requested_loan_amount / annual_income) if annual_income > 0 else float("inf")

    if lti < 3:    points = 30
    elif lti <= 4: points = 20
    elif lti <= 5: points = 10
    else:          points = 0

    return {
        "annual_income":         round(annual_income, 2),
        "requested_loan_amount": requested_loan_amount,
        "lti":                   round(lti, 2) if lti != float("inf") else None,
        "income_source":         source,
        "points":                points,
        "max_points":            30,
    }


# ─── Step 7 — Employment Type (Max 20) ────────────────────────────────────────
# Salaried  → detect Govt / Private / Contract from salary slip employer name
# ITR       → use employment_type field from ITR extraction (verified by LLM)

def calc_employment_type(
    salary_slip_employer_name: str | None,
    salary_slip_designation:   str | None,
    declared_employment_type:  str | None,
    salary_data:               dict | None = None,
) -> dict:

    if _is_itr(salary_data):
        # ITR-verified employment type — more reliable than self-declared
        emp_type = (salary_data.get("employment_type") or "SELF_EMPLOYED").upper()
        if emp_type == "SALARIED":
            category, points = "Salaried (ITR Verified)", 20
        elif emp_type == "BOTH":
            category, points = "Salaried + Business (ITR)", 18
        else:
            # SELF_EMPLOYED verified by ITR — better than self-declared
            category, points = "Self Employed (ITR Verified)", 14
        note = f"ITR employment_type: {emp_type}"

    elif salary_slip_employer_name or salary_slip_designation:
        # Salaried — detect sub-category from employer name
        combined = " ".join(filter(None, [salary_slip_employer_name, salary_slip_designation]))
        if _matches_any(combined, GOVT_KEYWORDS):
            category, points = "Govt / PSU", 20
        elif _matches_any(combined, CONTRACT_KEYWORDS):
            category, points = "Private Contract", 10
        else:
            category, points = "Private Permanent", 15
        note = f"detected from salary slip: {combined[:40]}"

    elif declared_employment_type and "self_employed" in declared_employment_type.lower():
        # Self-declared only — least reliable
        category, points = "Self Employed (Self Declared)", 8
        note = "self-declared, no ITR"

    else:
        category, points = "Unknown", 5
        note = "no employment proof"

    return {
        "category":   category,
        "points":     points,
        "max_points": 20,
        "note":       note,
    }


# ─── Grade Bands ──────────────────────────────────────────────────────────────

GRADE_BANDS = [
    (750, 900, "Excellent",  "HIGH_APPROVAL"),
    (650, 749, "Good",       "LIKELY_APPROVED"),
    (550, 649, "Fair",       "CONDITIONAL_APPROVAL"),
    (450, 549, "Poor",       "LOW_APPROVAL_CHANCE"),
    (300, 449, "Very Poor",  "AUTO_REJECT"),
]


def _grade_for_score(score: int) -> dict:
    for low, high, grade, action in GRADE_BANDS:
        if low <= score <= high:
            return {"grade": grade, "nbfc_action": action}
    return {"grade": "Unknown", "nbfc_action": "MANUAL_REVIEW"}


# ─── Main Entry Point ──────────────────────────────────────────────────────────

def calculate_credit_score(
    monthly_transactions:    dict,
    salary_slip:             dict | None = None,
    requested_loan_amount:   float = 0,
    declared_employment_type: str | None = None,
) -> dict:
    """
    Calculates credit score from bank statement + income document.

    Args:
        monthly_transactions    : {\"Apr 2026\": [{date, description, debit, credit, balance}]}
        salary_slip             : dict from salary_slip_service OR itr_service
                                  If from ITR: must have _source=\"itr\" and annual_income
                                  If from salary slip: must have net_pay, employer_name
        requested_loan_amount   : borrower's requested loan amount
        declared_employment_type: self-declared type (salaried / self_employed / etc.)
    """
    salary_slip   = salary_slip or {}
    net_pay       = float(salary_slip.get("net_pay", 0) or 0)
    employer_name = salary_slip.get("employer_name")
    designation   = salary_slip.get("designation")

    step1 = calc_foir(monthly_transactions)
    step2 = calc_income_level(monthly_transactions, net_pay, salary_slip)
    step3 = calc_income_consistency(monthly_transactions, salary_slip)
    step4 = calc_bounce_record(monthly_transactions)
    step5 = calc_average_balance(monthly_transactions)
    step6 = calc_lti(step2["income"], requested_loan_amount, salary_slip)
    step7 = calc_employment_type(employer_name, designation, declared_employment_type, salary_slip)

    total_points = (
        step1["points"] + step2["points"] + step3["points"] + step4["points"]
        + step5["points"] + step6["points"] + step7["points"]
    )
    final_score = BASE_SCORE + total_points

    # ── Hard override: > 2 bounces → AUTO_REJECT regardless of score ──────────
    if step4["is_risky"]:
        grade_info  = {"grade": "Very Poor", "nbfc_action": "AUTO_REJECT"}
        risk_flag   = True
        risk_reason = (
            f"HIGH BOUNCE RISK: {step4['total_bounces']} bounces detected "
            f"(threshold > 2). Monthly breakdown: {step4['monthly_bounces']}"
        )
    else:
        grade_info  = _grade_for_score(final_score)
        risk_flag   = False
        risk_reason = None

    return {
        "base_score":               BASE_SCORE,
        "step1_foir":               step1,
        "step2_income_level":       step2,
        "step3_income_consistency": step3,
        "step4_bounce_record":      step4,
        "step5_average_balance":    step5,
        "step6_lti":                step6,
        "step7_employment_type":    step7,
        "total_factor_points":      total_points,
        "final_score":              final_score,
        "risk_flag":                risk_flag,
        "risk_reason":              risk_reason,
        **grade_info,
    }
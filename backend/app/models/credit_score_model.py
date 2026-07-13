from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.core.database import Base


# ─── credit_scores ──────────────────────────────────────────────────────────
#
# One row per scoring attempt for a borrower (created in /upload-documents).
# Stores per-step breakdown for audit trail and Super Admin review.

class CreditScoreTable(Base):
    __tablename__ = "credit_scores"

    id              = Column(Integer, primary_key=True, index=True)
    borrower_id     = Column(Integer, ForeignKey("borrowers.id"), nullable=False, index=True)

    # Final result
    base_score      = Column(Integer, nullable=False, default=300)
    final_score     = Column(Integer, nullable=False)
    grade           = Column(String(20), nullable=False)   # Excellent / Good / Fair / Poor / Very Poor
    nbfc_action     = Column(String(50), nullable=False)

    # Step 1 - FOIR (max 150)
    step1_avg_obligations = Column(Numeric(14, 2))
    step1_avg_income      = Column(Numeric(14, 2))
    step1_foir_pct        = Column(Numeric(6, 2))
    step1_points          = Column(Integer)

    # Step 2 - Income Level (max 120)
    step2_avg_bank_credits = Column(Numeric(14, 2))
    step2_salary_net_pay   = Column(Numeric(14, 2))
    step2_income           = Column(Numeric(14, 2))
    step2_points           = Column(Integer)

    # Step 3 - Income Consistency (max 100)
    step3_avg_income    = Column(Numeric(14, 2))
    step3_std_dev       = Column(Numeric(14, 2))
    step3_variation_pct = Column(Numeric(6, 2))
    step3_points        = Column(Integer)

    # Step 4 - Bounce Record (max 100)
    step4_total_bounces = Column(Integer)
    step4_points        = Column(Integer)

    # Step 5 - Average Balance (max 80)
    step5_avg_balance = Column(Numeric(14, 2))
    step5_points      = Column(Integer)

    # Step 6 - Loan to Income Ratio (max 30)
    step6_annual_income  = Column(Numeric(14, 2))
    step6_requested_loan = Column(Numeric(14, 2))
    step6_lti            = Column(Numeric(6, 2), nullable=True)
    step6_points         = Column(Integer)

    # Step 7 - Employment Type (max 20)
    step7_category = Column(String(30))
    step7_points   = Column(Integer)

    # Full breakdown stored as JSON for flexibility / Super Admin display
    full_breakdown = Column(JSONB, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
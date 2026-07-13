from sqlalchemy import Column, Integer, String, DateTime, Text, Float, ForeignKey
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import Optional
from app.core.database import Base



class LoanApplicationTable(Base):
    __tablename__ = "loan_applications"

    id              = Column(Integer, primary_key=True, index=True)

    # Foreign keys
    borrower_id     = Column(Integer, ForeignKey("borrowers.id"), nullable=False, index=True)
    nbfc_id         = Column(Integer, ForeignKey("nbfcs.id"),     nullable=False, index=True)

    # Loan request (filled by borrower at apply time)
    amount          = Column(Float,   nullable=False)           # requested amount in ₹
    tenure_months   = Column(Integer, nullable=False)           # requested tenure
    purpose         = Column(String(200), nullable=True)        # e.g. "Home renovation"

    # Loan terms (filled by NBFC on approval)
    approved_amount = Column(Float,   nullable=True)            # may differ from requested
    interest_rate   = Column(Float,   nullable=True)            # % per annum
    emi_amount      = Column(Float,   nullable=True)            # calculated EMI
    processing_fee  = Column(Float,   nullable=True)            # one-time fee
    # EMI breakdown snapshot (saved at borrower apply time)
    total_interest        = Column(Float, nullable=True)
    total_payable         = Column(Float, nullable=True)
    processing_fee_amount = Column(Float, nullable=True)
    amount_disbursed      = Column(Float, nullable=True)

    # Affordability snapshot (saved at borrower apply time)
    monthly_income        = Column(Float, nullable=True)
    existing_emis         = Column(Float, nullable=True)
    safe_emi              = Column(Float, nullable=True)
    foir_at_application   = Column(Float, nullable=True)
    agreement_text = Column(Text, nullable=True)
    # Decision
    status          = Column(String(20), default="pending", index=True)
    # pending / applied / approved / active / disbursed / rejected / closed

    rejection_reason = Column(Text, nullable=True)              # filled by NBFC on rejection
    notes            = Column(Text, nullable=True)              # internal NBFC notes

    # Timestamps
    applied_at      = Column(DateTime(timezone=True), server_default=func.now())
    decided_at      = Column(DateTime(timezone=True), nullable=True)  # approve/reject time
    disbursed_at    = Column(DateTime(timezone=True), nullable=True)
    utr_number = Column(String(50), nullable=True)
    disbursement_mode = Column(String(20), nullable=True)  # NEFT / IMPS / RTGS
    disbursed_by = Column(String(100), nullable=True)  # NBFC staff name
    closed_at       = Column(DateTime(timezone=True), nullable=True)


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class LoanApplyRequest(BaseModel):
    borrower_id:    int
    nbfc_id:        int
    amount:         float
    tenure_months:  int
    purpose:        Optional[str] = None


class LoanApproveRequest(BaseModel):
    nbfc_id:         int
    approved_amount: float
    interest_rate:   float
    tenure_months:   int
    notes:           Optional[str] = None


class LoanRejectRequest(BaseModel):
    nbfc_id:          int
    rejection_reason: str

class LoanApplicationRequest(BaseModel):
    borrower_id:           int
    nbfc_id:               int
    loan_amount:           float
    tenure_months:         int
    purpose:               str
    interest_rate:         float
    emi_amount:            float
    total_interest:        float
    total_payable:         float
    processing_fee_amount: float
    amount_disbursed:      float
    monthly_income:        Optional[float] = None
    existing_emis:         Optional[float] = None
    safe_emi:              Optional[float] = None
    foir_at_application:   Optional[float] = None

class DisburseRequest(BaseModel):
    utr_number: str
    disbursement_mode: str  # NEFT / IMPS / RTGS
    disbursed_by: Optional[str] = None
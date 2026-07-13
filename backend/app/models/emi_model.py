

from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, Date, Text,Boolean
from sqlalchemy.sql import func
from pydantic import BaseModel
from typing import Optional
from app.core.database import Base


class EMIScheduleTable(Base):
    __tablename__ = "emi_schedule"

    id                   = Column(Integer, primary_key=True, index=True)

    # Foreign key — which loan this EMI belongs to
    loan_application_id  = Column(
        Integer, ForeignKey("loan_applications.id"), nullable=False, index=True
    )

    # Instalment details
    instalment_number    = Column(Integer, nullable=False)      # 1, 2, 3 … n
    due_date             = Column(Date,    nullable=False, index=True)
    amount               = Column(Float,   nullable=False)      # EMI amount in ₹
    principal_component  = Column(Float,   nullable=True)       # portion going to principal
    interest_component   = Column(Float,   nullable=True)       # portion going to interest
    outstanding_balance  = Column(Float,   nullable=True)       # remaining principal after payment

    # Payment tracking
    status               = Column(String(20), default="pending", index=True)
    # pending / payment_claimed / paid / overdue / waived

    paid_at              = Column(DateTime(timezone=True), nullable=True)
    paid_amount          = Column(Float,   nullable=True)       # actual amount received
    late_penalty_applied = Column(Float,   default=0.0)         # penalty added if overdue

    # ── Borrower claim fields ───────────────────────────────────────────────
    payment_reference    = Column(String(100), nullable=True)   # UTR / UPI ref entered by borrower
    claimed_at            = Column(DateTime(timezone=True), nullable=True)
    claimed_amount         = Column(Float, nullable=True)

    # ── NBFC dispute fields ─────────────────────────────────────────────────
    dispute_reason        = Column(Text, nullable=True)
    disputed_at            = Column(DateTime(timezone=True), nullable=True)

    reminder_sent = Column(Boolean, default=False)
    late_fee_applied = Column(Boolean, default=False)
    late_fee_amount = Column(Float, default=0.0)

    # Timestamps
    created_at           = Column(DateTime(timezone=True), server_default=func.now())


# ─── Pydantic schemas ─────────────────────────────────────────────────────────

class EMIPaymentRequest(BaseModel):
    loan_application_id: int
    instalment_number:   int
    paid_amount:         float


class EMIClaimPaymentRequest(BaseModel):
    payment_reference: str
    claimed_amount:    float


class EMIDisputeRequest(BaseModel):
    dispute_reason: str
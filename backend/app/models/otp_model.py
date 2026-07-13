# ─────────────────────────────────────────────────────────────────────────────
#  app/models/otp_model.py
#  OTP table for loan agreement signing
# ─────────────────────────────────────────────────────────────────────────────

from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class LoanOTPTable(Base):
    __tablename__ = "loan_otps"

    id          = Column(Integer, primary_key=True, index=True)
    borrower_id = Column(Integer, nullable=False, index=True)
    loan_id     = Column(Integer, nullable=False, index=True)
    otp_code    = Column(String(6), nullable=False)
    purpose     = Column(String(50), default="loan_sign")
    is_used     = Column(Boolean, default=False)
    expires_at  = Column(DateTime(timezone=True), nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
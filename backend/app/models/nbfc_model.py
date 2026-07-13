
from sqlalchemy import Column, Integer, String, DateTime, Text, Float
from sqlalchemy.sql import func
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.core.database import Base


# ─── SQLAlchemy Table ─────────────────────────────────────────────────────────

class NBFCTable(Base):
    __tablename__ = "nbfcs"

    id                  = Column(Integer, primary_key=True, index=True)
    company_name        = Column(String(200), nullable=False)
    company_type        = Column(String(100), nullable=True)
    registration_number = Column(String(100), unique=True, nullable=False)
    gst_number          = Column(String(20),  nullable=True)
    email               = Column(String(150), unique=True, nullable=False, index=True)
    mobile              = Column(String(15),  nullable=False)
    city                = Column(String(100), nullable=True)
    state               = Column(String(100), nullable=False)

    # Loan rules — configured in dashboard Settings after registration
    interest_rate       = Column(Float,   default=12.0)
    max_loan_amount     = Column(Integer, default=500000)
    min_loan_amount     = Column(Integer, default=10000)
    min_credit_score    = Column(Integer, default=600)
    max_tenure_months   = Column(Integer, default=36)
    min_tenure_months   = Column(Integer, default=3)
    processing_fee      = Column(Float,   default=2.0)
    late_penalty_flat   = Column(Integer, default=500)
    grace_period_days   = Column(Integer, default=3)
    rules_configured    = Column(String(5), default="false")
    max_foir_percent = Column(Float, default=50.0)
    hashed_password     = Column(Text,        nullable=False)
    status              = Column(String(20),  default="active")   # active / suspended / pending
    logo_url            = Column(Text,        nullable=True)
    brand_color         = Column(String(10),  default="#1b5068")
    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    last_login          = Column(DateTime(timezone=True), nullable=True)
    upi_id          = Column(String(50),  nullable=True)  # e.g. tatacapital@hdfcbank
    bank_account_no = Column(String(20),  nullable=True)
    bank_ifsc       = Column(String(15),  nullable=True)
    bank_name       = Column(String(100), nullable=True)
    suspension_reason = Column(Text, nullable=True)
# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class NBFCRegisterRequest(BaseModel):
    company_name:        str
    company_type:        Optional[str] = ""
    registration_number: str
    gst_number:          Optional[str] = ""
    email:               EmailStr
    mobile:              str
    city:                Optional[str] = ""
    state:               str
    password:            str


class NBFCLoginRequest(BaseModel):
    email:    EmailStr
    password: str

class NBFCBankUpdateRequest(BaseModel):
    upi_id:          Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc:       Optional[str] = None
    bank_name:       Optional[str] = None
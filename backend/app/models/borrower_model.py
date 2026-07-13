
from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from pydantic import BaseModel, EmailStr
from typing import Optional
from app.core.database import Base
import sqlalchemy as sa
# ─── SQLAlchemy Table ─────────────────────────────────────────────────────────

class BorrowerTable(Base):
    __tablename__ = "borrowers"

    id              = Column(Integer, primary_key=True, index=True)
    full_name       = Column(String(200), nullable=False)
    email           = Column(String(150), unique=True, nullable=False, index=True)
    mobile          = Column(String(15),  unique=True, nullable=False, index=True)
    hashed_password = Column(Text, nullable=False)

    # Identity fields (collected at registration for duplicate check only)
    # Actual KYC = document upload on kyc.html page → stored in kyc_records table
    aadhaar_number  = Column(String(20), unique=True, nullable=True)
    pan_number      = Column(String(15), unique=True, nullable=True)
    # Add these after pan_number column:
    date_of_birth = Column(String(20), nullable=True)  # DD/MM/YYYY from Aadhaar
    gender = Column(String(10), nullable=True)  # Male/Female/Other
    address = Column(Text, nullable=True)  # Address from Aadhaar
    employment_type = Column(String(50), nullable=True)  # Salaried / Self-Employed - Business Owner / Self-Employed - Professional

    # NBFC selection (set AFTER scoring — not at registration)
    nbfc_id         = Column(Integer, ForeignKey("nbfcs.id"), nullable=True)

    # Status
    kyc_status      = Column(String(20), default="pending")    # pending / submitted / verified
    loan_status     = Column(String(20), default="none")       # none / applied / approved / active / closed
    status          = Column(String(20), default="active")     # active / blocked
    bank_data = Column(sa.JSON, nullable=True)  # extracted bank statement display data
    income_data = Column(sa.JSON, nullable=True)
    # Credit score (set after AI scoring)
    credit_score    = Column(Integer, nullable=True)
    requested_loan_amount = Column(sa.Float, nullable=True, default=0)
    score_factors   = Column(Text, nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    last_login      = Column(DateTime(timezone=True), nullable=True)



# ─── Pydantic Schemas ─────────────────────────────────────────────────────────

class BorrowerRegisterRequest(BaseModel):
    full_name:      str
    email:          EmailStr
    mobile:         str
    password:       str
    aadhaar_number: Optional[str] = None
    pan_number:     Optional[str] = None

    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    employment_type: Optional[str] = None



class BorrowerLoginRequest(BaseModel):
    email:    EmailStr
    password: str
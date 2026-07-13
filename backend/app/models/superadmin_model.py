from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from pydantic import BaseModel
from app.core.database import Base

class SuperAdminTable(Base):
    __tablename__ = "superadmins"
    id              = Column(Integer, primary_key=True, index=True)
    full_name       = Column(String(120), nullable=False)
    email           = Column(String(120), unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    last_login      = Column(DateTime(timezone=True), nullable=True)

class SuperAdminLoginRequest(BaseModel):
    email: str
    password: str
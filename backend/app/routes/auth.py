from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import Dict
from app.core.database import database
from app.core.auth import hash_password
from app.services.email_service import send_password_reset_email, generate_otp

router = APIRouter(prefix="/api/auth", tags=["Global Auth"])

# In-memory storage for OTPs. 
# For a production environment, consider storing these in Redis or a DB table with an expiration timestamp.
otp_storage: Dict[str, str] = {}

class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

@router.post("/forgot-password")
async def forgot_password(request: ForgotPasswordRequest):
    email = request.email.strip().lower()
    
    # Check if the borrower exists in the database
    user = await database.fetch_one(
        "SELECT id, full_name, email FROM borrowers WHERE LOWER(email) = :email",
        {"email": email}
    )
    
    if not user:
        # We return a generic error to prevent email enumeration attacks
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="If this email is registered, an OTP has been sent."
        )
    
    # Generate and store the OTP
    otp = generate_otp(length=6)
    otp_storage[email] = otp  

    # Send the email using your email_service
    try:
        send_password_reset_email(to_email=user["email"], user_name=user["full_name"], otp=otp)
        return {"message": "OTP sent to your email."}
    except Exception as e:
        print(f"Email Sending Error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Failed to send OTP email. Please try again later."
        )

@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest):
    email = request.email.strip().lower()
    
    # 1. Verify the OTP exists and matches
    stored_otp = otp_storage.get(email)
    
    if not stored_otp or stored_otp != request.otp.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Invalid or expired OTP."
        )
        
    # 2. Hash the new password
    hashed_pw = hash_password(request.new_password)
    
    # 3. Update the database (Removed the 'if not updated' check to prevent false 404s)
    await database.execute(
        "UPDATE borrowers SET hashed_password = :ph WHERE LOWER(email) = :email",
        {"ph": hashed_pw, "email": email}
    )

    # 4. Clear the OTP so it can't be reused
    del otp_storage[email]
    
    return {"message": "Password successfully reset."}
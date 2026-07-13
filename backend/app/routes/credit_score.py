from fastapi import APIRouter, HTTPException, Depends
from app.services.credit_scoring_service import calculate_credit_score
from app.core.database import database
from app.core.auth import decode_token
from fastapi.security import OAuth2PasswordBearer
import json

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/borrower/login")
router = APIRouter()

@router.post("/calculate-score")
async def calculate_score(requested_loan_amount: float, token: str = Depends(oauth2_scheme)):
    payload = decode_token(token)
    if not payload:
        raise HTTPException(401, "Invalid or expired token.")
    borrower_id = payload.get("borrower_id")

    # Fetch borrower's stored extraction results
    borrower = await database.fetch_one("SELECT * FROM borrowers WHERE id = :id", {"id": borrower_id})
    if not borrower:
        raise HTTPException(404, "Borrower not found.")

    # These need to come from wherever you stored extraction results
    bank_statement_data = ...  # monthly_transactions dict
    salary_slip_data = ...     # salary slip extraction result or None

    result = calculate_credit_score(
        monthly_transactions=bank_statement_data,
        salary_slip=salary_slip_data,
        requested_loan_amount=requested_loan_amount,
        declared_employment_type=borrower["employment_type"],
    )

    await database.execute(
        "UPDATE borrowers SET credit_score = :score, score_factors = :factors WHERE id = :id",
        {"score": result["final_score"], "factors": json.dumps(result), "id": borrower_id}
    )

    return result
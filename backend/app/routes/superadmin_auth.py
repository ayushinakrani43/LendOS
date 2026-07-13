from fastapi import APIRouter, HTTPException
from datetime import datetime
from app.models.superadmin_model import SuperAdminLoginRequest
from app.core.database import database
from app.core.auth import verify_password, create_access_token

router = APIRouter()

@router.post("/login")
async def login_superadmin(data: SuperAdminLoginRequest):
    admin = await database.fetch_one("SELECT * FROM superadmins WHERE email = :e", {"e": data.email})
    if not admin or not verify_password(data.password, admin["hashed_password"]):
        raise HTTPException(401, "Invalid email or password.")

    await database.execute(
        "UPDATE superadmins SET last_login = :now WHERE id = :id",
        {"now": datetime.now(), "id": admin["id"]}
    )
    token = create_access_token({"admin_id": admin["id"], "email": admin["email"], "role": "superadmin"})
    return {"access_token": token, "token_type": "bearer", "full_name": admin["full_name"]}
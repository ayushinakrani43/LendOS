
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse    # noqa
from app.core.database import database, Base, sync_engine   # noqa
from app.routes import nbfc_auth    # noqa
from app.models import nbfc_model  # noqa — needed for table creation
import os
from app.routes import borrower_auth    # noqa
from app.models import borrower_model  # noqa — needed for table creation
from app.routes import kyc# noqa
from app.routes import superadmin_auth    # noqa
from app.models import superadmin_model   # noqa — needed for table creation
from app.routes import nbfc_dashboard  # noqa
from app.models import loan_model    # noqa — loan_applications table
from app.models import emi_model     # noqa — emi_schedule table
from app.models import otp_model  # noqa — creates loan_otps table
from app.routes import borrower   # noqa — creates
from app.models import credit_score_model  # noqa — creates score table
from app.routes import loan_application  # noqa — creates
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.services.emi_scheduler_service import run_daily_emi_jobs #noqa
from app.models import superadmin_model
from app.routes import superadmin_dashboard  # noqa
from app.routes import auth
from dotenv import load_dotenv
load_dotenv()
app = FastAPI(title="LendOS — NBFC Lending Platform", version="1.0.0")
scheduler = AsyncIOScheduler()

@app.on_event("startup")
async def start_scheduler():
    scheduler.add_job(run_daily_emi_jobs, "cron", hour=9, minute=0)
    scheduler.start()
    print("[SCHEDULER] APScheduler started — daily EMI jobs at 9:00 AM")

@app.on_event("shutdown")
async def stop_scheduler():
    scheduler.shutdown()

@app.post("/api/admin/run-emi-jobs-now")
async def trigger_emi_jobs_manually():
    await run_daily_emi_jobs()
    return {"message": "EMI jobs executed manually."}
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-actual-url.up.railway.app"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Startup / Shutdown ───────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    Base.metadata.create_all(bind=sync_engine)
    await database.connect()
    print("✅ PostgreSQL connected. Tables ready.")


@app.on_event("shutdown")
async def shutdown():
    await database.disconnect()


# ─── API Routes ───────────────────────────────────────────────────────────────

app.include_router(nbfc_auth.router, prefix="/api/nbfc", tags=["NBFC Auth"])
app.include_router(borrower_auth.router, prefix="/api/borrower", tags=["Borrower Auth"])
app.include_router(auth.router)
app.include_router(kyc.router, prefix="/api/kyc", tags=["KYC"])
app.include_router(borrower.router)
app.include_router(nbfc_dashboard.router, prefix="/api/nbfc/dashboard", tags=["NBFC Dashboard"])
app.include_router(loan_application.router)
app.include_router(superadmin_auth.router, prefix="/api/admin", tags=["SuperAdmin Auth"])
app.include_router(superadmin_dashboard.router)
# ─── Serve Frontend ───────────────────────────────────────────────────────────

# Path to frontend folder (one level up from backend/)
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
FRONTEND_DIR = os.path.abspath(FRONTEND_DIR)

# Mount entire frontend folder as static files
# app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

app.mount("/static", StaticFiles(directory=FRONTEND_DIR, html=False), name="static")

# ─── Root → opens NBFC Register page ─────────────────────────────────────────

@app.get("/")
def root():
    return FileResponse(os.path.join(FRONTEND_DIR, "nbfc", "register.html"))


# ─── Friendly shortcuts for each portal ──────────────────────────────────────

@app.get("/nbfc")
@app.get("/nbfc/register")
def nbfc_register():
    return FileResponse(os.path.join(FRONTEND_DIR, "nbfc", "register.html"))

@app.get("/nbfc/login")
def nbfc_login():
    return FileResponse(os.path.join(FRONTEND_DIR, "nbfc", "register.html"))

@app.get("/nbfc/dashboard")
def nbfc_dashboard_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "nbfc", "nbfc-overview.html"))

@app.get("/nbfc/applications")
def nbfc_applications():
    return FileResponse(os.path.join(FRONTEND_DIR, "nbfc", "nbfc-applications.html"))

@app.get("/nbfc/applications/{app_id}")
def nbfc_application_detail(app_id: int):
    return FileResponse(os.path.join(FRONTEND_DIR, "nbfc", "nbfc-application-detail.html"))

@app.get("/nbfc/borrowers")
def nbfc_borrowers():
    return FileResponse(os.path.join(FRONTEND_DIR, "nbfc", "nbfc-borrowers.html"))

@app.get("/nbfc/emis")
def nbfc_emis():
    return FileResponse(os.path.join(FRONTEND_DIR, "nbfc", "nbfc-emis.html"))

@app.get("/nbfc/reports")
def nbfc_reports():
    return FileResponse(os.path.join(FRONTEND_DIR, "nbfc", "nbfc-reports.html"))

@app.get("/nbfc/settings")
def nbfc_settings():
    return FileResponse(os.path.join(FRONTEND_DIR, "nbfc", "nbfc-settings.html"))

@app.get("/borrower")
@app.get("/borrower/login")
def borrower_portal():
    return FileResponse(os.path.join(FRONTEND_DIR, "borrower", "login.html"))

@app.get("/borrower/overview")
def borrower_overview():
    return FileResponse(os.path.join(FRONTEND_DIR, "borrower", "overview.html"))

@app.get("/borrower/documents")
def borrower_documents():
    return FileResponse(os.path.join(FRONTEND_DIR, "borrower", "documents.html"))

@app.get("/borrower/score")
def borrower_score():
    return FileResponse(os.path.join(FRONTEND_DIR, "borrower", "score.html"))

@app.get("/borrower/nbfcs")
def borrower_nbfcs():
    return FileResponse(os.path.join(FRONTEND_DIR, "borrower", "nbfcs.html"))

@app.get("/borrower/settings")
def borrower_settings_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "borrower", "borrower-settings.html"))

@app.get("/borrower/loans/apply")
def borrower_loan_apply():
    return FileResponse(os.path.join(FRONTEND_DIR, "borrower", "loan-apply.html"))

@app.get("/borrower/loans/agreement")
def borrower_loan_agreement():
    return FileResponse(os.path.join(FRONTEND_DIR, "borrower", "agreement.html"))

@app.get("/borrower/loans")
def borrower_loans():
    return FileResponse(os.path.join(FRONTEND_DIR, "borrower", "loans.html"))


@app.get("/admin/overview")
def superadmin_portal():
    return FileResponse(os.path.join(FRONTEND_DIR, "superadmin", "index.html"))

@app.get("/admin/login")
def superadmin_login_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "superadmin", "login.html"))


@app.get("/admin/nbfcs")
def superadmin_nbfcs_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "superadmin", "admin-nbfcs.html"))

@app.get("/admin/borrowers")
def admin_borrowers_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "superadmin", "borrowers.html"))

@app.get("/admin/loans")
def admin_loans_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "superadmin", "admin-loans.html"))


@app.get("/admin/scores")
def admin_scores_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "superadmin", "admin-scores.html"))


@app.get("/admin/reports")
def admin_reports_page():
    return FileResponse(os.path.join(FRONTEND_DIR, "superadmin", "admin-reports.html"))


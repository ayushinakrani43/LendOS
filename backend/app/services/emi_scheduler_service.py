from datetime import date, timedelta
from app.core.database import database
from app.services.email_service import send_emi_reminder_email, send_late_fee_email


# ── Job 1: Send EMI reminders 5 days before due date ─────────────────────────
async def send_emi_reminders():
    target_date = date.today() + timedelta(days=5)

    rows = await database.fetch_all(
        """SELECT es.id, es.instalment_number, es.due_date, es.amount,
                  la.id as loan_id,
                  b.full_name, b.email,
                  n.company_name as nbfc_name,
                  n.upi_id, n.bank_name, n.bank_account_no, n.bank_ifsc
           FROM emi_schedule es
           JOIN loan_applications la ON la.id = es.loan_application_id
           JOIN borrowers b ON b.id = la.borrower_id
           JOIN nbfcs n ON n.id = la.nbfc_id
           WHERE es.due_date = :target_date
             AND es.status = 'pending'
             AND (es.reminder_sent = FALSE OR es.reminder_sent IS NULL)""",
        {"target_date": target_date}
    )

    sent = 0
    for row in rows:
        if not row["email"]:
            continue
        try:
            send_emi_reminder_email(
                to_email=row["email"],
                borrower_name=row["full_name"],
                nbfc_name=row["nbfc_name"],
                instalment_no=row["instalment_number"],
                amount=float(row["amount"]),
                due_date=row["due_date"].strftime("%d %b %Y"),
                upi_id=row["upi_id"] or "",
                bank_name=row["bank_name"] or "",
                account_number=row["bank_account_no"] or "",
                ifsc_code=row["bank_ifsc"] or "",
            )
            await database.execute(
                "UPDATE emi_schedule SET reminder_sent = TRUE WHERE id = :id",
                {"id": row["id"]}
            )
            sent += 1
        except Exception as e:
            print(f"[WARN] EMI reminder failed for EMI #{row['id']}: {e}")

    print(f"[SCHEDULER] EMI reminders sent: {sent}")
    return sent


# ── Job 2: Apply late fee after grace period expires ─────────────────────────
async def apply_late_fees():
    today = date.today()

    # Fetch all pending/claimed EMIs whose due_date has passed,
    # along with the NBFC's grace_period_days and late_penalty_flat
    rows = await database.fetch_all(
        """SELECT es.id, es.instalment_number, es.due_date, es.amount,
                  es.status, es.late_fee_applied,
                  la.id as loan_id,
                  b.full_name, b.email,
                  n.company_name as nbfc_name,
                  n.grace_period_days, n.late_penalty_flat
           FROM emi_schedule es
           JOIN loan_applications la ON la.id = es.loan_application_id
           JOIN borrowers b ON b.id = la.borrower_id
           JOIN nbfcs n ON n.id = la.nbfc_id
           WHERE es.status IN ('pending', 'overdue')
             AND (es.late_fee_applied = FALSE OR es.late_fee_applied IS NULL)
             AND es.due_date < :today""",
        {"today": today}
    )

    applied = 0
    for row in rows:
        grace_days = row["grace_period_days"] or 3
        days_overdue = (today - row["due_date"]).days

        if days_overdue <= grace_days:
            continue  # still inside grace period — no fee yet

        late_fee = float(row["late_penalty_flat"] or 0)
        await database.execute(
            """UPDATE emi_schedule
               SET status = 'overdue',
                   late_fee_applied = TRUE,
                   late_fee_amount  = CAST(:fee AS NUMERIC),
                   amount = amount + CAST(:fee AS NUMERIC)
               WHERE id = :id""",
            {"fee": late_fee, "id": row["id"]}
        )
        if row["email"]:
            try:
                send_late_fee_email(
                    to_email=row["email"],
                    borrower_name=row["full_name"],
                    nbfc_name=row["nbfc_name"],
                    instalment_no=row["instalment_number"],
                    emi_amount=float(row["amount"]),
                    late_fee=late_fee,
                    due_date=row["due_date"].strftime("%d %b %Y"),
                )
            except Exception as e:
                print(f"[WARN] Late fee email failed for EMI #{row['id']}: {e}")

        applied += 1

    print(f"[SCHEDULER] Late fees applied: {applied}")
    return applied


# ── Combined daily job ────────────────────────────────────────────────────────
async def run_daily_emi_jobs():
    """Called once per day by APScheduler."""
    print("[SCHEDULER] Running daily EMI jobs...")
    await send_emi_reminders()
    await apply_late_fees()

    print("[SCHEDULER] Daily EMI jobs complete.")




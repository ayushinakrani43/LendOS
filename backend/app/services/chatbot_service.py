

import os
from datetime import date
from openai import OpenAI
from app.core.database import database

_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))


async def _build_borrower_context(borrower_id: int) -> str:
    """
    Pulls the borrower's real data straight from the DB and formats it as
    plain text. This is handed to GPT as ground truth — the model is only
    allowed to answer using what's in this block, so it can't invent EMI
    dates, amounts, or NBFC terms that aren't actually true.
    """
    borrower = await database.fetch_one(
        """SELECT full_name, credit_score, loan_status, kyc_status
           FROM borrowers WHERE id = :id""",
        {"id": borrower_id}
    )
    if not borrower:
        return "No borrower record found."

    lines = [
        f"Borrower name: {borrower['full_name']}",
        f"Credit score: {borrower['credit_score'] if borrower['credit_score'] else 'not yet generated'}",
        f"Overall loan status: {borrower['loan_status'] or 'none'}",
        f"KYC status: {borrower['kyc_status'] or 'pending'}",
        f"Today's date: {date.today().strftime('%d %b %Y')}",
        "",
        "--- How this platform actually works (LendOS-specific, NOT how other lenders/banks work) ---",
        "EMI payments are MANUAL, not auto-debited. There is no NACH mandate or "
        "auto-debit on this platform. The borrower must pay the EMI amount "
        "themselves outside the app (e.g. bank transfer or UPI to the NBFC), "
        "then go to 'My Loans' and click 'Mark as Paid' on that EMI, entering "
        "the payment reference number and amount they paid. The EMI status then "
        "becomes 'payment_claimed' and stays that way until the NBFC manually "
        "reviews and confirms it — only then does it show as 'Paid'.",
        "Loan approval is also MANUAL. There is no instant/automatic approval. "
        "After a borrower applies, the NBFC staff must manually review the "
        "application and click Approve or Reject — this can take time and is "
        "not guaranteed.",
        "The borrower's loan journey, in order: (1) Register an account. "
        "(2) Upload Documents — aadhar , pan , a bank statement, and a salary "
        "slip, under 'Upload Documents'. (3) The platform automatically "
        "generates a Credit Score from those documents (visible under "
        "'Credit Score'). (4) Browse NBFCs under 'Apply for Loan' and pick one "
        "— each NBFC has its own interest rate, loan range, and minimum credit "
        "score requirement. (5) On that NBFC's application page, choose the "
        "desired loan amount and tenure, then click 'Proceed to Agreement'. "
        "(6) Review the AI-generated loan agreement and sign it via OTP "
        "verification sent to the borrower's phone/email. (7) The application "
        "then waits for the NBFC to manually review and Approve or Reject it. "
        "(8) Once approved, the NBFC disburses funds and the loan becomes "
        "active, with EMIs due monthly (paid manually, as described above).",
    ]

    # ── Active/most recent loan + its EMI schedule ──────────────────────
    loan = await database.fetch_one(
        """SELECT la.id, la.amount, la.approved_amount, la.status, la.emi_amount,
                  la.tenure_months, la.interest_rate, n.company_name as nbfc_name,
                  n.grace_period_days, n.late_penalty_flat, la.agreement_text
           FROM loan_applications la
           JOIN nbfcs n ON n.id = la.nbfc_id
           WHERE la.borrower_id = :bid
           ORDER BY la.applied_at DESC
           LIMIT 1""",
        {"bid": borrower_id}
    )

    if loan:
        lines.append("")
        lines.append(f"Most recent loan: #{loan['id']} with {loan['nbfc_name']}, "
                      f"status = {loan['status']}, amount = ₹{loan['amount']:.0f}, "
                      f"EMI = ₹{loan['emi_amount']:.0f}/month" if loan['emi_amount'] else
                      f"Most recent loan: #{loan['id']} with {loan['nbfc_name']}, status = {loan['status']}")
        lines.append(f"This NBFC's grace period before a late fee applies: {loan['grace_period_days']} days "
                      f"after the EMI due date. Late fee charged after grace period: ₹{loan['late_penalty_flat']} flat.")

        if loan["agreement_text"]:
            agreement_excerpt = loan["agreement_text"][:4000]
            truncated_note = " (truncated)" if len(loan["agreement_text"]) > 4000 else ""
            lines.append("")
            lines.append(f"This borrower's loan agreement has been generated. Full text below{truncated_note}:")
            lines.append(f'"""{agreement_excerpt}"""')
        else:
            lines.append("No loan agreement has been generated for this borrower yet.")

        emis = await database.fetch_all(
            """SELECT instalment_number, due_date, amount, status, paid_at, late_fee_amount
               FROM emi_schedule
               WHERE loan_application_id = :lid
               ORDER BY due_date ASC""",
            {"lid": loan["id"]}
        )

        if emis:
            today = date.today()
            pending = [e for e in emis if e["status"] in ("pending", "overdue")]
            overdue = [e for e in emis if e["status"] == "pending" and e["due_date"] < today
                       or e["status"] == "overdue"]
            next_due = min(pending, key=lambda e: e["due_date"]) if pending else None

            lines.append(f"Total EMIs in schedule: {len(emis)}")
            lines.append(f"EMIs pending (unpaid): {len(pending)}")
            lines.append(f"EMIs overdue (past due date, unpaid): {len(overdue)}")
            if next_due:
                lines.append(f"Next EMI due: installment #{next_due['instalment_number']}, "
                              f"₹{next_due['amount']:.0f}, due on {next_due['due_date'].strftime('%d %b %Y')}")
            else:
                lines.append("No pending EMIs remain — all paid off.")

            # Full schedule, so GPT can answer questions about any specific installment
            lines.append("Full EMI schedule:")
            for e in emis:
                paid_note = f", paid on {e['paid_at'].strftime('%d %b %Y')}" if e["paid_at"] else ""
                lines.append(f"  #{e['instalment_number']}: ₹{e['amount']:.0f}, "
                              f"due {e['due_date'].strftime('%d %b %Y')}, status={e['status']}{paid_note}")
    else:
        lines.append("")
        lines.append("This borrower has no loan applications yet.")

    # ── All active NBFCs, for eligibility/recommendation questions ──────
    nbfcs = await database.fetch_all(
        """SELECT company_name, interest_rate, min_credit_score, max_loan_amount,
                  min_loan_amount, processing_fee, max_tenure_months,
                  grace_period_days, late_penalty_flat
           FROM nbfcs
           WHERE status = 'active'
           ORDER BY interest_rate ASC"""
    )
    if nbfcs:
        lines.append("")
        lines.append("Available NBFCs on the platform (sorted by lowest interest rate first):")
        score = borrower["credit_score"] or 0
        for n in nbfcs:
            eligible = "ELIGIBLE" if score >= (n["min_credit_score"] or 0) else "NOT eligible (score too low)"
            lines.append(
                f"  {n['company_name']}: interest {n['interest_rate']}% p.a., "
                f"requires min credit score {n['min_credit_score']}, "
                f"loan range ₹{n['min_loan_amount']:.0f}-₹{n['max_loan_amount']:.0f}, "
                f"processing fee {n['processing_fee']}%, max tenure {n['max_tenure_months']} months, "
                f"grace period before late fee applies: {n['grace_period_days']} days, "
                f"late fee if overdue past grace period: ₹{n['late_penalty_flat']} flat "
                f"— {eligible} for this borrower"
            )

    return "\n".join(lines)


async def ask_chatbot(borrower_id: int, message: str, history: list) -> str:
    """
    history: list of {"role": "user"|"assistant", "content": str} from the
    current chat session (frontend keeps and resends this each turn).
    """
    context = await _build_borrower_context(borrower_id)

    system_prompt = (
        "You are a helpful assistant inside LendOS, a loan platform, answering "
        "questions for a borrower.\n\n"
        "There are three kinds of questions, and they need different handling:\n\n"
        "1. PERSONAL / SPECIFIC facts — this borrower's own EMI dates, amounts, "
        "loan status, credit score, which NBFCs they're eligible for, their "
        "agreement terms, grace period, or late fee amount. Answer ONLY using "
        "the data given below. Never invent a number, date, or status that "
        "isn't explicitly listed.\n\n"
        "2. HOW THIS PLATFORM WORKS — any question about a process or feature "
        "ON LENDOS SPECIFICALLY, e.g. 'how do I make a payment', 'how do I "
        "apply', 'how does approval work', 'how do I upload documents'. These "
        "MUST be answered strictly from the 'How this platform actually works' "
        "section in the data below — NEVER from general assumptions about how "
        "other banks/lenders/apps typically work. This platform's actual "
        "mechanics (e.g. manual payment confirmation, no auto-debit, manual "
        "approval) are often different from typical banks, so guessing based "
        "on how lending 'usually' works will give a wrong answer. If the data "
        "below doesn't describe a particular platform process, say you don't "
        "have that information rather than assuming it works like a typical bank.\n\n"
        "3. ABSTRACT financial concepts — things like 'what is FOIR', 'what "
        "does reducing balance interest mean', 'what is a credit score'. These "
        "are generic definitions, not tied to how any specific platform "
        "operates, so they're safe to answer from your own general knowledge.\n\n"
        "When a question blends categories (e.g. 'what happens if I pay late' "
        "combines a general concept with this borrower's specific grace period "
        "and late fee, which ARE listed below), give both: the brief general "
        "idea plus the exact number that applies to them.\n\n"
        "Keep answers short, warm, and conversational — 1-3 sentences unless the "
        "question needs a list (e.g. multiple EMIs or multiple NBFCs). You may "
        "use markdown formatting (**bold**, numbered lists, bullet lists) where "
        "it helps readability — it will be rendered properly, not shown as raw "
        "symbols. IMPORTANT: whenever you describe a sequence of steps (e.g. "
        "how to apply, how to make a payment, any multi-step process), you MUST "
        "format it as an actual numbered markdown list — each step starting "
        "with '1. ', '2. ', '3. ' etc. on its own line. Do not just bold the "
        "key phrase of each step without a number — always include the literal "
        "digit and period.\n\n"
        f"--- Borrower's real data ---\n{context}"
    )

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history[-10:])  # keep recent context only, avoid unbounded growth
    messages.append({"role": "user", "content": message})

    response = _client.chat.completions.create(
        model="gpt-4o-mini",
        messages=messages,
        max_tokens=350,
        temperature=0.4,
    )
    return response.choices[0].message.content.strip()




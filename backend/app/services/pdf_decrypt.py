import io
import pikepdf


def decrypt_pdf(file_bytes: bytes, password: str | None = None) -> bytes:
    """
    Decrypts a password-protected PDF and returns plain PDF bytes.
    If the PDF isn't encrypted, returns it unchanged.
    Raises ValueError on wrong/missing password.
    """
    try:
        pdf = pikepdf.open(io.BytesIO(file_bytes), password=password or "")
    except pikepdf.PasswordError:
        if not password:
            raise ValueError("This PDF is password protected. Please provide the password.")
        raise ValueError("Incorrect PDF password. Please check and try again.")

    if pdf.is_encrypted:
        output = io.BytesIO()
        pdf.save(output)
        output.seek(0)
        return output.read()

    return file_bytes
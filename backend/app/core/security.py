from cryptography.fernet import Fernet

from app.core.config import settings


def get_fernet() -> Fernet:
    if not settings.TOKEN_ENCRYPTION_KEY:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY is not configured")

    return Fernet(settings.TOKEN_ENCRYPTION_KEY.encode())


def encrypt_token(token: str) -> bytes:
    return get_fernet().encrypt(token.encode())


def decrypt_token(encrypted_token: bytes) -> str:
    return get_fernet().decrypt(encrypted_token).decode()
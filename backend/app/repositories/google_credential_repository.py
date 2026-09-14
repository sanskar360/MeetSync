from sqlalchemy.orm import Session

from app.models.google_credential import GoogleCredential


def get_credential_by_user_id(
    db: Session,
    user_id,
) -> GoogleCredential | None:
    return (
        db.query(GoogleCredential)
        .filter(GoogleCredential.user_id == user_id)
        .first()
    )


def create_credential(
    db: Session,
    user_id,
    encrypted_refresh_token: bytes,
    scopes: str,
) -> GoogleCredential:
    credential = GoogleCredential(
        user_id=user_id,
        encrypted_refresh_token=encrypted_refresh_token,
        scopes=scopes,
    )

    db.add(credential)
    db.flush()

    return credential


def update_credential(
    db: Session,
    credential: GoogleCredential,
    encrypted_refresh_token: bytes,
    scopes: str,
) -> GoogleCredential:
    credential.encrypted_refresh_token = encrypted_refresh_token
    credential.scopes = scopes

    db.flush()

    return credential
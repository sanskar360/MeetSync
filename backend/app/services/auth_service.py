from sqlalchemy.orm import Session
from app.core.security import encrypt_token

from app.repositories.google_credential_repository import (
    create_credential,
    get_credential_by_user_id,
    update_credential,
)
from app.repositories.user_repository import (
    create_user,
    get_user_by_google_sub,
)


def get_or_create_user(
    db: Session,
    google_sub: str,
    email: str,
    name: str,
    profile_picture: str | None,
):
    user = get_user_by_google_sub(
        db=db,
        google_sub=google_sub,
    )

    if user:
        user.name = name
        user.email = email
        user.profile_picture = profile_picture

        db.commit()
        db.refresh(user)

        return user

    user = create_user(
        db=db,
        google_sub=google_sub,
        email=email,
        name=name,
        profile_picture=profile_picture,
    )

    db.commit()
    db.refresh(user)

    return user


def save_google_credential(
    db: Session,
    user_id,
    refresh_token: str | None,
    scopes: str,
):
    credential = get_credential_by_user_id(
        db=db,
        user_id=user_id,
    )

    # Google may not return a new refresh token
    # when the user authorizes again.
    if credential:
        if refresh_token:
            encrypted_refresh_token = encrypt_token(refresh_token)

            update_credential(
                db=db,
                credential=credential,
                encrypted_refresh_token=encrypted_refresh_token,
                scopes=scopes,
            )
        else:
            credential.scopes = scopes
            db.flush()

        db.commit()
        db.refresh(credential)

        return credential

    if not refresh_token:
        raise ValueError(
            "Google did not provide a refresh token for a new credential"
        )

    encrypted_refresh_token = encrypt_token(refresh_token)

    credential = create_credential(
        db=db,
        user_id=user_id,
        encrypted_refresh_token=encrypted_refresh_token,
        scopes=scopes,
    )

    db.commit()
    db.refresh(credential)

    return credential
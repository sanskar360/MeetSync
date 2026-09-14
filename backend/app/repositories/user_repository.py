from sqlalchemy.orm import Session

from app.models.user import User


def get_user_by_google_sub(
    db: Session,
    google_sub: str,
) -> User | None:
    return (
        db.query(User)
        .filter(User.google_sub == google_sub)
        .first()
    )


def create_user(
    db: Session,
    google_sub: str,
    email: str,
    name: str,
    profile_picture: str | None,
) -> User:
    user = User(
        google_sub=google_sub,
        email=email,
        name=name,
        profile_picture=profile_picture,
    )

    db.add(user)
    db.flush()

    return user
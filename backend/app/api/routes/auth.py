import requests
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.auth_service import (
    get_or_create_user,
    save_google_credential,
)
from google_auth_oauthlib.flow import Flow

from app.core.config import settings


router = APIRouter(prefix="/api/auth", tags=["Authentication"])


GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar.readonly",
]


# Temporary in-memory storage for OAuth states

oauth_states = {}


def create_google_flow(code_verifier=None):
    return Flow.from_client_config(
        {
            "web": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=GOOGLE_SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
        code_verifier=code_verifier,
    )


@router.get("/google/login")
def google_login():
    flow = create_google_flow()

    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )

    oauth_states[state] = flow.code_verifier

    return {
        "authorization_url": authorization_url,
        "state": state,
    }


@router.get("/google/callback")
def google_callback(
    code: str,
    state: str,
    db: Session = Depends(get_db),
):
    if state not in oauth_states:
        raise HTTPException(
            status_code=400,
            detail="Invalid OAuth state",
        )

    code_verifier = oauth_states.pop(state)

    flow = create_google_flow(
        code_verifier=code_verifier
    )

    flow.fetch_token(code=code)

    user_info_response = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={
            "Authorization": f"Bearer {flow.credentials.token}"
        },
    )

    user_info_response.raise_for_status()

    user_info = user_info_response.json()

    user = get_or_create_user(
        db=db,
        google_sub=user_info["id"],
        email=user_info["email"],
        name=user_info.get("name"),
        profile_picture=user_info.get("picture"),
    )

    save_google_credential(
    db=db,
    user_id=user.id,
    refresh_token=flow.credentials.refresh_token,
    scopes=" ".join(flow.credentials.scopes or []),
)

    return {
        "message": "Google OAuth successful",
        "user_id": str(user.id),
    }
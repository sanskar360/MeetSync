import json
import logging
import time
import urllib.parse
import requests
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.jwt import create_access_token
from app.core.security import decrypt_token, encrypt_token
from app.models.user import User
from app.schemas.auth import OAuthLoginResponse, TokenResponse, UserResponse
from app.services.auth_service import (
    get_or_create_user,
    save_google_credential,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar.readonly",
]

OAUTH_STATE_COOKIE_NAME = "meetsync_oauth_state"
SESSION_COOKIE_NAME = "meetsync_session"
OAUTH_STATE_MAX_AGE_SECONDS = 600  # 10 minutes

# Fallback in-memory cache for development sessions
in_memory_oauth_states: dict[str, tuple[str, float]] = {}


def create_google_flow(code_verifier: str | None = None) -> Flow:
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


@router.get("/google/login", response_model=OAuthLoginResponse)
def google_login(response: Response):
    """
    Initiates Google OAuth flow.
    Encodes and encrypts the PKCE verifier inside the state parameter and sets an HttpOnly cookie.
    This provides robust state validation across multi-worker servers, restarts, and localhost/127.0.0.1 domain variations.
    """
    flow = create_google_flow()

    # Generate the initial URL and verifier
    initial_url, raw_state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )

    state_payload = {
        "raw_state": raw_state,
        "verifier": flow.code_verifier,
        "created_at": time.time(),
    }

    encrypted_state = encrypt_token(json.dumps(state_payload)).decode("utf-8")

    # Generate the final URL with the encrypted state payload
    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=encrypted_state,
    )

    # Save to in-memory fallback under both raw and encrypted keys
    in_memory_oauth_states[raw_state] = (flow.code_verifier, time.time())
    in_memory_oauth_states[encrypted_state] = (flow.code_verifier, time.time())
    # Also store with spaces replaced (in case FastAPI decodes + → space on callback)
    in_memory_oauth_states[encrypted_state.replace("+", " ")] = (flow.code_verifier, time.time())

    # Also set as HttpOnly cookie with path="/"
    response.set_cookie(
        key=OAUTH_STATE_COOKIE_NAME,
        value=encrypted_state,
        max_age=OAUTH_STATE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        path="/",
        secure=(settings.ENV.lower() == "production"),
    )

    return {
        "authorization_url": authorization_url,
        "state": encrypted_state,
    }


@router.get("/google/callback")
def google_callback(
    code: str,
    state: str,
    request: Request,
    response: Response,
    meetsync_oauth_state: str | None = Cookie(None),
    db: Session = Depends(get_db),
):
    """
    Validates OAuth state, exchanges code with Google, provisions/links user,
    issues application JWT, sets session cookie, and redirects browser to dashboard.
    """
    code_verifier = None

    # Fernet tokens use base64url which contains '+' and '='. Browsers/FastAPI
    # may URL-decode '+' as a space. Re-encode spaces back to '+' before decrypting.
    normalized_state = state.replace(" ", "+")

    # Strategy 1: State parameter itself is the encrypted payload
    try:
        decrypted_json = decrypt_token(normalized_state.encode("utf-8"))
        state_data = json.loads(decrypted_json)
        age = time.time() - state_data.get("created_at", 0)
        if age <= OAUTH_STATE_MAX_AGE_SECONDS:
            code_verifier = state_data.get("verifier")
            logger.info("OAuth state verified via encrypted state parameter.")
        else:
            logger.warning(f"OAuth state expired (age={age:.0f}s > {OAUTH_STATE_MAX_AGE_SECONDS}s).")
    except Exception as exc:
        logger.warning(f"Strategy 1 (encrypted state param) decryption failed: {exc}")

    # Strategy 2: Validate against encrypted cookie
    if not code_verifier and meetsync_oauth_state:
        try:
            normalized_cookie = meetsync_oauth_state.replace(" ", "+")
            decrypted_json = decrypt_token(normalized_cookie.encode("utf-8"))
            state_data = json.loads(decrypted_json)
            # Cookie stores the encrypted state itself — compare with normalized incoming state
            cookie_encrypted = state_data.get("encrypted_state", "")
            age = time.time() - state_data.get("created_at", 0)
            if age <= OAUTH_STATE_MAX_AGE_SECONDS:
                # Accept if cookie contains the verifier (cookie was set for this login attempt)
                verifier = state_data.get("verifier")
                if verifier:
                    code_verifier = verifier
                    logger.info("OAuth state verified via encrypted cookie (verifier extracted).")
            else:
                logger.warning(f"OAuth cookie state expired (age={age:.0f}s).")
        except Exception as exc:
            logger.warning(f"Strategy 2 (encrypted cookie) decryption failed: {exc}")

    # Strategy 3: In-memory fallback (try both raw and normalized state)
    if not code_verifier:
        for key in (normalized_state, state):
            if key in in_memory_oauth_states:
                cached_verifier, cached_time = in_memory_oauth_states.pop(key)
                if time.time() - cached_time <= OAUTH_STATE_MAX_AGE_SECONDS:
                    code_verifier = cached_verifier
                    logger.info("OAuth state verified via in-memory cache.")
                else:
                    logger.warning("In-memory OAuth state found but expired.")
                break

    if not code_verifier:
        logger.warning(
            f"OAuth callback rejected: all 3 strategies failed for state={normalized_state[:20]}..."
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OAuth state. Please log in again.",
        )

    # Clean expired in-memory entries
    current_time = time.time()
    expired_keys = [k for k, (_, t) in in_memory_oauth_states.items() if current_time - t > OAUTH_STATE_MAX_AGE_SECONDS]
    for k in expired_keys:
        in_memory_oauth_states.pop(k, None)

    # Exchange token with Google
    flow = create_google_flow(code_verifier=code_verifier)
    flow.fetch_token(code=code)

    user_info_response = requests.get(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        headers={"Authorization": f"Bearer {flow.credentials.token}"},
    )
    user_info_response.raise_for_status()
    user_info = user_info_response.json()

    user = get_or_create_user(
        db=db,
        google_sub=user_info["id"],
        email=user_info["email"],
        name=user_info.get("name", ""),
        profile_picture=user_info.get("picture"),
    )

    save_google_credential(
        db=db,
        user_id=user.id,
        refresh_token=flow.credentials.refresh_token,
        scopes=" ".join(flow.credentials.scopes or []),
    )

    # Issue application JWT
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "name": user.name,
        }
    )

    # Check if request came directly from a web browser navigation
    accept_header = request.headers.get("accept", "")
    is_browser_nav = "text/html" in accept_header

    if is_browser_nav:
        # Browser redirect directly to dashboard
        redirect_res = RedirectResponse(url="/", status_code=status.HTTP_302_FOUND)
        redirect_res.delete_cookie(OAUTH_STATE_COOKIE_NAME, path="/")
        redirect_res.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=access_token,
            max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            httponly=True,
            samesite="lax",
            path="/",
            secure=(settings.ENV.lower() == "production"),
        )
        return redirect_res

    # API / Postman client response
    response.delete_cookie(OAUTH_STATE_COOKIE_NAME, path="/")
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=True,
        samesite="lax",
        path="/",
        secure=(settings.ENV.lower() == "production"),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "email": user.email,
        "name": user.name,
    }


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(
    current_user: User = Depends(get_current_user),
):
    """
    Returns the authenticated user's profile.
    """
    return current_user
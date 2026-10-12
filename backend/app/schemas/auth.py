from pydantic import BaseModel, ConfigDict
from uuid import UUID


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: UUID
    email: str
    name: str

    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: UUID
    google_sub: str
    email: str
    name: str
    profile_picture: str | None = None

    model_config = ConfigDict(from_attributes=True)


class OAuthLoginResponse(BaseModel):
    authorization_url: str
    state: str

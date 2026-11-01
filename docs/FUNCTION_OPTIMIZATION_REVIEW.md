# MeetSync Function Optimization Review

**Project:** MeetSync (AI-Driven Decision Intelligence System)  
**Document:** Complete Function Optimization & Audit Catalog  
**Date:** 2026-10-23  

---

## Table of Contents

- [1. Core & Security Services](#1-core--security-services)
  - [`get_db`](#databasepy--get_db)
  - [`create_access_token`](#jwtpy--create_access_token)
  - [`decode_access_token`](#jwtpy--decode_access_token)
  - [`encrypt_token`](#securitypy--encrypt_token)
  - [`decrypt_token`](#securitypy--decrypt_token)
  - [`get_current_user`](#dependenciespy--get_current_user)
  - [`get_meeting_role`](#dependenciespy--get_meeting_role)
  - [`require_meeting_member`](#dependenciespy--require_meeting_member)
  - [`require_meeting_roles`](#dependenciespy--require_meeting_roles)
- [2. Repositories](#2-repositories)
  - [User Repository](#user-repository)
    - [`get_user_by_google_sub`](#user_repositorypy--get_user_by_google_sub)
    - [`create_user`](#user_repositorypy--create_user)
    - [`get_user_by_email`](#user_repositorypy--get_user_by_email)
  - [Google Credential Repository](#google-credential-repository)
    - [`get_credential_by_user_id`](#google_credential_repositorypy--get_credential_by_user_id)
    - [`create_credential`](#google_credential_repositorypy--create_credential)
    - [`update_credential`](#google_credential_repositorypy--update_credential)
  - [Calendar Repository](#calendar-repository)
    - [`get_calendar_by_google_id`](#calendar_repositorypy--get_calendar_by_google_id)
    - [`create_calendar`](#calendar_repositorypy--create_calendar)
    - [`get_calendar_by_id`](#calendar_repositorypy--get_calendar_by_id)
  - [Calendar Sync Repository](#calendar-sync-repository)
    - [`get_calendar_sync`](#calendar_sync_repositorypy--get_calendar_sync)
    - [`get_sync_by_channel_id`](#calendar_sync_repositorypy--get_sync_by_channel_id)
    - [`get_sync_by_resource_id`](#calendar_sync_repositorypy--get_sync_by_resource_id)
    - [`create_calendar_sync`](#calendar_sync_repositorypy--create_calendar_sync)
    - [`update_calendar_sync_channel`](#calendar_sync_repositorypy--update_calendar_sync_channel)
    - [`clear_calendar_sync_channel`](#calendar_sync_repositorypy--clear_calendar_sync_channel)
    - [`get_calendar_syncs_needing_renewal`](#calendar_sync_repositorypy--get_calendar_syncs_needing_renewal)
  - [Meeting Repository](#meeting-repository)
    - [`get_meeting_by_identity`](#meeting_repositorypy--get_meeting_by_identity)
    - [`create_meeting`](#meeting_repositorypy--create_meeting)
    - [`update_meeting`](#meeting_repositorypy--update_meeting)
  - [Meeting Participant Repository](#meeting-participant-repository)
    - [`get_participant_by_email`](#meeting_participant_repositorypy--get_participant_by_email)
    - [`create_participant`](#meeting_participant_repositorypy--create_participant)
    - [`update_participant`](#meeting_participant_repositorypy--update_participant)
    - [`get_participant_by_id`](#meeting_participant_repositorypy--get_participant_by_id)
    - [`update_participant_role`](#meeting_participant_repositorypy--update_participant_role)
  - [Meeting Source Repository](#meeting-source-repository)
    - [`get_source_by_calendar_event`](#meeting_source_repositorypy--get_source_by_calendar_event)
    - [`create_meeting_source`](#meeting_source_repositorypy--create_meeting_source)
    - [`update_meeting_source`](#meeting_source_repositorypy--update_meeting_source)
  - [Meeting Note Repository](#meeting-note-repository)
    - [`create_note`](#meeting_note_repositorypy--create_note)
    - [`get_note_by_id`](#meeting_note_repositorypy--get_note_by_id)
    - [`list_notes_by_meeting_id`](#meeting_note_repositorypy--list_notes_by_meeting_id)
    - [`update_note`](#meeting_note_repositorypy--update_note)
    - [`delete_note`](#meeting_note_repositorypy--delete_note)
  - [Transcript Repository](#transcript-repository)
    - [`create_transcript`](#transcript_repositorypy--create_transcript)
    - [`get_transcript_by_id`](#transcript_repositorypy--get_transcript_by_id)
    - [`list_transcripts_by_meeting_id`](#transcript_repositorypy--list_transcripts_by_meeting_id)
    - [`delete_transcript`](#transcript_repositorypy--delete_transcript)
- [3. Domain & Business Services](#3-domain--business-services)
  - [`get_or_create_user`](#auth_servicepy--get_or_create_user)
  - [`save_google_credential`](#auth_servicepy--save_google_credential)
  - [`sync_user_calendars`](#calendar_servicepy--sync_user_calendars)
  - [`get_calendar_service`](#google_calendar_servicepy--get_calendar_service)
  - [`list_calendar_events`](#google_calendar_servicepy--list_calendar_events)
  - [`watch_calendar_events`](#google_calendar_servicepy--watch_calendar_events)
  - [`stop_calendar_watch`](#google_calendar_servicepy--stop_calendar_watch)
  - [`parse_google_event`](#google_event_parserpy--parse_google_event)
  - [`is_meeting_event`](#google_event_parserpy--is_meeting_event)
  - [`sync_calendar_meetings`](#meeting_sync_servicepy--sync_calendar_meetings)
  - [`register_calendar_watch`](#calendar_watch_servicepy--register_calendar_watch)
  - [`stop_calendar_watch_for_calendar`](#calendar_watch_servicepy--stop_calendar_watch_for_calendar)
  - [`renew_expiring_watches`](#calendar_watch_servicepy--renew_expiring_watches)
  - [`save_raw_event`](#raw_event_storagepy--save_raw_event)
  - [`save_transcript_file`](#transcript_storagepy--save_transcript_file)
  - [`delete_transcript_file`](#transcript_storagepy--delete_transcript_file)
  - [`parse_transcript_file`](#transcript_parserpy--parse_transcript_file)
  - [`validate_parsed_transcript`](#transcript_validatorpy--validate_parsed_transcript)
  - [`search_meetings_for_user`](#search_servicepy--search_meetings_for_user)
- [4. Background Workers & Application Lifespan](#4-background-workers--application-lifespan)
  - [`run_watch_renewal_cycle`](#watch_renewalpy--run_watch_renewal_cycle)
  - [`watch_renewal_scheduler_task`](#watch_renewalpy--watch_renewal_scheduler_task)
  - [`lifespan`](#mainpy--lifespan)
  - [`spa_fallback`](#mainpy--spa_fallback)
- [5. API Route Handlers](#5-api-route-handlers)
  - [`google_login`](#authpy--google_login)
  - [`google_callback`](#authpy--google_callback)
  - [`get_current_user_profile`](#authpy--get_current_user_profile)
  - [`sync_calendars`](#calendarpy--sync_calendars)
  - [`watch_calendar`](#calendarpy--watch_calendar)
  - [`stop_calendar_watch_route`](#calendarpy--stop_calendar_watch_route)
  - [`get_calendar_sync_status`](#calendarpy--get_calendar_sync_status)
  - [`list_user_meetings`](#meetingspy--list_user_meetings)
  - [`get_meeting`](#meetingspy--get_meeting)
  - [`list_meeting_participants`](#meetingspy--list_meeting_participants)
  - [`update_meeting_participant_role`](#meetingspy--update_meeting_participant_role)
  - [`create_meeting_note`](#notespy--create_meeting_note)
  - [`list_meeting_notes`](#notespy--list_meeting_notes)
  - [`update_meeting_note`](#notespy--update_meeting_note)
  - [`delete_meeting_note`](#notespy--delete_meeting_note)
  - [`upload_transcript`](#transcriptspy--upload_transcript)
  - [`list_transcripts`](#transcriptspy--list_transcripts)
  - [`get_transcript_text`](#transcriptspy--get_transcript_text)
  - [`download_transcript_file`](#transcriptspy--download_transcript_file)
  - [`search_meetings`](#searchpy--search_meetings)
  - [`get_past_meetings`](#searchpy--get_past_meetings)
  - [`get_consolidated_meeting_details`](#searchpy--get_consolidated_meeting_details)
  - [`handle_google_calendar_webhook`](#webhookpy--handle_google_calendar_webhook)
- [6. Frontend API Client & Core Utilities](#6-frontend-api-client--core-utilities)
  - [`getGoogleLoginUrl`](#frontend-api-authjs--getgoogleloginurl)
  - [`getCurrentUser`](#frontend-api-authjs--getcurrentuser)
  - [`getMeetingNotes`](#frontend-api-notesjs--getmeetingnotes)
  - [`createMeetingNote`](#frontend-api-notesjs--createmeetingnote)
  - [`getMeetingTranscripts`](#frontend-api-transcriptsjs--getmeetingtranscripts)
  - [`uploadTranscript`](#frontend-api-transcriptsjs--uploadtranscript)
  - [`searchMeetings`](#frontend-api-searchjs--searchmeetings)
  - [`canUserEditNote`](#frontend-lib-rolesjs--canusereditnote)
  - [`canUserManageRoles`](#frontend-lib-rolesjs--canusermanageroles)

---

# 1. Core & Security Services

## `database.py` : `get_db`

**Project:** MeetSync  
**File path:** `backend/app/core/database.py`  
**Function name:** `get_db`

### 1. Purpose
Provides a scoped SQLAlchemy database session generator for FastAPI endpoint dependency injection, guaranteeing session cleanup and closure after request processing.

### 2. Code
```python
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### 3. Complexity
- Time complexity: O(1)
- Auxiliary space complexity: O(1)
- Input size or typical workload: 1 session per incoming HTTP request.

### 4. Usage
- Who calls this function? FastAPI dependency injection engine (`Depends(get_db)`).
- How frequently is it called? On nearly every authenticated and database-backed HTTP request.
- Does it run inside a loop or another frequently called function? No.

### 5. Dependencies
- Database queries: Opens connection pool checkout.
- External API calls: None.
- Other functions called: `SessionLocal()`, `db.close()`.
- Shared state or side effects: Checks out and releases an engine connection from PostgreSQL pool.

### 6. Current concerns
Default connection pool sizing is implicit; needs explicit pooling parameters under high concurrency.

### 7. Constraints
Must remain a generator yielding a Session for FastAPI request lifespan.

### Review result
(To be completed during the audit.)

---

## `jwt.py` : `create_access_token`

**Project:** MeetSync  
**File path:** `backend/app/core/jwt.py`  
**Function name:** `create_access_token`

### 1. Purpose
Generates a signed HS256 JSON Web Token with claims (`sub`, `exp`, `iat`) for client session authentication without requiring external heavy JWT dependencies.

### 2. Code
```python
def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)

    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
    })

    header = {"alg": settings.JWT_ALGORITHM, "typ": "JWT"}
    header_bytes = json.dumps(header, separators=(",", ":")).encode("utf-8")
    payload_bytes = json.dumps(to_encode, separators=(",", ":")).encode("utf-8")

    header_b64 = _b64url_encode(header_bytes)
    payload_b64 = _b64url_encode(payload_bytes)

    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        signing_input,
        hashlib.sha256,
    ).digest()

    sig_b64 = _b64url_encode(signature)
    return f"{header_b64}.{payload_b64}.{sig_b64}"
```

### 3. Complexity
- Time complexity: O(L) where L is the payload string length (~100 bytes), effectively O(1).
- Auxiliary space complexity: O(1).
- Input size or typical workload: User ID, email, name dictionary.

### 4. Usage
- Who calls this function? `auth.py` during `google_callback`.
- How frequently is it called? Once per user login/OAuth flow.
- Does it run inside a loop or another frequently called function? No.

### 5. Dependencies
- Database queries: None.
- External API calls: None.
- Other functions called: `_b64url_encode`, `hmac.new`, `json.dumps`.
- Shared state or side effects: Reads `settings.JWT_SECRET_KEY`.

### 6. Current concerns
None. Pure cryptographic hashing and encoding.

### 7. Constraints
Algorithm must match `decode_access_token` (HS256). Token claims must retain `sub` as UUID string.

### Review result
(To be completed during the audit.)

---

## `jwt.py` : `decode_access_token`

**Project:** MeetSync  
**File path:** `backend/app/core/jwt.py`  
**Function name:** `decode_access_token`

### 1. Purpose
Verifies the cryptographic HMAC-SHA256 signature and expiration timestamp of an incoming JWT, unpacking claims safely.

### 2. Code
```python
def decode_access_token(token: str) -> dict[str, Any]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise credentials_exception
        header_b64, payload_b64, sig_b64 = parts

        signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
        expected_sig = hmac.new(
            settings.JWT_SECRET_KEY.encode("utf-8"),
            signing_input,
            hashlib.sha256,
        ).digest()

        actual_sig = _b64url_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            raise credentials_exception

        payload_bytes = _b64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode("utf-8"))

        exp = payload.get("exp")
        if exp is None:
            raise credentials_exception

        now = int(datetime.now(timezone.utc).timestamp())
        if now > exp:
            raise credentials_exception

        return payload
    except HTTPException:
        raise
    except Exception:
        raise credentials_exception
```

### 3. Complexity
- Time complexity: O(L), constant time O(1) for typical token lengths.
- Auxiliary space complexity: O(1).
- Input size or typical workload: 1 JWT token string (~150-250 chars).

### 4. Usage
- Who calls this function? `get_current_user` in `dependencies.py`.
- How frequently is it called? On every protected API request.
- Does it run inside a loop or another frequently called function? Yes, every incoming authenticated route call.

### 5. Dependencies
- Database queries: None.
- External API calls: None.
- Other functions called: `_b64url_decode`, `hmac.compare_digest`.
- Shared state or side effects: None.

### 6. Current concerns
Repeated token decoding per endpoint can be cached for a few seconds if request traffic spikes, though CPU overhead is negligible.

### 7. Constraints
Constant time comparison (`hmac.compare_digest`) must be preserved against timing attacks.

### Review result
(To be completed during the audit.)

---

## `security.py` : `encrypt_token`

**Project:** MeetSync  
**File path:** `backend/app/core/security.py`  
**Function name:** `encrypt_token`

### 1. Purpose
Encrypts sensitive Google OAuth refresh tokens and temporary OAuth state parameters using symmetric Fernet encryption (AES-128-CBC + HMAC-SHA256).

### 2. Code
```python
def encrypt_token(token: str) -> bytes:
    return get_fernet().encrypt(token.encode())
```

### 3. Complexity
- Time complexity: O(N) where N is token length.
- Auxiliary space complexity: O(N).
- Input size or typical workload: String refresh token (~50-100 bytes).

### 4. Usage
- Who calls this function? `auth_service.py` (`save_google_credential`) and `auth.py` (`google_login`).
- How frequently is it called? On login initiation and OAuth completion.
- Does it run inside a loop or another frequently called function? No.

### 5. Dependencies
- Database queries: None.
- External API calls: None.
- Other functions called: `get_fernet().encrypt`.
- Shared state or side effects: Uses `settings.TOKEN_ENCRYPTION_KEY`.

### 6. Current concerns
`get_fernet()` recreates the `Fernet` instance on every invocation instead of caching a single instance.

### 7. Constraints
Must remain backwards compatible with `decrypt_token`.

### Review result
(To be completed during the audit.)

---

## `security.py` : `decrypt_token`

**Project:** MeetSync  
**File path:** `backend/app/core/security.py`  
**Function name:** `decrypt_token`

### 1. Purpose
Decrypts Fernet-encrypted refresh tokens from PostgreSQL and OAuth state cookies.

### 2. Code
```python
def decrypt_token(encrypted_token: bytes) -> str:
    return get_fernet().decrypt(encrypted_token).decode()
```

### 3. Complexity
- Time complexity: O(N).
- Auxiliary space complexity: O(N).
- Input size or typical workload: 100-200 bytes ciphertext.

### 4. Usage
- Who calls this function? `google_calendar_service.py` (`get_calendar_service`), `auth.py` (`google_callback`).
- How frequently is it called? On Google API calls and callback exchanges.
- Does it run inside a loop or another frequently called function? No.

### 5. Dependencies
- Database queries: None.
- External API calls: None.
- Other functions called: `get_fernet().decrypt`.
- Shared state or side effects: None.

### 6. Current concerns
`Fernet` object instantiation is repeated per call.

### 7. Constraints
Cryptographic key must match encryption key in `.env`.

### Review result
(To be completed during the audit.)

---

## `dependencies.py` : `get_current_user`

**Project:** MeetSync  
**File path:** `backend/app/core/dependencies.py`  
**Function name:** `get_current_user`

### 1. Purpose
Extracts JWT from Bearer Authorization header or HttpOnly `meetsync_session` cookie, verifies it, and queries the database for the matching User.

### 2. Code
```python
def get_current_user(
    request: Request,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    elif "meetsync_session" in request.cookies:
        token = request.cookies["meetsync_session"]

    if not token:
        raise credentials_exception

    payload = decode_access_token(token)
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise credentials_exception

    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise credentials_exception
    return user
```

### 3. Complexity
- Time complexity: O(1) DB primary key index lookup + O(1) JWT verification.
- Auxiliary space complexity: O(1).
- Input size or typical workload: 1 user request.

### 4. Usage
- Who calls this function? FastAPI dependency on almost every endpoint.
- How frequently is it called? Every incoming authenticated request.
- Does it run inside a loop or another frequently called function? Yes, on every endpoint pipeline.

### 5. Dependencies
- Database queries: `SELECT * FROM users WHERE id = user_id LIMIT 1`.
- External API calls: None.
- Other functions called: `decode_access_token`.
- Shared state or side effects: Database query.

### 6. Current concerns
Executes 1 DB query per request. Could benefit from a short-lived memory cache (Redis/LRU) if endpoint throughput is high.

### 7. Constraints
Must support dual auth: Header `Authorization: Bearer <token>` and `meetsync_session` cookie.

### Review result
(To be completed during the audit.)

---

## `dependencies.py` : `get_meeting_role`

**Project:** MeetSync  
**File path:** `backend/app/core/dependencies.py`  
**Function name:** `get_meeting_role`

### 1. Purpose
Computes the dynamic per-meeting scoped role of a user for a given meeting (`agenda_owner`, `note_taker`, `personal_assistant`, `participant`, or `none`).

### 2. Code
```python
def get_meeting_role(
    meeting_id: UUID,
    user: User,
    db: Session,
) -> tuple[Meeting, str]:
    meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Meeting not found",
        )

    if (meeting.organizer_user_id and meeting.organizer_user_id == user.id) or (
        meeting.organizer_email and meeting.organizer_email.lower() == user.email.lower()
    ):
        return meeting, "agenda_owner"

    participant = (
        db.query(MeetingParticipant)
        .filter(
            MeetingParticipant.meeting_id == meeting_id,
            (MeetingParticipant.user_id == user.id)
            | (MeetingParticipant.email.ilike(user.email)),
        )
        .first()
    )

    if participant:
        if participant.role == "organizer":
            return meeting, "agenda_owner"
        return meeting, participant.role

    return meeting, "none"
```

### 3. Complexity
- Time complexity: O(1) indexed query on `meetings.id` + O(1) query on `(meeting_id, user_id/email)`.
- Auxiliary space complexity: O(1).
- Input size or typical workload: 1 meeting, 1 user.

### 4. Usage
- Who calls this function? `require_meeting_member`, `require_meeting_roles`, `search_service.py`, `routes/meetings.py`.
- How frequently is it called? Every meeting-specific route invocation and in search result iteration loops.
- Does it run inside a loop or another frequently called function? **Yes, inside search result loops.**

### 5. Dependencies
- Database queries: 2 queries (Meeting lookup, MeetingParticipant lookup).
- External API calls: None.
- Other functions called: None.
- Shared state or side effects: None.

### 6. Current concerns
**Performance bottleneck in search**: When `search_meetings_for_user` iterates through matches, calling this function in a loop generates an N+1 query pattern. It should be batch loaded or joined in SQL queries during bulk searches.

### 7. Constraints
Role normalization logic (`organizer` -> `agenda_owner`) must be preserved.

### Review result
(To be completed during the audit.)

---

## `dependencies.py` : `require_meeting_member`

**Project:** MeetSync  
**File path:** `backend/app/core/dependencies.py`  
**Function name:** `require_meeting_member`

### 1. Purpose
FastAPI route dependency ensuring the current user is an authorized member (any valid role) of the meeting, raising `403 Forbidden` for non-members.

### 2. Code
```python
def require_meeting_member(
    meeting_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> tuple[Meeting, str]:
    meeting, role = get_meeting_role(meeting_id=meeting_id, user=current_user, db=db)
    if role == "none":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You are not a participant in this meeting.",
        )
    return meeting, role
```

### 3. Complexity
- Time complexity: O(1) (depends on `get_meeting_role`).
- Auxiliary space complexity: O(1).
- Input size or typical workload: Single request context.

### 4. Usage
- Who calls this function? Route dependency on `GET /meetings/{id}`, notes list, transcript fetch, consolidated details.
- How frequently is it called? Every read request for meeting materials.
- Does it run inside a loop or another frequently called function? No.

### 5. Dependencies
- Database queries: Inherits queries from `get_current_user` and `get_meeting_role`.
- External API calls: None.
- Other functions called: `get_meeting_role`.
- Shared state or side effects: None.

### 6. Current concerns
None for single endpoints.

### 7. Constraints
Must return tuple `(meeting, role)`.

### Review result
(To be completed during the audit.)

---

## `dependencies.py` : `require_meeting_roles`

**Project:** MeetSync  
**File path:** `backend/app/core/dependencies.py`  
**Function name:** `require_meeting_roles`

### 1. Purpose
Closure dependency factory enforcing strict role-based access control (e.g. `["agenda_owner"]` or `["note_taker"]`).

### 2. Code
```python
def require_meeting_roles(allowed_roles: list[str]) -> Callable:
    def _role_checker(
        meeting_id: UUID,
        current_user: User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> tuple[Meeting, str]:
        meeting, role = get_meeting_role(meeting_id=meeting_id, user=current_user, db=db)
        if role == "none":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You are not a participant in this meeting.",
            )
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: This operation requires one of {allowed_roles} roles. Your role is '{role}'.",
            )
        return meeting, role
    return _role_checker
```

### 3. Complexity
- Time complexity: O(1) lookup in `allowed_roles` array.
- Auxiliary space complexity: O(1).
- Input size or typical workload: 1 role check.

### 4. Usage
- Who calls this function? Mutating endpoints (`PATCH /participants/{id}/role`, `POST /notes`, `POST /transcripts`).
- How frequently is it called? On every role-restricted write operation.
- Does it run inside a loop or another frequently called function? No.

### 5. Dependencies
- Database queries: Evaluates `get_meeting_role`.
- External API calls: None.
- Other functions called: `get_meeting_role`.
- Shared state or side effects: None.

### 6. Current concerns
None. Clean closure dependency.

### 7. Constraints
Must enforce exact role list membership.

### Review result
(To be completed during the audit.)

---

# 2. Repositories

## User Repository

### `user_repository.py` : `get_user_by_google_sub`
- **File path:** `backend/app/repositories/user_repository.py`
- **Purpose:** Fetches a user record by their Google Subject ID (`sub`) to authenticate returning OAuth users.
- **Code:**
```python
def get_user_by_google_sub(db: Session, google_sub: str) -> User | None:
    return db.query(User).filter(User.google_sub == google_sub).first()
```
- **Complexity:** Time O(1) via unique index; Space O(1); Workload 1 query.
- **Usage:** Called by `auth_service.py` on OAuth callbacks.
- **Dependencies:** DB query on indexed `users.google_sub`.
- **Current concerns:** None.
- **Constraints:** Uniqueness of `google_sub` must be maintained.
- **Review result:** (To be completed during audit.)

### `user_repository.py` : `create_user`
- **File path:** `backend/app/repositories/user_repository.py`
- **Purpose:** Inserts a newly authenticated Google user into PostgreSQL.
- **Code:**
```python
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
```
- **Complexity:** Time O(1); Space O(1); Workload 1 row insert.
- **Usage:** Called by `auth_service.py` during first-time OAuth sign-in.
- **Dependencies:** `db.add()`, `db.flush()`.
- **Current concerns:** None. Uses `flush()` allowing caller to manage transaction boundary.
- **Constraints:** Returns flushed instance with generated UUID.
- **Review result:** (To be completed during audit.)

### `user_repository.py` : `get_user_by_email`
- **File path:** `backend/app/repositories/user_repository.py`
- **Purpose:** Looks up user by email for organizer and attendee resolution.
- **Code:**
```python
def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()
```
- **Complexity:** Time O(1) via unique index; Space O(1).
- **Usage:** Called by `meeting_sync_service.py` during calendar event ingestion.
- **Dependencies:** `db.query(User).filter()`.
- **Current concerns:** Case-sensitivity: uses `== email`. Google event parsing could benefit from `.ilike()`.
- **Constraints:** Email uniqueness.
- **Review result:** (To be completed during audit.)

---

## Google Credential Repository

### `google_credential_repository.py` : `get_credential_by_user_id`
- **File path:** `backend/app/repositories/google_credential_repository.py`
- **Purpose:** Retrieves user's encrypted Google refresh token and authorized scopes.
- **Code:**
```python
def get_credential_by_user_id(db: Session, user_id) -> GoogleCredential | None:
    return db.query(GoogleCredential).filter(GoogleCredential.user_id == user_id).first()
```
- **Complexity:** Time O(1); Space O(1).
- **Usage:** Called by `auth_service.py` and `google_calendar_service.py`.
- **Dependencies:** DB query on indexed foreign key `user_id`.
- **Current concerns:** None.
- **Constraints:** Single credential per user.
- **Review result:** (To be completed during audit.)

### `google_credential_repository.py` : `create_credential` & `update_credential`
- **File path:** `backend/app/repositories/google_credential_repository.py`
- **Purpose:** Persists or updates the encrypted refresh token bytes in PostgreSQL.
- **Code:**
```python
def create_credential(db: Session, user_id, encrypted_refresh_token: bytes, scopes: str) -> GoogleCredential:
    credential = GoogleCredential(
        user_id=user_id,
        encrypted_refresh_token=encrypted_refresh_token,
        scopes=scopes,
    )
    db.add(credential)
    db.flush()
    return credential

def update_credential(db: Session, credential: GoogleCredential, encrypted_refresh_token: bytes, scopes: str) -> GoogleCredential:
    credential.encrypted_refresh_token = encrypted_refresh_token
    credential.scopes = scopes
    db.flush()
    return credential
```
- **Complexity:** Time O(1); Space O(1).
- **Usage:** Called by `auth_service.save_google_credential`.
- **Dependencies:** `db.flush()`.
- **Current concerns:** None.
- **Constraints:** Token must already be encrypted before passing to this repository.
- **Review result:** (To be completed during audit.)

---

## Calendar Repository

### `calendar_repository.py` : `get_calendar_by_google_id` & `create_calendar`
- **File path:** `backend/app/repositories/calendar_repository.py`
- **Purpose:** Resolves or records Google Calendar metadata for a user.
- **Code:**
```python
def get_calendar_by_google_id(db: Session, user_id, google_calendar_id: str) -> Calendar | None:
    return db.query(Calendar).filter(
        Calendar.user_id == user_id,
        Calendar.google_calendar_id == google_calendar_id,
    ).first()

def create_calendar(db: Session, user_id, google_calendar_id: str, name: str) -> Calendar:
    calendar = Calendar(
        user_id=user_id,
        google_calendar_id=google_calendar_id,
        name=name,
    )
    db.add(calendar)
    db.flush()
    return calendar
```
- **Complexity:** Time O(1); Space O(1).
- **Usage:** Called by `calendar_service.sync_user_calendars`.
- **Dependencies:** PostgreSQL `calendars` table.
- **Current concerns:** None.
- **Constraints:** Composite filtering on `user_id` and `google_calendar_id`.
- **Review result:** (To be completed during audit.)

---

## Calendar Sync Repository

### `calendar_sync_repository.py` : `get_calendar_syncs_needing_renewal`
- **File path:** `backend/app/repositories/calendar_sync_repository.py`
- **Purpose:** Identifies watch channels expiring before a specified threshold, with optional row-level locking (`with_for_update(skip_locked=True)`).
- **Code:**
```python
def get_calendar_syncs_needing_renewal(
    db: Session,
    before_time: datetime,
    for_update: bool = False,
) -> list[CalendarSync]:
    query = (
        db.query(CalendarSync)
        .filter(
            CalendarSync.channel_id.isnot(None),
            CalendarSync.resource_id.isnot(None),
            CalendarSync.channel_expiration.isnot(None),
            CalendarSync.channel_expiration <= before_time,
        )
    )
    if for_update:
        query = query.with_for_update(skip_locked=True)
    return query.all()
```
- **Complexity:** Time O(N) where N is expiring channels; Space O(N).
- **Usage:** Called by `calendar_watch_service.renew_expiring_watches`.
- **Dependencies:** DB query with row-locking.
- **Current concerns:** Needs an index on `(channel_expiration)` to prevent sequential table scans when table grows.
- **Constraints:** Must use `skip_locked` to prevent distributed deadlock between worker loops.
- **Review result:** (To be completed during audit.)

---

## Meeting Repository

### `meeting_repository.py` : `get_meeting_by_identity`
- **File path:** `backend/app/repositories/meeting_repository.py`
- **Purpose:** Deduplicates calendar meetings using the composite unique key `(google_ical_uid, start_time)`.
- **Code:**
```python
def get_meeting_by_identity(db: Session, google_ical_uid: str, start_time) -> Meeting | None:
    return (
        db.query(Meeting)
        .filter(
            Meeting.google_ical_uid == google_ical_uid,
            Meeting.start_time == start_time,
        )
        .first()
    )
```
- **Complexity:** Time O(1) indexed lookup.
- **Usage:** Called by `meeting_sync_service.py` on every event in the Google Calendar sync payload.
- **Dependencies:** Unique composite index on `(google_ical_uid, start_time)`.
- **Current concerns:** Called iteratively in a loop over all calendar events.
- **Constraints:** Identity definition must strictly match recurring event occurrence rules.
- **Review result:** (To be completed during audit.)

### `meeting_repository.py` : `create_meeting` & `update_meeting`
- **File path:** `backend/app/repositories/meeting_repository.py`
- **Purpose:** Creates or updates meeting entity state from normalized event fields.
- **Code:**
```python
def create_meeting(
    db: Session,
    google_ical_uid: str,
    calendar_id,
    google_event_id: str,
    title: str,
    start_time,
    end_time,
    meet_url: str | None,
    organizer_user_id=None,
    organizer_email: str | None = None,
    event_type: str = "default",
    google_updated_at=None,
    google_etag: str | None = None,
    google_sequence: int | None = None,
    status: str = "scheduled",
    raw_payload_path: str | None = None,
) -> Meeting:
    meeting = Meeting(
        google_ical_uid=google_ical_uid,
        google_event_id=google_event_id,
        calendar_id=calendar_id,
        title=title,
        start_time=start_time,
        end_time=end_time,
        meet_url=meet_url,
        organizer_user_id=organizer_user_id,
        organizer_email=organizer_email,
        event_type=event_type,
        google_updated_at=google_updated_at,
        google_etag=google_etag,
        google_sequence=google_sequence,
        status=status,
        raw_payload_path=raw_payload_path,
    )
    db.add(meeting)
    db.flush()
    return meeting
```
- **Complexity:** Time O(1); Space O(1).
- **Usage:** Called by `meeting_sync_service.py`.
- **Dependencies:** `db.add()`, `db.flush()`.
- **Current concerns:** None.
- **Constraints:** Retains database foreign key constraints.
- **Review result:** (To be completed during audit.)

---

## Meeting Participant Repository

### `meeting_participant_repository.py` : `update_participant_role`
- **File path:** `backend/app/repositories/meeting_participant_repository.py`
- **Purpose:** Updates an attendee's scoped role (`note_taker`, `personal_assistant`, `participant`) and commits the transaction.
- **Code:**
```python
def update_participant_role(
    db: Session,
    participant: MeetingParticipant,
    role: str,
) -> MeetingParticipant:
    participant.role = role
    db.commit()
    db.refresh(participant)
    return participant
```
- **Complexity:** Time O(1); Space O(1).
- **Usage:** Called by `routes/meetings.py` during Agenda Owner role assignment.
- **Dependencies:** `db.commit()`, `db.refresh()`.
- **Current concerns:** None.
- **Constraints:** Enforces immediate persistence.
- **Review result:** (To be completed during audit.)

---

## Meeting Note Repository

### `meeting_note_repository.py` : `create_note` & `update_note`
- **File path:** `backend/app/repositories/meeting_note_repository.py`
- **Purpose:** Stores markdown notes and structured JSONB action items (`[{id, text, assignee, completed}]`).
- **Code:**
```python
def create_note(
    db: Session,
    meeting_id: UUID,
    author_user_id: UUID,
    title: str,
    content: str,
    action_items: list[dict[str, Any]],
) -> MeetingNote:
    note = MeetingNote(
        meeting_id=meeting_id,
        author_user_id=author_user_id,
        title=title,
        content=content,
        action_items=action_items,
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note
```
- **Complexity:** Time O(1); Space O(size of content + action items).
- **Usage:** Called by `routes/notes.py` Note Taker endpoints.
- **Dependencies:** PostgreSQL JSONB serialization.
- **Current concerns:** Large notes with thousands of action items could increase payload size; needs client-side validation.
- **Constraints:** Action item list structure must adhere to JSON schema.
- **Review result:** (To be completed during audit.)

---

## Transcript Repository

### `transcript_repository.py` : `create_transcript`
- **File path:** `backend/app/repositories/transcript_repository.py`
- **Purpose:** Persists uploaded transcript metadata, validation flags, and parsed full-text content.
- **Code:**
```python
def create_transcript(
    db: Session,
    meeting_id: UUID,
    uploaded_by_user_id: UUID,
    original_filename: str,
    storage_path: str,
    file_format: str,
    file_size: int,
    content_text: str,
    validation_status: str,
    validation_flags: dict[str, Any],
) -> Transcript:
    transcript = Transcript(
        meeting_id=meeting_id,
        uploaded_by_user_id=uploaded_by_user_id,
        original_filename=original_filename,
        storage_path=storage_path,
        file_format=file_format,
        file_size=file_size,
        content_text=content_text,
        validation_status=validation_status,
        validation_flags=validation_flags,
    )
    db.add(transcript)
    db.commit()
    db.refresh(transcript)
    return transcript
```
- **Complexity:** Time O(T) where T is text size; Space O(T).
- **Usage:** Called by `routes/transcripts.py` after parser and validator completion.
- **Dependencies:** PostgreSQL `transcripts` table.
- **Current concerns:** Storing huge transcript texts (e.g. 50MB) directly in the database row can bloat table storage; consider external full-text index or TOAST limits.
- **Constraints:** `validation_status` must match ENUM strings (`ACCEPTED`, `NEEDS_REVIEW`, `REJECTED`).
- **Review result:** (To be completed during audit.)

---

# 3. Domain & Business Services

## `auth_service.py` : `get_or_create_user`

**Project:** MeetSync  
**File path:** `backend/app/services/auth_service.py`  
**Function name:** `get_or_create_user`

### 1. Purpose
Ensures that an authenticated Google user has an active User entity and automatically links any pre-existing meetings or participant records that matched their email prior to registration.

### 2. Code
```python
def get_or_create_user(
    db: Session,
    google_sub: str,
    email: str,
    name: str,
    profile_picture: str | None,
):
    user = get_user_by_google_sub(db=db, google_sub=google_sub)
    if user:
        user.name = name
        user.email = email
        user.profile_picture = profile_picture
        _link_user_to_existing_records(db=db, user=user)
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
    _link_user_to_existing_records(db=db, user=user)
    db.commit()
    db.refresh(user)
    return user
```

### 3. Complexity
- Time complexity: O(1) user check + O(M + P) updates over existing meetings/participants with unlinked email.
- Auxiliary space complexity: O(1).
- Input size or typical workload: 1 user record per login.

### 4. Usage
- Who calls this function? `auth.py` (`google_callback`).
- How frequently is it called? On every OAuth login.
- Does it run inside a loop or another frequently called function? No.

### 5. Dependencies
- Database queries: Query `users`, update `meeting_participants`, update `meetings`.
- External API calls: None.
- Other functions called: `_link_user_to_existing_records`, `create_user`.
- Shared state or side effects: Mutates DB records to link `user_id`.

### 6. Current concerns
`_link_user_to_existing_records` executes two unconditional UPDATE statements on every login even when the user is already linked.

### 7. Constraints
Must run within an atomic transaction.

### Review result
(To be completed during the audit.)

---

## `meeting_sync_service.py` : `sync_calendar_meetings`

**Project:** MeetSync  
**File path:** `backend/app/services/meeting_sync_service.py`  
**Function name:** `sync_calendar_meetings`

### 1. Purpose
Synchronizes events between Google Calendar and MeetSync incrementally using `sync_token`, parses attendees, creates meetings, guarantees the organizer is `agenda_owner`, and preserves assigned custom roles.

### 2. Code
*(Excerpt showing core sync pipeline)*
```python
def sync_calendar_meetings(db: Session, user_id, calendar) -> int:
    sync_state = get_calendar_sync(db=db, calendar_id=calendar.id)
    if not sync_state:
        sync_state = create_calendar_sync(db=db, calendar_id=calendar.id)

    sync_token = sync_state.sync_token
    sync_state.sync_status = "running"
    db.commit()

    processed_meeting_ids = set()
    try:
        events, next_sync_token = list_calendar_events(
            db=db,
            user_id=user_id,
            google_calendar_id=calendar.google_calendar_id,
            sync_token=sync_token,
        )

        for event in events:
            if event.get("status") != "cancelled" and not is_meeting_event(event):
                continue
            # Process cancellations or event upserts
            parsed = parse_google_event(event)
            # Upsert meeting, guarantee organizer has agenda_owner, upsert participants
            # Save raw payload to disk
            ...
        sync_state.sync_token = next_sync_token
        sync_state.sync_status = "success"
        sync_state.last_synced_at = datetime.now(timezone.utc)
        db.commit()
        return len(processed_meeting_ids)
    except Exception as exc:
        sync_state.sync_status = "failed"
        sync_state.last_error = str(exc)
        db.commit()
        raise
```

### 3. Complexity
- Time complexity: O(E * (A + log E)) where E is number of events and A is attendees per event.
- Auxiliary space complexity: O(E) for tracking processed IDs.
- Input size or typical workload: 10 to 2500 events per sync page.

### 4. Usage
- Who calls this function? `routes/calendar.py` (`sync_calendars`, `sync_meetings`), webhook background worker.
- How frequently is it called? On user-initiated sync and Google Calendar push webhook notifications.
- Does it run inside a loop or another frequently called function? Yes, loops over all modified events in calendar.

### 5. Dependencies
- Database queries: Multiple reads and upserts across `meetings`, `meeting_participants`, `meeting_sources`.
- External API calls: Google Calendar API (`events().list()`).
- Other functions called: `list_calendar_events`, `parse_google_event`, `save_raw_event`.
- Shared state or side effects: Modifies `calendar_syncs.sync_token`, updates DB rows, writes to disk.

### 6. Current concerns
**N+1 DB operations**: Each attendee and meeting is queried individually within the loop. Batch querying attendees and meetings using `in_()` would significantly accelerate large initial calendar imports.

### 7. Constraints
Must handle 410 Gone fallback and never erase specialized participant roles (`note_taker`, `personal_assistant`) on subsequent sync runs.

### Review result
(To be completed during the audit.)

---

## `calendar_watch_service.py` : `renew_expiring_watches`

**Project:** MeetSync  
**File path:** `backend/app/services/calendar_watch_service.py`  
**Function name:** `renew_expiring_watches`

### 1. Purpose
Scans the database for expiring or expired Google Calendar watch channels (within a 24-hour buffer) and swaps them with fresh channels safely without resetting `sync_token`.

### 2. Code
```python
def renew_expiring_watches(
    db: Session,
    buffer_hours: int | None = None,
) -> list[dict]:
    buffer = (
        buffer_hours
        if buffer_hours is not None
        else settings.GOOGLE_WATCH_RENEWAL_BUFFER_HOURS
    )
    now = datetime.now(timezone.utc)
    threshold = now + timedelta(hours=buffer)

    syncs_needing_renewal = get_calendar_syncs_needing_renewal(
        db=db,
        before_time=threshold,
        for_update=True,
    )
    if not syncs_needing_renewal:
        return []

    results = []
    for sync in syncs_needing_renewal:
        # Create new watch channel with Google API
        # Persist new channel credentials atomically
        # Best-effort stop old channel
        ...
    return results
```

### 3. Complexity
- Time complexity: O(C * G) where C is expiring channels and G is Google API network roundtrip.
- Auxiliary space complexity: O(C).
- Input size or typical workload: Usually 0 to 5 channels per hourly cycle.

### 4. Usage
- Who calls this function? `watch_renewal.py` background worker scheduler task.
- How frequently is it called? Once every hour (`GOOGLE_WATCH_RENEWAL_INTERVAL_SECONDS`).
- Does it run inside a loop or another frequently called function? Yes, called by the continuous background loop.

### 5. Dependencies
- Database queries: Row-locked select query on `calendar_syncs`, update queries per channel.
- External API calls: Google Calendar `events().watch()` and `channels().stop()`.
- Other functions called: `watch_calendar_events`, `stop_calendar_watch`, `update_calendar_sync_channel`.
- Shared state or side effects: Updates Google webhook registrations and DB expiration timestamps.

### 6. Current concerns
None. Includes row locking (`skip_locked=True`) preventing multi-worker race conditions.

### 7. Constraints
`sync_token` must remain completely intact during renewal.

### Review result
(To be completed during the audit.)

---

## `transcript_parser.py` : `parse_transcript_file`

**Project:** MeetSync  
**File path:** `backend/app/services/transcript_parser.py`  
**Function name:** `parse_transcript_file`

### 1. Purpose
Parses uploaded transcript recording files across multiple formats (`.vtt`, `.srt`, `.json`, `.txt`, `.docx`), extracting speech cues, detected speakers, and total word count.

### 2. Code
```python
def parse_transcript_file(file_path: str, ext: str) -> dict[str, Any]:
    p = Path(file_path)
    ext = ext.lower().strip()
    raw_bytes = p.read_bytes()
    try:
        content = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        content = raw_bytes.decode("latin-1")

    if ext == ".vtt":
        res = parse_vtt(content)
    elif ext == ".srt":
        res = parse_srt(content)
    elif ext == ".json":
        res = parse_json_transcript(content)
    elif ext in (".txt", ".md"):
        speakers, full_text = _extract_speakers_from_lines(content.splitlines())
        words = re.findall(r"\w+", full_text)
        res = {
            "text": full_text,
            "cues": [],
            "speakers": speakers,
            "word_count": len(words),
            "cue_count": 0,
        }
    else:
        speakers, full_text = _extract_speakers_from_lines(content.splitlines())
        words = re.findall(r"\w+", full_text)
        res = {
            "text": full_text,
            "cues": [],
            "speakers": speakers,
            "word_count": len(words),
            "cue_count": 0,
        }

    res["format"] = ext
    return res
```

### 3. Complexity
- Time complexity: O(N) where N is file size (in bytes/characters).
- Auxiliary space complexity: O(N) for decoded in-memory text.
- Input size or typical workload: 10KB to 25MB text/subtitle files.

### 4. Usage
- Who calls this function? `routes/transcripts.py` (`upload_transcript`).
- How frequently is it called? On every transcript upload.
- Does it run inside a loop or another frequently called function? No.

### 5. Dependencies
- Database queries: None.
- External API calls: None.
- Other functions called: `parse_vtt`, `parse_srt`, `parse_json_transcript`, `_extract_speakers_from_lines`.
- Shared state or side effects: Reads file from local disk.

### 6. Current concerns
`re.findall(r"\w+", full_text)` creates a full list of words in memory. For huge files, a regex iterator (`re.finditer`) or `len(full_text.split())` would reduce memory allocations.

### 7. Constraints
Must return dictionary with `text`, `cues`, `speakers`, `word_count`, `cue_count`.

### Review result
(To be completed during the audit.)

---

## `transcript_validator.py` : `validate_parsed_transcript`

**Project:** MeetSync  
**File path:** `backend/app/services/transcript_validator.py`  
**Function name:** `validate_parsed_transcript`

### 1. Purpose
Executes deterministic, rule-based verification on parsed transcripts (minimum word count threshold, subtitle cue ordering, meeting duration sanity check, attendee speaker matching).

### 2. Code
```python
def validate_parsed_transcript(
    parsed: dict[str, Any],
    meeting: Meeting,
) -> dict[str, Any]:
    file_format = parsed.get("format", "").lower()
    word_count = parsed.get("word_count", 0)
    cues = parsed.get("cues", [])
    detected_speakers = parsed.get("speakers", [])

    warnings: list[str] = []
    details: dict[str, Any] = {
        "cue_count": len(cues),
        "word_count": word_count,
        "format": file_format,
    }

    status = "ACCEPTED"
    format_valid = True
    timestamp_match = True
    participant_mismatch = False

    min_word_count = settings.TRANSCRIPT_MIN_WORD_COUNT
    if word_count == 0:
        return {
            "status": "REJECTED",
            "participant_mismatch": False,
            "timestamp_match": False,
            "format_valid": False,
            "detected_speakers": [],
            "warnings": ["The transcript file is empty or contains no readable text."],
            "word_count": 0,
            "details": details,
        }

    if word_count < min_word_count:
        warnings.append(
            f"Transcript contains only {word_count} words (below recommended threshold of {min_word_count})."
        )
        status = "NEEDS_REVIEW"

    if file_format in (".vtt", ".srt"):
        if len(cues) == 0:
            return {
                "status": "REJECTED",
                "participant_mismatch": False,
                "timestamp_match": False,
                "format_valid": False,
                "detected_speakers": [],
                "warnings": [f"Subtitle format '{file_format}' contains no valid timestamp cues."],
                "word_count": word_count,
                "details": details,
            }
        backwards_cues = [c for c in cues if c.get("start") is not None and c.get("end") is not None and c["start"] > c["end"]]
        if backwards_cues:
            warnings.append(f"Found {len(backwards_cues)} cue(s) where start time exceeds end time.")
            timestamp_match = False
            status = "NEEDS_REVIEW"

    # Soft attendee matching against meeting.participants
    ...
    return {
        "status": status,
        "participant_mismatch": participant_mismatch,
        "timestamp_match": timestamp_match,
        "format_valid": format_valid,
        "detected_speakers": detected_speakers,
        "warnings": warnings,
        "word_count": word_count,
        "details": details,
    }
```

### 3. Complexity
- Time complexity: O(C + S * P) where C is cues, S is detected speakers, and P is meeting attendees.
- Auxiliary space complexity: O(W) where W is warnings.
- Input size or typical workload: 1 transcript validation report.

### 4. Usage
- Who calls this function? `routes/transcripts.py` (`upload_transcript`).
- How frequently is it called? Once per uploaded transcript.
- Does it run inside a loop or another frequently called function? No.

### 5. Dependencies
- Database queries: Accesses `meeting.participants` relationship.
- External API calls: None.
- Other functions called: None.
- Shared state or side effects: None.

### 6. Current concerns
None. Speaker mismatches are appropriately treated as non-blocking review warnings rather than hard rejections.

### 7. Constraints
Rejections must only occur if word count is 0 or subtitle cues are completely missing.

### Review result
(To be completed during the audit.)

---

## `search_service.py` : `search_meetings_for_user`

**Project:** MeetSync  
**File path:** `backend/app/services/search_service.py`  
**Function name:** `search_meetings_for_user`

### 1. Purpose
Executes membership-scoped search across meetings, notes, and transcript bodies for a given user, applying date filters, role filters, and snippet extraction.

### 2. Code
*(Core search querying logic)*
```python
def search_meetings_for_user(
    db: Session,
    user: User,
    query: MeetingSearchQuery,
) -> tuple[list[MeetingSearchResult], int]:
    participated_ids = (
        db.query(MeetingParticipant.meeting_id)
        .filter(
            (MeetingParticipant.user_id == user.id)
            | (MeetingParticipant.email.ilike(user.email))
        )
        .subquery()
    )

    base_query = db.query(Meeting).filter(
        or_(
            Meeting.organizer_user_id == user.id,
            Meeting.organizer_email.ilike(user.email),
            Meeting.id.in_(participated_ids),
        )
    )

    if query.start_date:
        base_query = base_query.filter(Meeting.start_time >= query.start_date)
    if query.end_date:
        base_query = base_query.filter(Meeting.start_time <= query.end_date)

    if query.q:
        q_term = f"%{query.q.strip()}%"
        matching_note_meeting_ids = (
            db.query(MeetingNote.meeting_id)
            .filter(or_(MeetingNote.title.ilike(q_term), MeetingNote.content.ilike(q_term)))
            .subquery()
        )
        matching_transcript_meeting_ids = (
            db.query(Transcript.meeting_id)
            .filter(or_(Transcript.original_filename.ilike(q_term), Transcript.content_text.ilike(q_term)))
            .subquery()
        )
        base_query = base_query.filter(
            or_(
                Meeting.title.ilike(q_term),
                Meeting.id.in_(matching_note_meeting_ids),
                Meeting.id.in_(matching_transcript_meeting_ids),
            )
        )

    all_matching = base_query.order_by(Meeting.start_time.desc()).all()

    # In-memory role filter and snippet building
    ...
    return results, total
```

### 3. Complexity
- Time complexity: O(M + N_notes + T_transcripts). `ILIKE %term%` incurs full table scans unless trigram indexes (pg_trgm) are utilized.
- Auxiliary space complexity: O(M) where M is matched meetings loaded into memory.
- Input size or typical workload: 1 user query over portfolio of 50-500 meetings.

### 4. Usage
- Who calls this function? `routes/search.py` (`search_meetings`, `get_past_meetings`).
- How frequently is it called? On user keyword searches and Assistant Archive page loads.
- Does it run inside a loop or another frequently called function? No.

### 5. Dependencies
- Database queries: Subqueries on `meeting_participants`, `meeting_notes`, `transcripts`, and subsequent individual queries for snippets.
- External API calls: None.
- Other functions called: `_extract_snippets`, `get_meeting_role`.
- Shared state or side effects: None.

### 6. Current concerns
1. **Unindexed ILIKE scans**: `%q%` scans entire transcript texts. A PostgreSQL full-text search (`tsvector` / `tsquery`) or GIN trigram index should be added.
2. **N+1 queries during snippet extraction**: Queries notes and transcripts separately per meeting in the result page.

### 7. Constraints
Security boundary: Must never return meetings the user did not attend or organize.

### Review result
(To be completed during the audit.)

---

# 4. Background Workers & Application Lifespan

## `watch_renewal.py` : `watch_renewal_scheduler_task`

**Project:** MeetSync  
**File path:** `backend/app/workers/watch_renewal.py`  
**Function name:** `watch_renewal_scheduler_task`

### 1. Purpose
Continuous async task running during application lifespan to trigger renewal cycles for Google Calendar push notification channels.

### 2. Code
```python
async def watch_renewal_scheduler_task():
    interval = settings.GOOGLE_WATCH_RENEWAL_INTERVAL_SECONDS
    logger.info(f"Starting background watch renewal scheduler loop (interval: {interval}s)...")
    await asyncio.sleep(5)
    while True:
        try:
            await asyncio.to_thread(run_watch_renewal_cycle)
        except asyncio.CancelledError:
            logger.info("Watch renewal scheduler task cancelled; exiting loop.")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error in watch renewal loop: {exc}", exc_info=True)
        await asyncio.sleep(interval)
```

### 3. Complexity
- Time complexity: O(1) loop management, delegated to `run_watch_renewal_cycle`.
- Auxiliary space complexity: O(1).
- Input size or typical workload: Periodic hourly invocation.

### 4. Usage
- Who calls this function? `main.py` inside `lifespan` context manager.
- How frequently is it called? Starts once at server boot.
- Does it run inside a loop or another frequently called function? It is an infinite async scheduler loop.

### 5. Dependencies
- Database queries: Delegated via thread pool.
- External API calls: Delegated.
- Other functions called: `asyncio.to_thread(run_watch_renewal_cycle)`.
- Shared state or side effects: Maintains Google webhook registrations.

### 6. Current concerns
None. Uses `asyncio.to_thread` properly preventing event loop blocking.

### 7. Constraints
Must handle `asyncio.CancelledError` cleanly on shutdown.

### Review result
(To be completed during the audit.)

---

## `main.py` : `lifespan`

**Project:** MeetSync  
**File path:** `backend/app/main.py`  
**Function name:** `lifespan`

### 1. Purpose
FastAPI application lifespan context manager managing startup and graceful cancellation of background workers.

### 2. Code
```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler_task = None
    if settings.ENABLE_BACKGROUND_WATCH_SCHEDULER:
        logger.info("Initializing background watch renewal scheduler...")
        scheduler_task = asyncio.create_task(watch_renewal_scheduler_task())
    else:
        logger.info("Background watch renewal scheduler is disabled by configuration.")

    try:
        yield
    finally:
        if scheduler_task and not scheduler_task.done():
            logger.info("Stopping background watch renewal scheduler...")
            scheduler_task.cancel()
            try:
                await scheduler_task
            except asyncio.CancelledError:
                pass
```

### 3. Complexity
- Time complexity: O(1).
- Auxiliary space complexity: O(1).
- Input size or typical workload: 1 startup, 1 shutdown.

### 4. Usage
- Who calls this function? ASGI server (Uvicorn) on application lifecycle events.
- How frequently is it called? Once per server lifecycle.
- Does it run inside a loop or another frequently called function? No.

### 5. Dependencies
- Database queries: None directly.
- External API calls: None.
- Other functions called: `asyncio.create_task`, `scheduler_task.cancel()`.
- Shared state or side effects: Starts background tasks.

### 6. Current concerns
None.

### 7. Constraints
Must adhere to Starlette/FastAPI lifespan protocol.

### Review result
(To be completed during the audit.)

---

## `main.py` : `spa_fallback`

**Project:** MeetSync  
**File path:** `backend/app/main.py`  
**Function name:** `spa_fallback`

### 1. Purpose
Handles Single Page Application (SPA) client-side routing by serving `index.html` for unknown frontend routes while rejecting API/docs routes with 404.

### 2. Code
```python
@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    if full_path.startswith(("api/", "docs", "redoc", "openapi.json")):
        return {"detail": "Not Found"}
    file_path = DIST_DIR / full_path
    if file_path.exists() and file_path.is_file():
        return FileResponse(str(file_path))
    index_file = DIST_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"detail": "Not Found"}
```

### 3. Complexity
- Time complexity: O(1) path check + filesystem check.
- Auxiliary space complexity: O(1).
- Input size or typical workload: Path string.

### 4. Usage
- Who calls this function? Browser navigation to non-API URLs (e.g. `/meetings/123`, `/assistant`).
- How frequently is it called? On direct URL reloads or browser history links.
- Does it run inside a loop or another frequently called function? No.

### 5. Dependencies
- Database queries: None.
- External API calls: None.
- Other functions called: `FileResponse`.
- Shared state or side effects: Reads file from disk.

### 6. Current concerns
Filesystem existence check (`index_file.exists()`) happens on every unrouted request; in production, static caching headers should be attached.

### 7. Constraints
Must never intercept `/api/*` or OpenAPI endpoints.

### Review result
(To be completed during the audit.)

---

# 5. API Route Handlers

## `auth.py` : `google_login` & `google_callback`
- **File path:** `backend/app/api/routes/auth.py`
- **Purpose:** Initiates Google OAuth2 authentication flow with encrypted PKCE state, exchanges authorization code for tokens, sets HttpOnly `meetsync_session` cookie, and redirects user to dashboard.
- **Code:** Defined in `auth.py` lines 58-265.
- **Complexity:** Time O(Network roundtrip with Google); Space O(1).
- **Usage:** Called directly by user clicking "Sign in with Google" and by Google OAuth callback.
- **Dependencies:** Google OAuth endpoints, `get_or_create_user`, `save_google_credential`, `create_access_token`.
- **Current concerns:** Handles multiple fallback decryption strategies for state parameter compatibility.
- **Constraints:** Must set `HttpOnly`, `SameSite=Lax` cookie and avoid leaking JWT in URL parameters.
- **Review result:** (To be completed during audit.)

---

## `calendar.py` : `sync_calendars`
- **File path:** `backend/app/api/routes/calendar.py`
- **Purpose:** Synchronizes all accessible Google calendars and meetings for the authenticated user on demand.
- **Code:** Defined in `calendar.py` lines 21-61.
- **Complexity:** Time O(C * E) where C is user calendars and E is events per calendar.
- **Usage:** Dashboard "Sync Calendar" button.
- **Dependencies:** `sync_user_calendars`, `sync_calendar_meetings`.
- **Current concerns:** Long calendar histories can take several seconds; consider returning a 202 Accepted and running via `BackgroundTasks`.
- **Constraints:** Must update `calendar_syncs` status.
- **Review result:** (To be completed during audit.)

---

## `meetings.py` : `update_meeting_participant_role`
- **File path:** `backend/app/api/routes/meetings.py`
- **Purpose:** Allows the Agenda Owner to reassign roles (`note_taker`, `personal_assistant`, `participant`) for a meeting attendee.
- **Code:** Defined in `meetings.py` lines 136-183.
- **Complexity:** Time O(1); Space O(1).
- **Usage:** Participant roster role selection dropdown.
- **Dependencies:** `require_meeting_roles(["agenda_owner"])`, `update_participant_role`.
- **Current concerns:** None. Contains strict guard prohibiting Agenda Owner from demoting themselves.
- **Constraints:** Agenda Owner authority is mandatory.
- **Review result:** (To be completed during audit.)

---

## `notes.py` : `create_meeting_note`
- **File path:** `backend/app/api/routes/notes.py`
- **Purpose:** Allows the Note Taker to create structured meeting notes with checklist action items.
- **Code:** Defined in `notes.py` lines 37-64.
- **Complexity:** Time O(1); Space O(action_items size).
- **Usage:** NotesSection "Add Note" button.
- **Dependencies:** `require_meeting_roles(["note_taker"])`, `create_note`.
- **Current concerns:** None.
- **Constraints:** Restricted exclusively to `note_taker`.
- **Review result:** (To be completed during audit.)

---

## `transcripts.py` : `upload_transcript`
- **File path:** `backend/app/api/routes/transcripts.py`
- **Purpose:** Receives recording uploads, streams file to storage under size bounds, parses cues/text, and validates quality deterministically.
- **Code:** Defined in `transcripts.py` lines 76-139.
- **Complexity:** Time O(File size + word count); Space O(File size).
- **Usage:** TranscriptsSection upload modal.
- **Dependencies:** `save_transcript_file`, `parse_transcript_file`, `validate_parsed_transcript`, `create_transcript`.
- **Current concerns:** Multipart file parsing is synchronous after stream; extremely large docx files could benefit from background celery/worker offloading.
- **Constraints:** Restricted exclusively to `note_taker`.
- **Review result:** (To be completed during audit.)

---

## `webhook.py` : `handle_google_calendar_webhook`
- **File path:** `backend/app/api/routes/webhook.py`
- **Purpose:** Google Calendar push notification ingress webhook. Queues incremental sync via `BackgroundTasks` upon receiving `exists` resource state.
- **Code:** Defined in `webhook.py` lines 55-130.
- **Complexity:** Time O(1) to acknowledge Google; background task runs O(E).
- **Usage:** Invoked by Google Calendar notification infrastructure.
- **Dependencies:** `get_sync_by_channel_id`, `background_tasks.add_task(_process_calendar_notification)`.
- **Current concerns:** None. Immediate 200 return satisfies Google webhook timeout requirements (< 5s).
- **Constraints:** Must acknowledge `sync` state immediately.
- **Review result:** (To be completed during audit.)

---

# 6. Frontend API Client & Core Utilities

## `frontend/api/auth.js` : `getCurrentUser`
- **File path:** `frontend/frontend/src/api/auth.js`
- **Purpose:** Fetches current user profile (`/api/auth/me`) using HttpOnly session cookie on application initialization.
- **Code:**
```javascript
export async function getCurrentUser() {
  return http.get('/auth/me');
}
```
- **Complexity:** Time O(Network roundtrip); Space O(1).
- **Usage:** `AuthContext.jsx` on initial mount and route change.
- **Dependencies:** `http.js` Axios wrapper.
- **Current concerns:** Cached via TanStack Query; optimal.
- **Constraints:** Credentials (`withCredentials: true`) must be enabled.
- **Review result:** (To be completed during audit.)

---

## `frontend/api/notes.js` : `getMeetingNotes` & `createMeetingNote`
- **File path:** `frontend/frontend/src/api/notes.js`
- **Purpose:** Communicates with `/api/meetings/{id}/notes` with envelope unwrapping (`res?.notes || res`).
- **Code:**
```javascript
export async function getMeetingNotes(meetingId) {
  const res = await http.get(`/meetings/${meetingId}/notes`);
  return res?.notes || res;
}

export async function createMeetingNote(meetingId, noteData) {
  return http.post(`/meetings/${meetingId}/notes`, noteData);
}
```
- **Complexity:** Time O(Network roundtrip); Space O(notes count).
- **Usage:** `NotesSection.jsx` query and mutation hooks.
- **Dependencies:** Axios client.
- **Current concerns:** None. Envelope unwrapping prevents React array rendering crashes.
- **Constraints:** Must supply `meetingId` in URL path.
- **Review result:** (To be completed during audit.)

---

## `frontend/lib/roles.js` : `canUserEditNote` & `canUserManageRoles`
- **File path:** `frontend/frontend/src/lib/roles.js`
- **Purpose:** Pure functions evaluating client-side UI permissions based on active meeting role.
- **Code:**
```javascript
export function canUserEditNote(userRole, noteAuthorId, currentUserId) {
  if (userRole !== 'note_taker') return false;
  return noteAuthorId === currentUserId;
}

export function canUserManageRoles(userRole) {
  return userRole === 'agenda_owner';
}

export function canUserUploadTranscript(userRole) {
  return userRole === 'note_taker';
}
```
- **Complexity:** Time O(1); Space O(1).
- **Usage:** Render condition in `NotesSection.jsx`, `TranscriptsSection.jsx`, and `MeetingDetailPage.jsx`.
- **Dependencies:** None. Pure boolean logic.
- **Current concerns:** None.
- **Constraints:** Must mirror backend RBAC dependencies in `dependencies.py`.
- **Review result:** (To be completed during audit.)

---

*End of Function Optimization Review Document.*

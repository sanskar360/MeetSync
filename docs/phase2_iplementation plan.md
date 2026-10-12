# MeetSync Phase 2: Implementation Plan & Impact Analysis

---

## 1. Current Architecture & Codebase Inspection

### 1.1. Current Authentication Flow & Production Hardening
- **Provider**: Google OAuth 2.0 via `google-auth-oauthlib`.
- **Initiation**: `GET /api/auth/google/login` creates an OAuth flow with scopes (`openid`, `userinfo.email`, `userinfo.profile`, `calendar.readonly`).
- **Production State Storage Fix**:
  - *Current limitation*: Currently stores `code_verifier` in a local Python dictionary (`oauth_states = {}`). In-memory dictionaries fail in multi-worker environments (Gunicorn/Uvicorn workers) and across container restarts.
  - *Production standard*: Store the OAuth state and PKCE `code_verifier` in an encrypted, short-lived `HttpOnly`, `SameSite=Lax`, `Secure` cookie (or a Redis/DB-backed session table with a 10-minute TTL). This maintains stateless worker compatibility while preserving strong CSRF protection.
- **Callback & Token Delivery Without URL Exposure**:
  - `GET /api/auth/google/callback` validates state, exchanges code for Google tokens, requests Google userinfo, extracts `google_sub`, `email`, `name`, `profile_picture`.
  - Calls `get_or_create_user()`, encrypts Google refresh token in `google_credentials`.
  - *Token Delivery*: **Never expose JWT access tokens in URL query parameters or hash fragments** (which leak in browser history, logs, and referrer headers). Instead, the callback sets a secure `HttpOnly`, `SameSite=Lax` session cookie (or issues an ephemeral, single-use authorization code exchanged via a secure `POST /api/auth/token` endpoint) and redirects cleanly to the frontend `/dashboard`.

---

### 1.2. Current User Model
Defined in `backend/app/models/user.py`:
- `id` (UUID, primary key)
- `google_sub` (String, unique, not null)
- `email` (String, unique, not null)
- `name` (String, not null)
- `profile_picture` (String, nullable)
- `created_at` (DateTime with timezone)
- `updated_at` (DateTime with timezone)
- **Relationships**: `meetings` (as organizer), `google_credential`, `calendars`, `meeting_participations`.
- *Note*: No global role is stored on `User`, which matches our requirement for meeting-specific roles.

---

### 1.3. Current Meeting Model
Defined in `backend/app/models/meeting.py`:
- `id` (UUID, primary key)
- `google_event_id` (String)
- `google_ical_uid` (String, nullable)
- `calendar_id` (UUID FK -> `calendars.id`)
- `title` (String)
- `start_time` (DateTime with timezone)
- `end_time` (DateTime with timezone)
- `meet_url` (Text, nullable)
- `organizer_user_id` (UUID FK -> `users.id`, nullable)
- `organizer_email` (String, nullable)
- `event_type`, `google_updated_at`, `google_etag`, `google_sequence`, `status`, `raw_payload_path`, `created_at`, `updated_at`.
- **Identity Constraint**: `(google_ical_uid, start_time)` unique constraint for recurring and single event deduplication.
- **Relationships**: `organizer` (`User`), `calendar` (`Calendar`), `participants` (`MeetingParticipant`), `sources` (`MeetingSource`).

---

### 1.4. Current MeetingParticipant Model & Role Alignment
Defined in `backend/app/models/meeting_participant.py`:
- `id` (UUID, primary key)
- `meeting_id` (UUID FK -> `meetings.id`)
- `user_id` (UUID FK -> `users.id`, nullable)
- `email` (String, not null)
- `role` (String, default `"participant"`, not null)
- `response_status` (String, nullable: e.g. `"accepted"`, `"declined"`, `"needsAction"`)
- `joined_at` (DateTime, nullable)
- `created_at` (DateTime)
- **Unique Constraint**: `(meeting_id, email)`
- **Role Upgrade**: Phase 1 wrote `"organizer"` as a participant role string. Phase 2 standardizes this to `"agenda_owner"`. The migration path will include a data migration step updating existing `"organizer"` records to `"agenda_owner"`.

---

### 1.5. Calendar Synchronization & Organizer Handling
1. `POST /api/calendars/sync` or Webhook `POST /api/webhooks/google-calendar` triggers `sync_calendar_meetings()` in `backend/app/services/meeting_sync_service.py`.
2. Reads `sync_token` from `calendar_syncs` table, queries Google Calendar API via `list_calendar_events()`.
3. For each event:
   - Identifies non-meeting events vs meetings using `is_meeting_event()`.
   - Parses organizer email via `parse_google_event()`.
   - Resolves organizer to local user via `get_user_by_email()`.
   - Creates or updates `Meeting` and `MeetingSource`.
   - **Guaranteed Agenda Owner Record**: In Google Calendar payloads, the organizer is frequently omitted from the `attendees` array. MeetSync must explicitly guarantee that a `MeetingParticipant` record is created for `organizer_email` with role `"agenda_owner"`.
   - **Preserving Manual Role Assignments**: When processing `attendees`, do not unconditionally overwrite roles with `"participant"`. Existing manual assignments (`"note_taker"`, `"personal_assistant"`) must be preserved across incremental syncs.
   - **Attendee Removal & Organizer Transfer**: Handle attendee deletions from Google events cleanly without deleting historical notes or transcripts authored by that attendee. If organizer changes, update `organizer_user_id` and transfer `agenda_owner` role accordingly.
4. Saves raw Google event JSON to storage.
5. Updates `sync_token` and `last_synced_at` in `calendar_syncs`.
- *Ingestion Stability*: Google Calendar event parsing (`google_event_parser.py`) remains untouched in Phase 2 to prevent any regression in working synchronization.

---

### 1.6. Current Route / Service / Repository Structure
- **Routes** (`backend/app/api/routes/`): `auth.py`, `calendar.py`, `webhook.py`, `health.py`.
- **Services** (`backend/app/services/`): `auth_service.py`, `calendar_service.py`, `google_calendar_service.py`, `google_event_parser.py`, `meeting_sync_service.py`, `calendar_watch_service.py`, `raw_event_storage.py`.
- **Repositories** (`backend/app/repositories/`): `user_repository.py`, `google_credential_repository.py`, `calendar_repository.py`, `calendar_sync_repository.py`, `meeting_repository.py`, `meeting_source_repository.py`, `meeting_participant_repository.py`.
- **Workers** (`backend/app/workers/`): `watch_renewal.py`.

---

### 1.7. Existing Migration Structure
- Managed using **Alembic** under `backend/migrations/` with 8 sequential versions ending at `c7a19d83e201`.

---

### 1.8. Current Validation & Schema State
- FastAPIs routes currently return untyped Python dictionaries and accept raw query/path parameters.
- Target: Introduce focused, practical Pydantic V2 schemas for Phase 2 API boundaries (role updates, notes CRUD, transcript responses, search parameters).
- Avoid unnecessary generic schema abstractions; maintain strict query parameter validation on FastAPI route handlers.

---

## 2. Impact Analysis: Modified vs. New Files

### Exact Files That Need Modification

| File | Why Needed | Can Existing Code Be Reused? | Impact on Existing Phase 1 Behavior |
| :--- | :--- | :--- | :--- |
| **`backend/app/core/config.py`** | Add `JWT_SECRET_KEY`, `JWT_ALGORITHM` (HS256), `ACCESS_TOKEN_EXPIRE_MINUTES`, `MAX_TRANSCRIPT_FILE_SIZE_BYTES`, `TRANSCRIPT_MIN_WORD_COUNT`, `TRANSCRIPT_STORAGE_BACKEND`, `TRANSCRIPT_STORAGE_DIR`. Preserve existing `Settings` class and `os.getenv` pattern with strict production checks (fail startup if `JWT_SECRET_KEY` is empty or insecure in production). | Yes, safely append new attributes with clean fallbacks. | None. Existing config values and startup behavior remain 100% intact. |
| **`backend/app/services/auth_service.py`** | When a user logs in / signs up via Google OAuth, link any existing `meeting_participants` and `meetings.organizer_user_id` where `email == user.email`. | Yes, extend `get_or_create_user()` | Enhances late-signup user linking without modifying user creation flow. |
| **`backend/app/api/routes/auth.py`** | Replace in-memory state dictionary with secure, encrypted state cookies. Validate state, exchange Google code, issue signed application JWT, and deliver token via secure cookie/session redirect flow. | Yes, keep Google OAuth Flow identical, replace state storage and callback response. | Multi-worker safe, protected against CSRF and token URL leakage. |
| **`backend/app/services/meeting_sync_service.py`** | 1. Ensure `agenda_owner` participant is always created for `organizer_email` even if omitted from `attendees`.<br>2. Preserve existing `"note_taker"` and `"personal_assistant"` roles during recurring calendar syncs.<br>3. Handle organizer transfer and removed attendees gracefully. | Yes, targeted adjustments in attendee sync loop. | Fixes sync overwrite bugs and ensures consistent meeting ownership. |
| **`backend/app/repositories/meeting_participant_repository.py`** | Add `update_participant_role()` and `get_participant_by_id()` for role assignment. | Yes, add repository methods following existing patterns. | None. Existing repository methods remain intact. |
| **`backend/app/models/meeting.py`** | Add relationships for `notes` (`MeetingNote`) and `transcripts` (`Transcript`). | Yes, add standard SQLAlchemy `relationship()` hooks. | None. Existing fields and constraints remain unchanged. |
| **`backend/app/main.py`** | Include new routers (`meeting_router`, `note_router`, `transcript_router`, `search_router`). | Yes, add router inclusions. | None. Existing health, auth, calendar, and webhook routers remain active. |

---

### Exact New Files That Are Necessary

| File | Purpose | Why It Cannot Be In Existing File |
| :--- | :--- | :--- |
| **`backend/app/schemas/__init__.py`** | Export clean, lean Pydantic schemas. | Standard Python package structure. |
| **`backend/app/schemas/meeting.py`** | `RoleUpdateRequest` (validates role enum), `ParticipantResponse`. | Enforces valid role assignments (`participant`, `note_taker`, `personal_assistant`). |
| **`backend/app/schemas/note.py`** | `NoteCreateRequest`, `NoteUpdateRequest`, `NoteResponse`, `ActionItemSchema`. | Validates title, content, and structured action items with Pydantic V2. |
| **`backend/app/schemas/transcript.py`** | `TranscriptResponse`, `TranscriptTextResponse`, `ValidationReportSchema`. **Excludes heavy text content from metadata**. | Ensures lightweight transcript metadata responses while validating status enums. |
| **`backend/app/schemas/search.py`** | `MeetingSearchQuery` (strict constraints), `MeetingSearchResponse`. | Validates search filters, date ranges (`start_date <= end_date`), and pagination bounds (`page >= 1`, `1 <= limit <= 100`). |
| **`backend/app/core/jwt.py`** | Token creation, verification, and generic 401 error handling (`create_access_token`, `decode_access_token`). | Keeps cryptographic token utilities decoupled and reusable across API layers. |
| **`backend/app/core/dependencies.py`** | Central FastAPI dependencies: `get_current_user`, `get_meeting_role`, `require_meeting_roles`, `require_meeting_member`. | Eliminates code duplication for meeting-specific RBAC across routes. |
| **`backend/app/models/meeting_note.py`** | SQLAlchemy model for `meeting_notes` table. | Dedicated model file matching existing project structure (`models/meeting.py`, etc.). |
| **`backend/app/models/transcript.py`** | SQLAlchemy model for `transcripts` table. | Dedicated model file matching project conventions. |
| **`backend/migrations/versions/<id>_add_notes_and_transcripts.py`** | Alembic migration creating `meeting_notes` and `transcripts` tables, indexing foreign keys, and migrating existing `"organizer"` participant roles to `"agenda_owner"`. | Standard Alembic database migration procedure with forward/rollback testing. |
| **`backend/app/repositories/meeting_note_repository.py`** | Database CRUD for meeting notes. | Encapsulates DB queries for notes, keeping services clean. |
| **`backend/app/repositories/transcript_repository.py`** | Database CRUD for transcripts & audit info. | Encapsulates DB queries for transcripts. |
| **`backend/app/services/transcript_parser.py`** | Deterministic file parsers & text extractors for `.txt`, `.vtt`, `.srt`, `.md`, `.json`, `.pdf`, `.docx`. | File parsing logic must be isolated and unit-testable. |
| **`backend/app/services/transcript_validator.py`** | Deterministic structural & metadata validator (`ACCEPTED`, `NEEDS_REVIEW`, `REJECTED`). Treats speaker mismatches as **warnings** and validates timestamps only for subtitle formats. | Clean separation of deterministic validation rules without any LLM dependencies. |
| **`backend/app/services/transcript_storage.py`** | Persistent storage handler (local persistent directory or S3/volume interface) with streaming size validation and tempfile cleanup. | Safe filesystem handling, path sanitization, streaming upload validation, and failure cleanup. |
| **`backend/app/services/search_service.py`** | PostgreSQL-based search across meetings, notes, extracted transcripts, and metadata, strictly filtered by user's meeting membership. | Search query builder and aggregation logic with meeting-level security. |
| **`backend/app/api/routes/meetings.py`** | Meeting details, participant listing, and role assignment endpoint (`PATCH /api/meetings/{id}/participants/{pid}/role`). | Clean route segregation for meeting-centric operations. |
| **`backend/app/api/routes/notes.py`** | CRUD endpoints for meeting notes (`POST`, `GET`, `PATCH`, `DELETE`). Restricted to **Note Takers** for authoring. | Clean route segregation for notes. |
| **`backend/app/api/routes/transcripts.py`** | Transcript upload (Note Taker only), metadata listing, validation status, dedicated text retrieval endpoint (`/text`), and authorized streaming download (`/file`). | Clean route segregation for transcripts with strict meeting membership checks. |
| **`backend/app/api/routes/search.py`** | Search and past meeting browse endpoints with meeting-level RBAC enforcement. | Clean route segregation for search. |
| **`frontend/` UI implementation files** | Minimal, functional UI for login, meeting list, role assignment, note taking, transcript upload, and search. | Required for end-user interaction and acceptance testing. |

---

## 3. The 4 Sub-Phases of Phase 2

### Sub-Phase 2.1: Authentication Session, Meeting-Specific RBAC & Core Schemas
- **Goal**: Secure API communication with JWTs extending Google OAuth, implement meeting-specific role evaluation, protect role assignments during calendar sync, and support late signups.
- **Production OAuth State & Token Security**:
  - **No In-Memory State**: Store state and PKCE verifier in a signed, encrypted cookie (`oauth_state`) with a 10-minute expiry. Works seamlessly across multiple workers and restarts without Redis/DB overhead while preserving strict CSRF protection.
  - **Secure Token Delivery**: Callback exchanges code, validates user, creates application JWT, and delivers it via `HttpOnly`, `SameSite=Lax`, `Secure` session cookie (or redirect with a single-use exchange ticket). **Never pass tokens in URL query strings or hash fragments**.
  - **Client Token Handling**: Frontend maintains session via the secure cookie or stores the exchanged token in **application memory only**. No sensitive token persistence in browser `localStorage`.
  - **JWT Configuration**: Require strong secret configuration in production (fail startup if secret is default or under 32 chars). Validate `exp`, `iat`, and `sub` claims. Return generic HTTP 401 `"Could not validate credentials"` error responses to prevent information leakage.
- **Role Alignment & Calendar Sync Fixes**:
  - `Agenda Owner`: Assigned to the Google Calendar organizer.
    - If Google's API omits the organizer from the `attendees` list, explicitly inject an `agenda_owner` participant record for `meeting.organizer_email`.
    - Data migration: Migrate existing Phase 1 `"organizer"` participant records to `"agenda_owner"`.
  - Incremental Sync Preservation: Preserve manual assignments (`note_taker`, `personal_assistant`) when incremental sync updates attendee lists.
  - Agenda Owner permissions: Exclusively manage meeting details and role assignments (`PATCH /api/meetings/{id}/participants/{pid}/role`). Does not author notes or upload transcripts.
- **Pydantic Schemas (`backend/app/schemas/meeting.py`)**:
  - `MeetingRoleEnum`: `Literal["agenda_owner", "note_taker", "personal_assistant", "participant"]`
  - `RoleUpdateRequest`: Pydantic body validating `role: Literal["note_taker", "personal_assistant", "participant"]`.
  - `ParticipantResponse`: `id` (UUID), `user_id` (Optional[UUID]), `email` (str), `role` (str), `response_status` (Optional[str]), `ConfigDict(from_attributes=True)`.
- **Tasks**:
  1. Add JWT configuration settings safely to `core/config.py` with production secret checks.
  2. Implement `core/jwt.py` (`create_access_token`, `decode_access_token`) with generic 401 error handling.
  3. Refactor `api/routes/auth.py`:
     - Implement signed/encrypted cookie state handling.
     - Eliminate in-memory state dictionary.
     - Implement secure callback redirect flow without tokens in URLs.
  4. Implement `core/dependencies.py`:
     - `get_current_user`: extracts and validates JWT from session cookie or `Authorization: Bearer` header.
     - `get_meeting_role(current_user, meeting_id)`: returns active meeting role.
     - `require_meeting_roles(allowed_roles)`: reusable FastAPI dependency.
     - `require_meeting_member`: verifies user belongs to the meeting before any data access.
  5. Update `meeting_sync_service.py`:
     - Guarantee `agenda_owner` participant record creation.
     - Preserve manual role assignments during sync.
     - Handle attendee removals and organizer transfers.
  6. Update `auth_service.py` `get_or_create_user()`:
     - Automatically link late-signup `user_id` to matching `meeting_participants` and `meetings.organizer_user_id`.
  7. Implement `PATCH /api/meetings/{meeting_id}/participants/{participant_id}/role`:
     - Enforce `agenda_owner` RBAC dependency.
     - Validate input via `RoleUpdateRequest`.

---

### Sub-Phase 2.2: Meeting Notes (CRUD & Note Taker Authoring)
- **Goal**: Enable Note Takers to record, edit, and organize meeting notes and action items in PostgreSQL with focused Pydantic schema validation.
- **Role Permissions & Membership Enforcement**:
  - **Note Taker Authoring**: Only the designated `note_taker` for that meeting can create, edit, or delete notes (`POST`, `PATCH`, `DELETE`).
  - **Member-Only Read Access**: `GET /api/meetings/{meeting_id}/notes` and `GET /api/meetings/{meeting_id}/notes/{note_id}` are strictly restricted to authenticated participants of that specific meeting.
- **Pydantic Schemas (`backend/app/schemas/note.py`)**:
  - `ActionItemSchema`: `description` (str, 1..500 chars), `assignee_email` (Optional[str]), `is_completed` (bool = False), `due_date` (Optional[datetime]).
  - `NoteCreateRequest`:
    - `title`: `str = Field(..., min_length=1, max_length=255, strip_whitespace=True)`
    - `content`: `str = Field(..., min_length=1, strip_whitespace=True)`
    - `action_items`: `list[ActionItemSchema] = Field(default_factory=list)`
  - `NoteUpdateRequest`:
    - `title`: `Optional[str] = Field(None, min_length=1, max_length=255, strip_whitespace=True)`
    - `content`: `Optional[str] = Field(None, min_length=1, strip_whitespace=True)`
    - `action_items`: `Optional[list[ActionItemSchema]] = None`
  - `NoteResponse`:
    - `id` (UUID), `meeting_id` (UUID), `author_user_id` (UUID), `title` (str), `content` (str), `action_items` (list[ActionItemSchema]), `created_at` (datetime), `updated_at` (datetime), `ConfigDict(from_attributes=True)`.
- **Tasks**:
  1. Create `schemas/note.py`.
  2. Create `MeetingNote` model in `models/meeting_note.py`:
     - `id`, `meeting_id`, `author_user_id`, `title`, `content`, `action_items` (JSONB), `created_at`, `updated_at`.
  3. Create Alembic migration for `meeting_notes` table with foreign keys (cascade on meeting delete) and index on `meeting_id`.
  4. Implement `MeetingNoteRepository` and service queries.
  5. Implement Notes API endpoints in `api/routes/notes.py`:
     - `POST /api/meetings/{meeting_id}/notes`: **Only `note_taker`**
     - `GET /api/meetings/{meeting_id}/notes`: All meeting members
     - `GET /api/meetings/{meeting_id}/notes/{note_id}`: All meeting members
     - `PATCH /api/meetings/{meeting_id}/notes/{note_id}`: **Only note author (`note_taker`)**
     - `DELETE /api/meetings/{meeting_id}/notes/{note_id}`: **Only note author (`note_taker`)**

---

### Sub-Phase 2.3: Transcripts (Persistent Storage, Safe Streaming, Realistic Validation & Text Separation)
- **Goal**: Enable Note Takers to upload transcript files with verified persistent storage, streaming size limits, temporary file cleanup, realistic format-specific validation, and separate text retrieval.
- **Persistent Storage Architecture & Failure Atomicity**:
  - **Storage Architecture**: Implement `transcript_storage.py` with configurable backend (persistent directory/volume for deployment, or S3/MinIO interface). Ensure files survive container restarts and redeployments.
  - **Streaming & Content Verification**: Stream uploads in chunks and enforce `MAX_TRANSCRIPT_FILE_SIZE_BYTES` (25MB) during the stream to prevent memory exhaustion. Verify actual file magic bytes/MIME type, not just file extensions.
  - **Failure Cleanup**: Wrap upload and DB insertion in a transactional block. If database commit fails after file write (or parsing fails), immediately delete the uploaded/temporary file in a `try...finally` block to prevent orphaned files or broken DB pointers.
  - **Private File Access**: Storage is private; files are never exposed publicly. Served only through authenticated streaming endpoint `GET /api/meetings/{meeting_id}/transcripts/{transcript_id}/file` after verifying meeting membership.
- **Realistic Validation Rules**:
  - **Format-Aware Rules**: Timestamp verification and cue validation apply strictly to subtitle formats (`.srt`, `.vtt`). Plain text (`.txt`) and Markdown (`.md`) transcripts are **never rejected** for lacking timestamps or speaker labels.
  - **Configurable Word Count**: Minimum word-count threshold is controlled via `TRANSCRIPT_MIN_WORD_COUNT` (default 25 words) in configuration rather than hardcoded.
  - **Soft Participant Matching**: Speaker mismatches against Google Calendar attendees are recorded as informational **warnings** (`participant_mismatch: warning`), **never** triggering an automatic file rejection.
  - **Rejection Criteria**: Rejection is strictly reserved for unreadable files, corrupted encodings, zero parsed cues in SRT/VTT, or text below the minimum word count.
- **Payload & Response Design (Text Separation)**:
  - `TranscriptResponse` returns metadata, file stats, and validation report. **Strictly omits `content_text`** to keep responses fast and lightweight.
  - Dedicated endpoint `GET /api/meetings/{meeting_id}/transcripts/{transcript_id}/text` returns extracted text only when authorized meeting members explicitly request it.
- **Pydantic Schemas (`backend/app/schemas/transcript.py`)**:
  - `ValidationStatus`: `Literal["ACCEPTED", "NEEDS_REVIEW", "REJECTED"]`
  - `ValidationReportSchema`:
    - `status`: `ValidationStatus`
    - `participant_mismatch`: bool
    - `timestamp_match`: bool
    - `format_valid`: bool
    - `detected_speakers`: list[str]
    - `warnings`: list[str]
  - `TranscriptResponse`:
    - `id` (UUID), `meeting_id` (UUID), `uploaded_by_user_id` (UUID), `original_filename` (str), `file_format` (str), `file_size` (int), `validation_status` (ValidationStatus), `validation_report` (ValidationReportSchema), `created_at` (datetime), `ConfigDict(from_attributes=True)`.
  - `TranscriptTextResponse`:
    - `id` (UUID), `content_text` (str), `word_count` (int).
- **Tasks**:
  1. Create `schemas/transcript.py`.
  2. Create `Transcript` model in `models/transcript.py`:
     - `id`, `meeting_id`, `uploaded_by_user_id`, `original_filename`, `storage_path`, `file_format`, `file_size`, `content_text`, `validation_status`, `validation_flags` (JSONB), `created_at`, `updated_at`.
  3. Create Alembic migration for `transcripts` table with indexes on `(meeting_id, created_at)`.
  4. Implement `transcript_storage.py` with streaming limit, magic byte validation, and atomic failure cleanup.
  5. Implement `transcript_parser.py` (parsers for `.txt`, `.vtt`, `.srt`, `.md`, `.json`, `.pdf`, `.docx`).
  6. Implement `transcript_validator.py` with format-aware validation and soft speaker matching.
  7. Implement Transcripts API endpoints in `api/routes/transcripts.py`:
     - `POST /api/meetings/{meeting_id}/transcripts`: Upload file (**Only `note_taker`**) -> returns `TranscriptResponse`.
     - `GET /api/meetings/{meeting_id}/transcripts`: List metadata (**Meeting members only**) -> returns `list[TranscriptResponse]`.
     - `GET /api/meetings/{meeting_id}/transcripts/{transcript_id}`: Metadata & validation report (**Meeting members only**) -> returns `TranscriptResponse`.
     - `GET /api/meetings/{meeting_id}/transcripts/{transcript_id}/text`: Dedicated text retrieval (**Meeting members only**) -> returns `TranscriptTextResponse`.
     - `GET /api/meetings/{meeting_id}/transcripts/{transcript_id}/file`: Authorized file download streaming (**Meeting members only**).

---

### Sub-Phase 2.4: Consistent Archive Access, Search Constraints & Minimal Frontend
- **Goal**: Enable authenticated users to search and browse past meetings with strict meeting-level authorization, enforce Pydantic query constraints on FastAPI endpoints, and deliver a clean, functional frontend.
- **Consistent Archive Access & Scoped Search Policy**:
  - **Meeting-Level Scoping**: Search results and archives are strictly scoped to meetings in which the current user is an authenticated participant. A user can **never** see search results, snippets, notes, or transcripts for meetings they did not participate in.
  - **Personal Assistant Role Distinction**: Users assigned the `"personal_assistant"` role for a meeting are granted executive assistant delegation tools for that meeting:
    - Dedicated filter view: Browse all meetings organized by their Agenda Owner.
    - Quick access to action item status, transcript highlights, and meeting records.
  - **End-to-End Enforcement**: Meeting-level membership is enforced across **all layers**: search SQL filters, highlighted snippets, note contents, transcript text, and file downloads.
- **Pydantic Search Constraints (`backend/app/schemas/search.py`)**:
  - Applied directly to FastAPI query parameters via `Annotated[MeetingSearchQuery, Depends()]`:
  ```python
  class MeetingSearchQuery(BaseModel):
      q: Optional[str] = Field(None, max_length=200, strip_whitespace=True)
      start_date: Optional[datetime] = None
      end_date: Optional[datetime] = None
      role: Optional[Literal["agenda_owner", "note_taker", "personal_assistant", "participant"]] = None
      page: int = Field(default=1, ge=1)
      limit: int = Field(default=20, ge=1, le=100)

      @model_validator(mode="after")
      def validate_date_range(self) -> Self:
          if self.start_date and self.end_date and self.start_date > self.end_date:
              raise ValueError("start_date must be less than or equal to end_date")
          return self
  ```
  - `MeetingSearchResult`: `meeting_id`: UUID, `title`: str, `start_time`: datetime, `end_time`: datetime, `matching_notes_count`: int, `matching_transcripts_count`: int, `snippets`: list[str].
  - `MeetingSearchResponse`: `results`: list[MeetingSearchResult], `total`: int, `page`: int, `limit`: int.
- **Frontend Architecture & Security**:
  - **Token Handling**: Session maintained via `HttpOnly` cookie or held in client memory state. No token storage in `localStorage`.
  - Views & Role Adaptation:
    - Login: Google OAuth initiation and redirect callback.
    - Meetings Dashboard: Lists meetings where user is a participant with active role badges.
    - Agenda Owner View: Participant table with role assignment dropdowns (`note_taker`, `personal_assistant`, `participant`).
    - Note Taker View: Rich notes editor and transcript upload with validation report inspection.
    - Personal Assistant View: Meeting search interface with keyword search, date range filters, agenda owner delegation views, and past meeting archive browser.
- **Tasks**:
  1. Create `schemas/search.py` with strict constraints.
  2. Implement `search_service.py` and `api/routes/search.py`:
     - PostgreSQL search query restricted to user's participated meetings via `JOIN meeting_participants`.
     - `GET /api/meetings/search` (validated via `Annotated[MeetingSearchQuery, Depends()]`).
     - `GET /api/meetings/past`.
  3. Build frontend interface in `frontend/`:
     - Clean Vanilla JS/React UI.
     - In-memory/cookie session management.
     - Role-based UI visibility.
  4. End-to-end regression validation:
     - Verify calendar synchronization, watch channels, and webhooks remain 100% operational.
     - Verify role isolation, upload security, and search accuracy.

---

## 4. Key Architectural Policies & Standards

### 4.1. Role Permission & Archive Access Matrix

| Role | Assign Roles | View Meetings | Create / Edit Notes | Upload Transcripts | View Notes & Transcripts | Search Archive |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Agenda Owner** | **Yes** | Yes (Participating) | No | No | Yes (Participating) | Yes (Participating) |
| **Note Taker** | No | Yes (Participating) | **Yes** | **Yes** | Yes (Participating) | Yes (Participating) |
| **Personal Assistant** | No | Yes (Participating) | No | No | Yes (Participating) | **Yes (Delegation View)** |
| **Participant** | No | Yes (Participating) | No | No | Yes (Participating) | Yes (Participating) |

*Core Access Rule: All data access (meetings, notes, transcripts, search results, text, files) is strictly scoped to meetings in which the authenticated user is a participant. Personal Assistants receive specialized delegation views for meetings organized by their Agenda Owner.*

---

### 4.2. Production OAuth State & Token Security Standard
- **Multi-Worker State Storage**: Store OAuth state and PKCE `code_verifier` in an encrypted, short-lived cookie with `HttpOnly`, `SameSite=Lax`, and `Secure` attributes (or Redis/DB session store). Eliminate in-memory dictionaries.
- **Secure Token Delivery**: Callback delivers JWT via secure `HttpOnly` session cookie or short-lived exchange ticket. **Never pass tokens in URL query strings or hash fragments**.
- **No `localStorage`**: Frontend must maintain token in memory or via `HttpOnly` cookies to protect against token theft via XSS.
- **JWT Safeguards**: Enforce non-default, strong secrets in production. Validate `exp`, `iat`, `sub`. Return generic HTTP 401 error payloads.

---

### 4.3. Persistent Storage, File Safety & Transactional Atomicity
- **Persistent Volume / Object Storage**: Ensure `transcript_storage.py` writes to a persistent volume or object store (S3-compatible) so files survive container redeployments.
- **Streaming Size Enforcement**: Stream file uploads in chunks, checking accumulated size against `MAX_TRANSCRIPT_FILE_SIZE_BYTES` (25MB) before writing fully to disk.
- **MIME & Magic Byte Verification**: Verify actual file headers in addition to file extension.
- **Atomic Cleanup**: Clean up temporary and uploaded files if database insertion or parsing fails. Never leave orphaned files on disk or database records pointing to non-existent storage paths.
- **Private Access**: Storage paths are private. Downloads are served exclusively through authorized streaming routes after verifying meeting membership.

---

### 4.4. Realistic Transcript Validation Policy
- **Format-Specific**: Timestamp checking and cue verification apply strictly to subtitle formats (`.srt`, `.vtt`). Do not reject plain text (`.txt`, `.md`) transcripts for lacking timestamps or speaker labels.
- **Configurable Word Count**: Minimum word count uses `TRANSCRIPT_MIN_WORD_COUNT` from configuration.
- **Soft Speaker Matching**: Speaker mismatches against Google Calendar attendees generate **warnings** (`participant_mismatch: warning`), not transcript rejection.
- **Rejection Criteria**: Reserved exclusively for corrupted, unreadable, zero-cue, or empty files.

---

### 4.5. Database Migration & Persistence Testing Standard
- **Migration Verification**: Test the new migration (`add_notes_and_transcripts`) bidirectionally:
  - `alembic upgrade head`
  - `alembic downgrade -1`
  - `alembic upgrade head`
- **Data Migration**: Migrate existing Phase 1 participant records with `role == "organizer"` to `role == "agenda_owner"`.
- **Integrity Testing**:
  - Verify foreign key cascades (deleting a meeting cascades to notes and transcripts).
  - Verify indexes on `meeting_notes.meeting_id` and `transcripts(meeting_id, created_at)`.
  - Test transactional rollback: simulate database failure during transcript upload and verify file cleanup.
  - Test calendar sync edge cases: missing organizer in Google attendees array, manual role preservation during incremental sync, attendee removals, and organizer transfers.

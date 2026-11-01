# MeetSync — Complete System Architecture & Technical Specification

## 1. System Overview

MeetSync is an enterprise meeting intelligence and synchronization platform. It connects with Google Calendar, maintains per-meeting workspaces, enforces role-governed collaboration, manages structured notes with interactive action items, parses and deterministically validates meeting transcripts, and provides contextual cross-meeting intelligence search.

The platform is designed around three architectural pillars:
- **Per-Meeting Scoped Roles (Non-Global RBAC):** Access privileges are evaluated dynamically per meeting. A user has no blanket administrative authority across the platform; their capabilities depend entirely on their assignment in the specific meeting being accessed.
- **Zero-Trust Client Session Security:** All session authentication relies on stateless HTTP-only cookies containing signed JSON Web Tokens (JWT). Client-side code never stores credentials or tokens in browser LocalStorage or SessionStorage, completely mitigating XSS token-theft vectors.
- **Auditable Hybrid Storage:** Metadata, relational links, notes, and transcript validation reports are persisted in a relational PostgreSQL database, while raw Google Calendar payloads are archived on disk under a date-indexed directory structure with a centralized JSON catalog.

---

## 2. Technology Stack & Component Structure

### Backend
- **Language & Runtime:** Python 3.12+
- **API Framework:** FastAPI (Asynchronous ASGI application)
- **Database ORM:** SQLAlchemy 2.0 with type-safe mapped columns and declarative models
- **Database Engine & Driver:** PostgreSQL with the `psycopg` (v3) binary driver
- **Schema Validation & Serialization:** Pydantic v2
- **Cryptographic Utilities:** Fernet symmetric encryption (`cryptography` library) for tokens at rest; custom HMAC-SHA256 implementation for stateless application JWTs
- **Third-Party Integrations:** Google APIs Client Library, Google OAuth 2.0 Flow with PKCE, Google Calendar v3 API

### Frontend
- **Framework & Bundler:** React 19 with Vite
- **Routing:** React Router DOM (v6/v7) with protected route guards and dynamic URL query synchronization
- **Server State & Caching:** TanStack React Query (v5) with optimistic updates, rollback triggers, and automatic query cache invalidation
- **Styling:** Tailwind CSS with utility-first classes, dark mode support, and custom surface/content design tokens
- **Component Primitives:** Custom accessible UI components (Modals, Cards, Badges, Buttons, Inputs, Toasts) powered by `lucide-react` icons

### Infrastructure & Workers
- **Background Watch Scheduler:** Asyncio lifespan task running every 3,600 seconds to renew Google Calendar push notification watch channels prior to their expiration.
- **Push Notification Receiver:** Webhook endpoint processing real-time Google Calendar change signals.

---

## 3. End-to-End Authentication & Session Lifecycle

MeetSync uses Google OAuth 2.0 with Proof Key for Code Exchange (PKCE) to authenticate users and request read-only calendar access.

### Step 1: Login Initialization (`GET /api/auth/google/login`)
1. When a user clicks "Sign in with Google", the frontend triggers this endpoint.
2. The backend instantiates a Google OAuth Flow configured with the client ID, client secret, and scopes (`openid`, `userinfo.email`, `userinfo.profile`, and `calendar.readonly`).
3. The flow generates a PKCE `code_verifier` and an authorization URL.
4. The backend builds a state payload containing:
   - The raw OAuth state string
   - The generated PKCE `code_verifier`
   - A creation timestamp
5. This payload is encrypted into an opaque string using Fernet symmetric encryption.
6. The backend sets an `HttpOnly`, `SameSite=Lax` cookie named `meetsync_oauth_state` with a 10-minute lifetime and returns the Google authorization URL to the client.

### Step 2: Google Consent & Redirect (`GET /api/auth/google/callback`)
1. Google redirects the user's browser back to the callback endpoint with an authorization `code` and the `state` parameter.
2. **Three-Layer State Verification:** To prevent state-loss across server restarts or domain switches, the backend validates the state using three sequential strategies:
   - *Strategy 1:* Decrypt the incoming `state` query parameter directly using Fernet and verify it has not exceeded the 10-minute maximum age.
   - *Strategy 2:* Decrypt the `meetsync_oauth_state` cookie and compare its contents with the state parameter.
   - *Strategy 3:* Inspect an in-memory fallback cache.
3. Once validated, the `code_verifier` is extracted from the decrypted state.
4. The backend exchanges the authorization `code` and `code_verifier` with Google's token endpoint to receive access and refresh tokens.
5. The backend requests the user profile from Google's `userinfo` endpoint (retrieving `id`, `email`, `name`, and `picture`).

### Step 3: User Provisioning & Account Linking
1. The backend invokes `get_or_create_user()`:
   - If a user with the Google `sub` exists, their profile details (name, picture, email) are updated.
   - If not, a new `User` record is created.
2. **Retroactive Entity Linking (`_link_user_to_existing_records`):**
   - When meetings were previously synced from Google Calendar, attendees may have been inserted as `meeting_participants` with an email address but no `user_id` (since they had not yet logged in).
   - Upon first login, MeetSync automatically queries all `meeting_participants` and `meetings` matching the user's email where `user_id` or `organizer_user_id` is null, and populates them with the newly provisioned user's ID.
3. The user's Google refresh token is encrypted via Fernet and saved in the `google_credentials` table.

### Step 4: Session Issuance & Cookie Delivery
1. The backend creates an application JWT signed with `JWT_SECRET_KEY` via HMAC-SHA256. The token payload contains:
   - `sub`: User UUID string
   - `email`: User email address
   - `name`: User full name
   - `exp`: Expiration timestamp (default: 24 hours / 1,440 minutes)
   - `iat`: Issuance timestamp
2. If the request was a direct browser navigation (detected via `Accept: text/html`), the backend issues an HTTP 302 redirect to the frontend application URL (`/`).
3. Alongside the response, the backend:
   - Clears the temporary `meetsync_oauth_state` cookie.
   - Writes the application JWT into an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie named `meetsync_session`.

### Step 5: Session Extraction & Authorization
1. On all subsequent API calls, the browser automatically transmits the `meetsync_session` cookie.
2. The `get_current_user` dependency intercepts the request, verifies the JWT signature and expiration, extracts the user ID, queries the database for the active user, and injects the `User` object into the route handler.
3. On logout (`POST /api/auth/logout`), the `meetsync_session` cookie is explicitly cleared with an expired timestamp.

---

## 4. Per-Meeting Role-Based Access Control (RBAC) System

### 4.1. Core Philosophy
Roles in MeetSync are **scoped strictly per meeting**. There is no platform-wide "admin" or "global note taker" concept. A user's privileges are determined entirely by their relationship to the specific meeting ID requested in the API route.

### 4.2. The Role Definitions
1. **Agenda Owner (`agenda_owner`)**
   - *Assigned To:* The meeting organizer or event creator.
   - *Capabilities:* Full administrative control over the meeting workspace. Can add participants to upcoming or ongoing meetings. Can designate or change the Note Taker. Can designate or change the Personal Assistant. Can view all notes, action items, and transcripts.
   - *Restrictions:* Cannot write notes directly (note authoring is dedicated to the Note Taker). Cannot upload transcripts. Cannot reassign or demote themselves via the role assignment endpoint.
2. **Note Taker (`note_taker`)**
   - *Assigned To:* A single participant designated by the Agenda Owner.
   - *Capabilities:* Exclusive authoring authority. Can create collaborative notes for the meeting. Can edit and delete their own notes. Can manage and toggle action items inside notes. Can upload and validate audio/text transcript files.
   - *Restrictions:* Cannot alter participant roles. Cannot modify notes authored by other users. Exactly one Note Taker is permitted per meeting.
3. **Personal Assistant (`personal_assistant`)**
   - *Assigned To:* A participant designated by the Agenda Owner for coordination and intelligence tracking.
   - *Capabilities:* Granted access to the cross-meeting intelligence search (`GET /api/meetings/search`) and the historical meeting archive (`GET /api/meetings/past`). Inside the meeting, has full read-only visibility into notes, action items, attendee rosters, and transcripts.
   - *Restrictions:* Read-only within the meeting workspace. Cannot author notes, edit action items, upload transcripts, or modify roles. Exactly one Personal Assistant is permitted per meeting.
4. **Participant (`participant`)**
   - *Assigned To:* Default role for all invited attendees.
   - *Capabilities:* Read-only access to meeting details, confirmed attendee rosters, published notes, action item statuses, and accepted transcripts.
   - *Restrictions:* Cannot author notes, upload files, or manage workspace configurations.
5. **Non-Member (External User)**
   - *Definition:* Any authenticated user who is neither the organizer nor an attendee of the meeting.
   - *Enforcement:* Returns HTTP `403 Forbidden` on every meeting-specific route. No meeting metadata, participant names, notes, or transcripts are ever exposed to non-members.

### 4.3. Role Assignment Mechanics & Validations
When an Agenda Owner assigns or changes roles via `PATCH /api/meetings/{meeting_id}/participants/{participant_id}/role`:

1. **Authorization Check:** The endpoint uses `require_meeting_roles(["agenda_owner"])` to verify that the caller is the meeting's Agenda Owner.
2. **Target Protection Check:** The system verifies that the target participant is not currently an Agenda Owner or organizer. An Agenda Owner cannot be reassigned or demoted through this route.
3. **MeetSync Registration Verification:**
   - If assigning a privileged role (`note_taker` or `personal_assistant`), the system verifies that the participant has an active account on MeetSync (`user_id` is not null or their email matches an existing record in the `users` table).
   - If the user has not registered on MeetSync, the request is rejected with `400 Bad Request`. Unregistered attendees cannot hold active responsibility roles because they cannot log in to execute them.
4. **Single-Holder Exclusivity:**
   - If a participant is being assigned as `note_taker`, the database automatically queries any existing participant in that meeting who currently holds `note_taker` and demotes them to `participant`.
   - The same exclusivity rule applies when assigning `personal_assistant`.
   - This guarantees that no meeting ever has conflicting Note Takers or multiple Personal Assistants.
5. **Audit Logging & Response:** The participant's role is updated in the database, committed, refreshed, and logged. The updated record is returned with an `is_registered` boolean flag.

### 4.4. Adding Participants to a Meeting (`POST /api/meetings/{meeting_id}/participants`)
The Agenda Owner can invite new participants directly to a meeting subject to strict validations:

1. **Agenda Owner Authority:** Only the Agenda Owner can add participants.
2. **Meeting Status & Timing Check:**
   - The meeting must not be marked as `cancelled`.
   - The meeting must be either **upcoming** (`start_time > now`) or **ongoing** (`start_time <= now <= end_time`).
   - If the meeting has already concluded or expired, the request is rejected with `400 Bad Request`. Historical or expired meetings cannot have attendees added retroactively.
3. **Duplicate Prevention:**
   - The email is checked case-insensitively against existing participants for that meeting. If the attendee is already listed, the request returns `409 Conflict`.
4. **Registered User Restriction:**
   - The email must exist in the `users` table. If the invitee has never logged into MeetSync, the request returns `404 Not Found` with an explicit message that only registered MeetSync users can be added.
5. **Participant Creation:**
   - The record is inserted into `meeting_participants` linked to the registered user's ID, with the specified role (`participant`, `note_taker`, or `personal_assistant`), and a default `response_status` of `accepted`.

### 4.5. Displaying Registration Flags on the Frontend
- The participant roster endpoint (`GET /api/meetings/{id}/participants`) and the consolidated meeting details endpoint (`GET /api/meetings/{id}/details`) evaluate whether each attendee has a linked `user_id`.
- If an attendee was synced from a Google Calendar invite but has never logged into MeetSync, their record returns `is_registered: false`.
- On the user interface, such attendees display a visible badge: `⚠️ Not registered on MeetSync`.
- In the role assignment dialog, unregistered attendees are flagged and disabled from being selected as Note Taker or Personal Assistant.

---

## 5. Transcript Ingestion, Parsing, and Validation Engine

The transcript subsystem handles ingestion, parsing, multi-stage heuristic validation, and extraction of plain text for indexing.

### 5.1. Ingestion Restrictions & Pre-Checks (`POST /api/meetings/{meeting_id}/transcripts`)
1. **Role Enforcement:** Uploading transcripts is strictly restricted to the meeting's designated `note_taker` via `require_meeting_roles(["note_taker"])`.
2. **Streaming Size Limit Enforcement:**
   - The file is streamed to temporary disk storage in chunks of 1MB.
   - If the cumulative size exceeds `MAX_TRANSCRIPT_FILE_SIZE_BYTES` (25MB default), the upload is immediately aborted with `413 Request Entity Too Large` and the partial file is purged.
3. **Allowed File Formats:**
   - Supported extensions: `.vtt` (WebVTT), `.srt` (SubRip Subtitle), `.json` (Structured JSON Transcripts), `.txt` / `.md` (Plain Text).
   - Any unsupported extension is rejected with `400 Bad Request`.

### 5.2. Multi-Format Parsing Architecture (`transcript_parser.py`)
Each file format is parsed into a normalized internal dictionary:
- `text`: Full concatenated conversation text.
- `cues`: Array of timestamped dialogue cues with `start`, `end`, `speaker`, and `text`.
- `speakers`: Sorted list of distinct speaker label strings extracted from the file.
- `word_count`: Total count of words across the transcript.
- `cue_count`: Total count of parsed timing segments.

Parsing rules per format:
- **WebVTT (`.vtt`):** Extracts timing lines matching the `HH:MM:SS.mmm --> HH:MM:SS.mmm` regex. Supports `<v Speaker Name>` voice tags as well as `Speaker: Text` prefixes. Converts timestamps to seconds.
- **SubRip (`.srt`):** Parses standard numeric cue counters, comma-delimited timestamp intervals (`00:00:10,500 --> 00:00:15,000`), and speaker prefixes formatted as `Speaker:` or `[Speaker]`.
- **JSON (`.json`):** Detects structured transcript payloads from major conferencing platforms (Google Meet, Zoom, Whisper outputs). Automatically searches for root keys such as `segments`, `cues`, `transcript`, or `messages`. Extracts start/end seconds, speaker names, and speech content.
- **Plain Text (`.txt` / `.md`):** Extracts dialogue by regex-matching speaker headers at the start of lines (e.g. `John Doe: Hello everyone`). Words are tokenized via regex word boundaries.

### 5.3. Deterministic Four-Stage Validation Engine (`transcript_validator.py`)
Once parsed, the transcript is evaluated against deterministic business rules to assign one of three validation states:
- `ACCEPTED`: The transcript is valid, structurally sound, and matches meeting criteria.
- `NEEDS_REVIEW`: The transcript is usable but exhibits potential anomalies (short length, timestamp discrepancies, or unverified speaker names).
- `REJECTED`: The transcript is empty, unreadable, or missing timing cues in subtitle formats.

#### Stage 1: Minimum Word Count Check
- If `word_count == 0`: The transcript is immediately marked `REJECTED` with the warning: *"The transcript file is empty or contains no readable text."*
- If `word_count < TRANSCRIPT_MIN_WORD_COUNT` (default: 25 words): The status is downgraded to `NEEDS_REVIEW` with a warning that the content falls below the recommended length.

#### Stage 2: Subtitle Format Cue Verification
- For `.vtt` and `.srt` files, if `len(cues) == 0`: The transcript is marked `REJECTED` with the warning: *"Subtitle format contains no valid timestamp cues."*
- Timestamp continuity check: If any cue has `start_time > end_time`, a warning is logged, `timestamp_match` is set to false, and the status becomes `NEEDS_REVIEW`.

#### Stage 3: Transcript Duration vs. Meeting Duration Span Check
- The system extracts the maximum `end` timestamp across all parsed cues.
- The scheduled meeting duration is calculated: `meeting_duration_sec = (meeting.end_time - meeting.start_time).total_seconds()`.
- If the transcript cue duration exceeds three times the scheduled meeting duration (for example, a 5-hour audio transcript uploaded to a 30-minute meeting), a warning is appended: *"Transcript duration significantly exceeds meeting scheduled duration"*, and the status is downgraded to `NEEDS_REVIEW`.

#### Stage 4: Soft Attendee Speaker Matching (Non-Blocking)
- The validator extracts all speaker strings detected in the transcript.
- It builds a set of known attendee tokens from the meeting's participant roster: email addresses, email prefixes (username before the `@`), and first/last name tokens from user profiles.
- Each detected speaker is checked for partial or substring matches against the known token set.
- Any speaker not matching the roster is collected under `unmatched_speakers`.
- **Non-blocking Rule:** Speaker mismatches are treated as informative warnings and do not invalidate the transcript, recognizing that automated speech-to-text systems frequently introduce phonetic variations. If unmatched speakers are detected, `participant_mismatch` is set to true, an explanatory warning is attached, and an `ACCEPTED` status is downgraded to `NEEDS_REVIEW`.

### 5.4. Storage and Data Representation
- The original file is stored under `storage/transcripts/{meeting_id}/{transcript_id}_{filename}`.
- Metadata, the full validation report dictionary, validation status (`ACCEPTED`, `NEEDS_REVIEW`, `REJECTED`), and extracted text content are saved to the `transcripts` table.
- Plain text can be retrieved independently via `GET /api/meetings/{id}/transcripts/{tid}/text` to keep list requests lightweight.
- The original uploaded file can be downloaded via `GET /api/meetings/{id}/transcripts/{tid}/file`.

---

## 6. Collaborative Notes & Action Items Subsystem

Meeting documentation is managed through structured notes and interactive action items:

### 6.1. Note Authoring Permissions
- **Creation:** Only the meeting's designated `note_taker` can author notes via `POST /api/meetings/{meeting_id}/notes`.
- **Modification & Deletion:** The Note Taker can update (`PATCH`) or delete (`DELETE`) notes they authored. If another user attempts to modify the note, the API returns `403 Forbidden`.
- **Viewing:** All confirmed meeting members (`agenda_owner`, `note_taker`, `personal_assistant`, `participant`) have full read access to published notes.

### 6.2. Action Item Data Schema
Action items are stored directly within the `meeting_notes` record inside a PostgreSQL `JSONB` array:
- `description`: Text string describing the task (1 to 500 characters).
- `assignee_email`: Optional email address of the attendee responsible for the action item.
- `is_completed`: Boolean flag indicating completion state (defaults to `false`).
- `due_date`: Optional ISO date-time string indicating when the task must be completed.

When a note is fetched, action items are validated and returned as structured sub-schemas, enabling client-side checklist toggling and completion tracking.

---

## 7. Google Calendar Synchronization & Storage Architecture

### 7.1. Synchronization Flow
1. **Incremental Sync Token Tracking:**
   - Each synchronized calendar has a record in `calendar_syncs`.
   - MeetSync queries the Google Calendar API using the stored `sync_token`. Google returns only events modified, created, or cancelled since that token was generated.
   - Upon successful synchronization, the new `nextSyncToken` from Google is committed to the database.
2. **Handling Event Cancellations:**
   - If Google flags an event with `status: "cancelled"`, MeetSync finds the corresponding `Meeting` entity and transitions its status to `cancelled`.
3. **Handling Active Events:**
   - Unique meetings are identified by combining their Google `iCalUID` and `start_time`.
   - The system creates or updates the `Meeting` record, records meeting web links (`meet_url`), and synchronizes the organizer.
4. **Preservation of Manual Role Assignments:**
   - When synchronizing attendees, MeetSync checks whether existing attendees have already been designated as `note_taker` or `personal_assistant`.
   - Automatic sync operations **never overwrite** manually assigned specialized roles back to `participant`.
5. **Push Notification Webhooks:**
   - Google push notifications arrive at `POST /api/webhooks/google-calendar`.
   - Handshake calls (`X-Goog-Resource-State: sync`) return HTTP 200 immediately.
   - Change notification calls (`X-Goog-Resource-State: exists`) match the `X-Goog-Channel-ID` to the calendar and dispatch synchronization.

### 7.2. Raw Event Storage Organization
Raw Google Calendar event payloads are saved to disk for offline resilience and auditing. The storage structure in `backend/storage/google_events/` is organized as follows:

```
storage/google_events/
├── index.json                  # Central catalog index of all stored meetings
├── README.md                   # Storage guide
├── YYYY-MM/                    # Organized by Year-Month (e.g., 2026-10/)
│   └── YYYY-MM-DD_[Clean_Title]_[short_id].json
└── [google_event_id].json      # Direct event ID alias for database link compatibility
```

Key storage behaviors:
- **Date-Indexed Hierarchy:** Files are placed into month subfolders (`YYYY-MM/`) and prefixed with their scheduled date (`YYYY-MM-DD_Title_id.json`), making files human-readable and sortable.
- **Central Index (`index.json`):** A dictionary mapping `google_event_id` to meeting title, scheduled date, status, organizer, and relative file path.
- **Backward Compatible Aliases:** A copy of the payload is also saved directly as `[google_event_id].json` in the root storage directory, ensuring existing database foreign paths remain unbroken.
- **Health Diagnostic Endpoint:** Visiting `GET /api/health/storage` returns a real-time report detailing storage directory health, write permissions, total file count, and cataloged meetings.

---

## 8. Cross-Meeting Search & Intelligence Subsystem

The cross-meeting search engine (`GET /api/meetings/search`) and past meeting archive (`GET /api/meetings/past`) allow searching across all meetings where the user has participation history:

1. **Authority Gate:**
   - Cross-meeting searching is strictly restricted to users holding the `personal_assistant` role in at least one meeting (`require_personal_assistant_user`).
   - If an unprivileged user accesses the route, the system rejects the call with `403 Forbidden`.
2. **Authorized Scope:**
   - A Personal Assistant can only search meetings where they are a registered attendee or organizer. They cannot search meetings across outside organizations or uninvited teams.
3. **Multi-Entity Text Search:**
   - Queries are evaluated case-insensitively across meeting titles (`meetings.title`), note titles and contents (`meeting_notes.title`, `meeting_notes.content`), and uploaded transcript texts (`transcripts.content_text`).
4. **Keyword Snippet Extraction:**
   - For every match found in notes or transcripts, the search engine extracts a text window of 80 characters preceding and following the search term.
   - Search terms within snippets are highlighted on the frontend.
5. **Filtering Capabilities:**
   - Filter by date range (`start_date`, `end_date`).
   - Filter by participant role (`agenda_owner`, `note_taker`, `personal_assistant`, `participant`).
   - Full pagination support (`page`, `limit`).

---

## 9. Complete API Endpoint Reference Matrix

| Category | Method | Path | Required Role / Dependency | Description |
| :--- | :---: | :--- | :--- | :--- |
| **Authentication** | `GET` | `/api/auth/google/login` | Public | Generates Google PKCE authorization URL and sets state cookie. |
| | `GET` | `/api/auth/google/callback` | Public | Validates state, exchanges tokens, provisions user, issues session cookie. |
| | `GET` | `/api/auth/me` | Authenticated User | Retrieves current user profile from JWT session. |
| | `POST` | `/api/auth/logout` | Authenticated User | Clears session cookies and invalidates client state. |
| **Calendars** | `POST` | `/api/calendars/sync` | Authenticated User | Triggers incremental sync of user calendars and events. |
| | `POST` | `/api/calendars/watch/{id}` | Authenticated User | Registers a Google Calendar push notification watch channel. |
| | `POST` | `/api/calendars/stop-watch/{id}` | Authenticated User | Cancels an active Google Calendar push notification watch. |
| | `GET` | `/api/calendars/status/{id}` | Authenticated User | Retrieves synchronization status and error state. |
| **Webhooks** | `POST` | `/api/webhooks/google-calendar` | Google Webhook | Receives push notifications from Google Calendar and dispatches sync. |
| **Meetings** | `GET` | `/api/meetings` | Authenticated User | Lists meetings where user is organizer or participant. |
| | `GET` | `/api/meetings/{id}` | Meeting Member | Retrieves summary metadata for a single meeting. |
| | `GET` | `/api/meetings/{id}/details` | Meeting Member | Returns consolidated view (participants, notes, transcripts, user role). |
| | `GET` | `/api/meetings/{id}/participants` | Meeting Member | Lists meeting attendees with registration status flags. |
| | `POST` | `/api/meetings/{id}/participants` | `agenda_owner` | Adds a participant (upcoming/ongoing meetings, registered users only). |
| | `PATCH` | `/api/meetings/{id}/participants/{pid}/role` | `agenda_owner` | Reassigns role (`note_taker`, `personal_assistant`, `participant`). |
| **Search & Archive** | `GET` | `/api/meetings/search` | `personal_assistant` | Cross-meeting text search with snippet extraction and filters. |
| | `GET` | `/api/meetings/past` | `personal_assistant` | Paginated archive of concluded meetings for Personal Assistants. |
| **Notes** | `GET` | `/api/meetings/{id}/notes` | Meeting Member | Lists all published collaborative notes for the meeting. |
| | `POST` | `/api/meetings/{id}/notes` | `note_taker` | Creates a new note with action items. |
| | `GET` | `/api/meetings/{id}/notes/{nid}` | Meeting Member | Retrieves a single note. |
| | `PATCH` | `/api/meetings/{id}/notes/{nid}` | `note_taker` (Author) | Updates an existing note and its action items checklist. |
| | `DELETE` | `/api/meetings/{id}/notes/{nid}` | `note_taker` (Author) | Deletes a note. |
| **Transcripts** | `GET` | `/api/meetings/{id}/transcripts` | Meeting Member | Lists transcript metadata, format, size, and validation status. |
| | `POST` | `/api/meetings/{id}/transcripts` | `note_taker` | Uploads transcript (.vtt/.srt/.json/.txt, max 25MB) for validation. |
| | `GET` | `/api/meetings/{id}/transcripts/{tid}` | Meeting Member | Retrieves detailed validation report for a single transcript. |
| | `GET` | `/api/meetings/{id}/transcripts/{tid}/text` | Meeting Member | Retrieves full extracted transcript plain text. |
| | `GET` | `/api/meetings/{id}/transcripts/{tid}/file` | Meeting Member | Streams the original uploaded transcript file for download. |
| **System Diagnostics** | `GET` | `/api/health` | Public | Service health probe. |
| | `GET` | `/api/health/db` | Public | Database connection check. |
| | `GET` | `/api/health/storage` | Public | Returns local JSON storage status, file counts, and catalog index. |
| | `POST` | `/api/health/storage/organize` | Public | Re-organizes flat legacy JSON event files into date subfolders. |


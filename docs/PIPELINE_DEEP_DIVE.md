# MeetSync — In-Depth Feature Pipelines & Decision Architecture

This document provides a comprehensive, production-grade reference for every feature pipeline in **MeetSync**. For each pipeline, it details:
1. **Pipeline Overview & Purpose**
2. **End-to-End Data Movement & Schema Flow** (Inputs → Transformations → Persistence → Outputs)
3. **Decision Architecture & Rationale** (On what specific criteria decisions, branching, fallbacks, and validations are made)
4. **Failure Modes & Exception Handling**
5. **Code & File References**

---

## Table of Contents

1. [Authentication Pipeline](#1-authentication-pipeline)
2. [Authorization & RBAC Pipeline](#2-authorization--rbac-pipeline)
3. [Calendar Sync Pipeline](#3-calendar-sync-pipeline)
4. [Real-Time Webhook / Push Notification Pipeline](#4-real-time-webhook--push-notification-pipeline)
5. [Watch Renewal Background Pipeline](#5-watch-renewal-background-pipeline)
6. [Transcript Upload & Processing Pipeline](#6-transcript-upload--processing-pipeline)
7. [Cross-Entity Search Pipeline](#7-cross-entity-search-pipeline)
8. [Meeting Notes CRUD Pipeline](#8-meeting-notes-crud-pipeline)
9. [Meeting & Participant Role Management Pipeline](#9-meeting--participant-role-management-pipeline)
10. [Frontend API Client & State Sync Pipeline](#10-frontend-api-client--state-sync-pipeline)
11. [Cross-Pipeline Data Flow Matrix](#11-cross-pipeline-data-flow-matrix)

---

## 1. Authentication Pipeline

### 1.1 Overview & Purpose
The Authentication Pipeline handles Google OAuth 2.0 with PKCE (Proof Key for Code Exchange), provisions user accounts, links orphaned meeting participants, securely encrypts OAuth refresh credentials, and issues dual-mode JWT authentication sessions (HttpOnly session cookies for browser clients and Bearer tokens for API/mobile clients).

### 1.2 Data Movement Flow

```
[User Browser]
      │
      │ 1. GET /api/auth/google/login
      ▼
[FastAPI: auth.py (google_login)]
      │ ──> Generates Google Flow (PKCE verifier + raw_state)
      │ ──> Packages {raw_state, verifier, created_at}
      │ ──> Fernet-encrypts package into `encrypted_state`
      │ ──> Caches in `in_memory_oauth_states`
      │ ──> Sets HttpOnly Cookie: `meetsync_oauth_state` = encrypted_state
      ▼
[User redirected to Google Consent Screen]
      │
      │ 2. User consents; Google redirects to callback with ?code=...&state=...
      ▼
[FastAPI: auth.py (google_callback)]
      │
      ├── 3-Tier State & PKCE Verifier Resolution:
      │     Strategy 1: Decrypt state query param
      │     Strategy 2: Decrypt meetsync_oauth_state cookie
      │     Strategy 3: In-memory dictionary fallback
      │
      ├── 3. Token Exchange:
      │     Google Token Endpoint: POST code + code_verifier -> access_token + refresh_token
      │
      ├── 4. User Info Retrieval:
      │     GET https://www.googleapis.com/oauth2/v2/userinfo -> {id (google_sub), email, name, picture}
      │
      ├── 5. User Provisioning (auth_service.py: get_or_create_user):
      │     Lookup User by google_sub -> If missing, lookup by email -> Else create User
      │     Link existing MeetingParticipant records matching email to new User.id
      │
      ├── 6. Credential Encryption & Persistence (auth_service.py: save_google_credential):
      │     Fernet.encrypt(refresh_token) -> Upsert into GoogleCredential table
      │
      ├── 7. Session Issuance:
      │     create_access_token({"sub": str(user.id), "email": user.email, "name": user.name})
      │     Check Request Headers: 'Accept: text/html'?
      │       ├─ Yes (Browser) -> 302 Redirect to Frontend URL + Set HttpOnly `meetsync_session` cookie
      │       └─ No (API/JSON) -> Return JSON {access_token, token_type: "bearer", user} + Set cookie
      ▼
[User Dashboard / Client App]
```

### 1.3 Decision Architecture: Basis for Decisions

| Decision Point | Decision Taken | Rationale & Basis |
| :--- | :--- | :--- |
| **PKCE Usage** | Embed and enforce PKCE `code_verifier` on Authorization Code flow | Prevents authorization code injection and interception attacks, even for server-rendered flows. |
| **State Encryption with Fernet** | Symmetric encryption (AES-128-CBC + HMAC-SHA256) of `{raw_state, verifier, created_at}` inside the OAuth `state` parameter | Allows stateless verification across multi-worker Uvicorn processes and server restarts without requiring a shared Redis instance. |
| **3-Tier State Fallback** | Try: (1) Query Param Decryption → (2) Cookie Decryption → (3) In-Memory Lookup | Addresses real-world OAuth edge cases: URL character replacement (`+` vs `%20` vs space), cross-origin cookie drops during redirect from `accounts.google.com`, and localhost vs 127.0.0.1 domain mismatches. |
| **State Expiration Window** | Reject any state older than `OAUTH_STATE_MAX_AGE_SECONDS` (default: 600s / 10 mins) | Bounds replay attack windows and discards abandoned browser login tabs. |
| **User Identity Resolution** | Match primary by `google_sub` (immutable Google ID); secondary fallback by `email` | Google accounts can change primary email addresses, but `google_sub` never changes. Fallback by email ensures accounts invited prior to login can link seamlessly. |
| **Orphan Participant Linking** | `UPDATE meeting_participants SET user_id = :uid WHERE email = :email AND user_id IS NULL` | Before a user signs up, they may have been invited to meetings synced by colleagues. When they sign up, all historical meeting participations immediately link to their profile. |
| **Refresh Token Encryption** | Fernet encryption before DB insert (`GoogleCredential.encrypted_refresh_token`) | Protects offline Google API access tokens against database dump exfiltration. Plaintext tokens never hit disk. |
| **Dual-Mode Response** | If `Accept: text/html` is in headers, issue 302 Redirect with cookie; otherwise return JSON | Seamless browser UX (direct browser OAuth redirect lands on frontend dashboard with active cookie) while remaining testable via Swagger UI and API clients. |

---

## 2. Authorization & RBAC Pipeline

### 2.1 Overview & Purpose
MeetSync uses a localized, context-driven Role-Based Access Control (RBAC) model. Unlike global roles (Admin/User), permissions in MeetSync are evaluated **per meeting**. The pipeline extracts the authenticated caller, resolves their relationship to the target meeting, and validates their specific operational authority.

### 2.2 Data Movement Flow

```
[Incoming Request] (e.g., PATCH /api/meetings/{id}/participants/{pid}/role)
      │
      │ 1. Header: Authorization: Bearer <JWT> OR Cookie: meetsync_session=<JWT>
      ▼
[FastAPI Dependency: get_current_user]
      │ ──> Extract token string
      │ ──> JWT decode (HS256) using settings.SECRET_KEY
      │ ──> Validate expiry (`exp`), extract user ID (`sub`)
      │ ──> Query DB: SELECT * FROM users WHERE id = :sub
      ▼
[FastAPI Dependency: get_meeting_role(meeting_id, current_user)]
      │
      ├── Check 1: Organizer Identity
      │     Is meeting.organizer_user_id == user.id OR meeting.organizer_email == user.email?
      │     ──> YES: Role = "agenda_owner"
      │
      ├── Check 2: Participant Record
      │     Query DB: MeetingParticipant WHERE meeting_id = :id AND (user_id = :uid OR email = :email)
      │     ──> Found:
      │           If participant.role == "organizer" -> "agenda_owner"
      │           Else -> participant.role (e.g., "note_taker", "personal_assistant", "participant")
      │     ──> Not Found: Role = "none"
      ▼
[Gate Enforcement: require_meeting_member / require_meeting_roles(allowed_roles)]
      │
      ├── Role == "none" ──> 403 Forbidden ("You are not a participant in this meeting")
      ├── Role NOT IN allowed_roles ──> 403 Forbidden ("Operation requires one of [...]")
      └── Role IN allowed_roles ──> Passes tuple (Meeting, role) to endpoint handler
```

### 2.3 Meeting Roles & Authority Hierarchy

```
       ┌─────────────────────────────────────────────────────────────┐
       │                       AGENDA OWNER                          │
       │  • Full meeting control                                     │
       │  • Assign/reassign participant roles                        │
       │  • Read notes, search, view transcripts                     │
       └──────────────┬───────────────────────────────┬──────────────┘
                      │                               │
                      ▼                               ▼
       ┌───────────────────────────────┐  ┌───────────────────────────┐
       │          NOTE TAKER           │  │    PERSONAL ASSISTANT     │
       │  • Upload/manage transcripts  │  │  • Read-only access       │
       │  • Create meeting notes       │  │  • Future automation hook │
       │  • Edit/delete OWN notes      │  │                           │
       └──────────────┬────────────────┘  └───────────┬───────────────┘
                      │                               │
                      └───────────────┬───────────────┘
                                      ▼
                       ┌───────────────────────────────┐
                       │          PARTICIPANT          │
                       │  • Read meeting details       │
                       │  • Read meeting notes         │
                       │  • Search within meeting      │
                       └───────────────────────────────┘
```

### 2.4 Decision Architecture: Basis for Decisions

| Decision Point | Decision Taken | Rationale & Basis |
| :--- | :--- | :--- |
| **Organizer Mapping** | Map Google `organizer` status directly to `agenda_owner` | Google Calendar identifies who scheduled the event. In MeetSync, the organizer naturally commands agenda ownership and delegation authority. |
| **Case-Insensitive Email Matching** | `MeetingParticipant.email.ilike(user.email)` or `user.email.lower()` | Email RFCs treat domains as case-insensitive, and users frequently enter mixed casing. Prevents authorization lockouts due to capitalization mismatches. |
| **Fine-Grained Role Check vs Global Admin** | Roles are evaluated strictly per `meeting_id` | An executive may be an `agenda_owner` in Strategy Sync, but a simple `participant` in an All-Hands meeting. Global roles cannot model collaborative meeting hierarchies. |
| **Author-Only Note Editing** | Even if a user has the `note_taker` role, they can only edit/delete notes where `note.author_user_id == current_user.id` | Prevents a co-note-taker or newly assigned note-taker from overwriting or deleting another member's structured meeting minutes. |
| **Agenda Owner Demotion Guard** | Reassign endpoint explicitly rejects updating participants with `role in ("agenda_owner", "organizer")` | Prevents accidental or malicious removal of the meeting organizer's administrative ownership over their own meeting. |

---

## 3. Calendar Sync Pipeline

### 3.1 Overview & Purpose
The Calendar Sync Pipeline synchronizes external Google Calendars with MeetSync. It supports full initial synchronization and high-performance incremental syncs using Google Sync Tokens, deduplicates shared meetings across multiple users, tracks per-calendar event sources, archives raw payloads, and synchronizes participant rosters while preserving assigned MeetSync roles.

### 3.2 Data Movement Flow

```
[Trigger: Manual Button (UI) OR Webhook Event]
      │
      │ calendar_id (MeetSync UUID)
      ▼
[meeting_sync_service.py: sync_calendar_meetings]
      │
      ├── 1. Credential Acquisition:
      │     User -> GoogleCredential -> Decrypt refresh_token -> Refresh access_token
      │
      ├── 2. Incremental Google Event Fetch:
      │     google_calendar_service.list_calendar_events(sync_token=sync_state.sync_token)
      │     (If sync_token expired/invalid: clear token and perform full resync)
      │
      └── 3. Event Loop for each Google Event:
            │
            ├── Check: Event Type Filter (`is_meeting_event`)
            │     Is all-day? Is reminder/task? Has no attendees and no conferenceData?
            │     ──> YES & not cancelled: SKIP EVENT (Noise reduction)
            │
            ├── Check: Status == "cancelled"?
            │     ├─ Lookup Meeting via `MeetingSource` (calendar_id + google_event_id)
            │     │    OR fallback to `Meeting` (google_ical_uid + start_time)
            │     ├─ meeting.status = "cancelled"
            │     └─ Archive raw cancelled event JSON to disk
            │
            ├── Normal Event Processing:
            │     ├─ Parse: google_event_parser.py -> Extract normalized dict
            │     ├─ Raw Archive: raw_event_storage.py -> Save raw JSON to storage/raw_events/{year}/{month}/...
            │     │
            │     ├─ Canonical Meeting Deduplication:
            │     │    Lookup by (google_ical_uid, start_time)
            │     │    ├─ Exists -> update_meeting(...)
            │     │    └─ Missing -> create_meeting(...)
            │     │
            │     ├─ Source Mapping (`MeetingSource`):
            │     │    Lookup/Upsert (calendar_id, google_event_id) -> link to canonical Meeting.id
            │     │
            │     └─ Participant Roster Sync:
            │          For each attendee in Google event:
            │            ├─ Lookup user by email
            │            ├─ Check existing MeetingParticipant
            │            │    ├─ Exists:
            │            │    │    If role IN ("note_taker", "personal_assistant") & not organizer:
            │            │    │        PRESERVE EXISTING ROLE (Do not overwrite with Google default!)
            │            │    │    Else if is_organizer: role = "agenda_owner"
            │            │    │    Else: role = "participant"
            │            │    │    Update response_status (accepted/declined/tentative)
            │            │    └─ New:
            │            │         Create participant with "agenda_owner" (if org) or "participant"
            │            └─ Guarantee organizer participant record exists even if Google omitted it
            │
      ├── 4. State Persistence:
      │     Save next_sync_token, set sync_status="success", last_synced_at=UTC now
      ▼
[DB Commit & Completion]
```

### 3.3 Decision Architecture: Basis for Decisions

| Decision Point | Decision Taken | Rationale & Basis |
| :--- | :--- | :--- |
| **Meeting Identity Key** | Composite key: `(google_ical_uid, start_time)` | Google Calendar assigns the same `iCalUID` to recurring series instances, but distinct `start_time` stamps. Furthermore, multiple colleagues invited to the same meeting have different per-user `event_id`s but identical `iCalUID`s. This composite key merges multi-attendee events into one canonical meeting. |
| **Separation of `Meeting` vs `MeetingSource`** | 1:N relationship between `Meeting` and `MeetingSource` | When User A and User B are both in MeetSync and attend the same meeting, User A has Google Event ID `xyz_A` and User B has `xyz_B`. Storing `MeetingSource` records allows each user's sync to update their own calendar connection without duplicating the central meeting. |
| **Filtering Non-Meeting Events** | Discard events where `is_meeting_event()` returns false (all-day holidays, personal reminders) | Calendar clutter pollutes meeting intelligence. Focuses database records on genuine collaborative sessions. |
| **Role Preservation on Resync** | If `participant.role in ("note_taker", "personal_assistant")`, do not reset to `participant` | Google Calendar API only knows "attendee" vs "organizer". If a MeetSync user assigned Jane as `note_taker`, subsequent calendar background syncs must not demote Jane back to default attendee. |
| **Sync Token Invalidation Recovery** | If Google returns HTTP 410 Gone (invalid sync token), clear token and re-run full sync | Standard Google Calendar sync protocol. Sync tokens expire after roughly 7 days of inactivity or massive changes; graceful fallback prevents permanently stuck sync channels. |
| **Raw Event File Archival** | Save raw Google payload JSON to disk: `storage/raw_events/{YYYY}/{MM}/{event_id}.json` | Provides auditability, debug capability for proprietary Google recurrence rules, and future-proofs data without bloating PostgreSQL JSON columns. |

---

## 4. Real-Time Webhook / Push Notification Pipeline

### 4.1 Overview & Purpose
Instead of expensive periodic polling, Google Calendar Push Notifications alert MeetSync of calendar modifications in real-time. The Webhook Pipeline securely validates notifications, performs Google handshake verification, and unblocks Google's HTTP connection instantly by offloading the sync to an asynchronous background worker.

### 4.2 Data Movement Flow

```
[Google Calendar Push Server]
      │
      │ POST /api/webhooks/google-calendar
      │ Headers:
      │   X-Goog-Channel-ID: <uuid-channel-id>
      │   X-Goog-Resource-ID: <google-resource-id>
      │   X-Goog-Resource-State: "sync" | "exists"
      ▼
[FastAPI: webhook.py (google_calendar_webhook)]
      │
      ├── 1. Header Validation:
      │     Are X-Goog-Channel-ID, Resource-ID, and Resource-State present?
      │     ──> NO: Return 400 Bad Request
      │
      ├── 2. Handshake Verification (`sync` state):
      │     If X-Goog-Resource-State == "sync":
      │       Log handshake confirmation; Return 200 OK immediately
      │
      ├── 3. Database Channel Matching:
      │     Query DB: CalendarSync WHERE channel_id = :header_channel_id
      │     ──> Not found: Return 404 (or ignore stale Google notification)
      │     ──> Validate: Does db_sync.resource_id == header_resource_id?
      │           ──> NO: Return 403 Forbidden (Spoofed channel attempt)
      │
      ├── 4. Async Worker Offloading:
      │     FastAPI `background_tasks.add_task(
      │         _process_calendar_notification,
      │         calendar_id=sync_state.calendar_id,
      │         user_id=calendar.user_id,
      │     )`
      │
      ├── 5. Immediate Response:
      │     Return 200 OK {"status": "accepted"} to Google (Total latency < 20ms)
      ▼
[Google Push Server receives 200 OK (Connection Closed)]

... In Asynchronous BackgroundTask (_process_calendar_notification) ...
      │
      ├── Open fresh isolated DB Session (`SessionLocal()`)
      ├── Execute `sync_calendar_meetings(db, calendar, sync_state.sync_token)`
      ├── Close DB Session
      ▼
[Database Updated with New/Updated/Cancelled Meetings]
```

### 4.3 Decision Architecture: Basis for Decisions

| Decision Point | Decision Taken | Rationale & Basis |
| :--- | :--- | :--- |
| **Instant 200 OK via BackgroundTask** | Acknowledge Google push notifications in < 20ms before running sync | Google Calendar webhook dispatchers timeout aggressively (typically 5–10s). If the endpoint blocks during sync, Google retries with exponential backoff, causing cascading thundering herd loads. |
| **Resource-ID Cross-Check** | Reject requests where `header_resource_id != sync_state.resource_id` with 403 | Channel IDs could theoretically be guessed or forged. Google guarantees the combination of `channel_id` and secret `resource_id` is unique and unforgeable. |
| **Handling Handshake (`sync`)** | Intercept `X-Goog-Resource-State: sync` and exit without triggering sync | Google sends an initial test notification upon watch creation to verify the endpoint is alive. Triggering a full calendar sync on handshake is redundant. |
| **Isolated Session per Background Worker** | Worker function instantiates its own `SessionLocal()` and closes it in a `finally:` block | FastAPI request sessions (`get_db`) are closed when the HTTP response completes. Background tasks executing after response transmission must have their own independent database lifecycle to avoid "Session is closed" errors. |

---

## 5. Watch Renewal Background Pipeline

### 5.1 Overview & Purpose
Google Calendar push watch subscriptions expire after a maximum lifetime (typically 7 days). To maintain uninterrupted real-time sync, the Watch Renewal Pipeline runs an automated background scheduler that detects channels nearing expiration, provisions fresh subscriptions, and safely decommissions aging channels.

### 5.2 Data Movement Flow

```
[FastAPI Lifespan Startup]
      │
      ▼
[watch_renewal.py: watch_renewal_scheduler_task]
      │
      │ Runs infinite async loop: sleep(GOOGLE_WATCH_RENEWAL_INTERVAL_SECONDS = 3600s)
      ▼
[Thread Pool Execution: asyncio.to_thread(run_watch_renewal_cycle)]
      │
      ├── 1. Query Expiring Subscriptions:
      │     SELECT * FROM calendar_syncs
      │     WHERE channel_expiration <= NOW() + INTERVAL '24 HOURS'
      │       AND channel_id IS NOT NULL;
      │
      └── 2. For each expiring channel:
            │
            ├── Call `register_calendar_watch`:
            │     Step A: Call Google API `watch()` -> Get new channel_id & resource_id
            │     Step B: ATOMICALLY UPDATE DB with new channel_id & expiration
            │             (CRITICAL: sync_token is preserved completely intact!)
            │     Step C: Call Google API `stop()` on the OLD channel_id
            │             (Wrapped in try/except; failure to stop old channel is non-fatal)
            │
      ├── 3. Metrics Compilation:
      │     Collect counts: `renewed`, `recovered`, `failed`
      │     Log operational telemetry
      ▼
[Sleep until next hourly cycle]
```

### 5.3 Decision Architecture: Basis for Decisions

| Decision Point | Decision Taken | Rationale & Basis |
| :--- | :--- | :--- |
| **Renewal Buffer Window** | Renew when expiration is within 24 hours (`GOOGLE_WATCH_RENEWAL_BUFFER_HOURS = 24`) | Provides a 24-hour safety margin against transient Google API outages, network partitions, or worker downtimes. |
| **Create-New -> Persist -> Stop-Old Order** | Never stop the existing channel until the new channel is confirmed and saved in DB | If we stopped the old channel first and Google rejected the new watch request, the calendar would be left without push notifications. The safe ordering ensures zero notification downtime. |
| **Sync Token Preservation** | Update `channel_id`, `resource_id`, and `channel_expiration` while leaving `sync_token` untouched | Channel identity and sync state are orthogonal. Preserving the sync token prevents expensive and unnecessary full resyncs upon channel renewal. |
| **Non-Fatal Stop-Old Teardown** | Wrap `stop_calendar_watch` in a try/except block | If the old channel has already expired on Google's end, the stop call returns 404/400. This should not abort the renewal transaction. |
| **`asyncio.to_thread` Offloading** | Run synchronous database queries and Google HTTP calls inside a worker thread | Prevents blocking the FastAPI async event loop, ensuring live user requests are never delayed by renewal cycles. |

---

## 6. Transcript Upload & Processing Pipeline

### 6.1 Overview & Purpose
The Transcript Pipeline ingests meeting transcripts in multiple file formats (`.txt`, `.pdf`, `.docx`, `.vtt`, `.srt`), extracts text and timestamp cues, executes deterministic rule-based validation against meeting metadata, and saves structured records for downstream note generation and search.

### 6.2 Data Movement Flow

```
[Note Taker Client]
      │
      │ POST /api/meetings/{id}/transcripts (multipart/form-data: file)
      ▼
[FastAPI: transcripts.py (upload_transcript)]
      │
      ├── 1. Permission Gate:
      │     require_meeting_roles(["note_taker"]) ──> Reject if not Note Taker
      │
      ├── 2. Streaming Disk Storage (transcript_storage.py):
      │     Chunked read (64KB buffer) -> Enforce MAX_FILE_SIZE (50MB)
      │     Write to: storage/transcripts/{meeting_id}_{timestamp}_{filename}
      │
      ├── 3. Format-Specific Parsing (transcript_parser.py):
      │     Detect extension:
      │       ├─ .txt: Direct UTF-8 decode
      │       ├─ .pdf: pypdf / pdfplumber extraction
      │       ├─ .docx: python-docx paragraph traversal
      │       ├─ .vtt: webvtt-py / regex cue parser (extracts start, end, speaker, text)
      │       └─ .srt: pysrt parser (extracts start, end, text)
      │     Output: {text, word_count, cues: [{start, end, speaker, text}], speakers: [...]}
      │
      ├── 4. Deterministic Validation (transcript_validator.py):
      │     Check A: Word Count == 0? ──> REJECTED
      │     Check B: Word Count < MIN_THRESHOLD (50 words)? ──> Warning (NEEDS_REVIEW)
      │     Check C: Subtitle cues present? Start > End? ──> Warning (NEEDS_REVIEW)
      │     Check D: Transcript max cue timestamp > 3x meeting duration? ──> Warning
      │     Check E: Speaker Token Matching:
      │               Compare detected speaker strings vs meeting participant names/emails
      │               Unmatched speakers? ──> Non-blocking Warning (NEEDS_REVIEW)
      │     Output: Validation Report (status: ACCEPTED | NEEDS_REVIEW | REJECTED)
      │
      ├── 5. Entity Persistence:
      │     INSERT INTO transcripts (
      │       meeting_id, file_path, original_filename, file_size,
      │       content_text, validation_status, validation_report, word_count, ...
      │     )
      │
      └── Exception Handler / Rollback:
            If parsing or DB fails: `delete_transcript_file(saved_path)` (Clean orphan files)
      ▼
[Return TranscriptResponse to Client]
```

### 6.3 Decision Architecture: Basis for Decisions

| Decision Point | Decision Taken | Rationale & Basis |
| :--- | :--- | :--- |
| **Role Restriction** | Restricted exclusively to `note_taker` | Maintains administrative integrity over source-of-truth meeting records. |
| **Streaming File Read** | Read uploaded files in 64KB chunks rather than `await file.read()` into RAM | Prevents memory denial-of-service (OOM) attacks when multiple users upload large audio-generated transcript files simultaneously. |
| **Soft Participant Mismatch (Never Reject)** | Unmatched speakers generate a warning and set status to `NEEDS_REVIEW`, but NEVER reject the upload | AI transcription tools (Whisper, Otter, Zoom) frequently misspell names or use generic labels like "Speaker 1", "John", or phonetic variants. Hard-blocking uploads would cause severe user frustration. |
| **Timestamp Continuity Check** | Verify `start <= end` and check if max timestamp exceeds scheduled duration by > 3x | Catches corrupt subtitle files or scenarios where a user uploaded a recording from a completely different 4-hour workshop into a 15-minute sync. |
| **Orphan Cleanup on Error** | `finally:` or `except:` block triggers `delete_transcript_file()` if DB insert fails | Prevents unreferenced, dead files from accumulating on the host filesystem when transactions fail. |

---

## 7. Cross-Entity Search Pipeline

### 7.1 Overview & Purpose
The Search Pipeline provides unified, scoped search across all meeting metadata, notes, and uploaded transcripts. It enforces strict data isolation so users can never search or view meeting content for meetings they did not participate in.

### 7.2 Data Movement Flow

```
[Client Application]
      │
      │ GET /api/search/meetings?q=budget&start_date=2026-01-01&role=note_taker&page=1&limit=10
      ▼
[FastAPI: search.py (search_meetings)]
      │
      ▼
[search_service.py: search_meetings_for_user]
      │
      ├── 1. Base Tenant Scoping Subquery:
      │     Find all meeting_ids where:
      │       - User is organizer (organizer_user_id == user.id OR organizer_email == user.email)
      │       OR
      │       - User is in MeetingParticipant (user_id == user.id OR email == user.email)
      │
      ├── 2. Temporal Bounding:
      │     Apply filters: Meeting.start_time >= start_date AND Meeting.start_time <= end_date
      │
      ├── 3. Relational Text Matching (ILIKE Subqueries):
      │     If query `q` provided:
      │       Subquery A: MeetingNote IDs where title ILIKE %q% OR content ILIKE %q%
      │       Subquery B: Transcript IDs where filename ILIKE %q% OR content_text ILIKE %q%
      │       Filter: Meeting.title ILIKE %q% OR Meeting.id IN (Subquery A) OR Meeting.id IN (Subquery B)
      │
      ├── 4. In-Memory Role Evaluation:
      │     For each matching meeting:
      │       Evaluate `get_meeting_role(m.id, user)`
      │       If search filter `role` specified and user's role != filter: Skip
      │
      ├── 5. Pagination:
      │     Slice filtered list: `offset = (page - 1) * limit`
      │
      └── 6. Snippet Extraction Engine (`_extract_snippets`):
            For meetings in the target page:
              - Search Meeting Title -> Add "Title: ..."
              - Search MeetingNotes -> Extract regex match with 80-character boundary window
              - Search Transcripts -> Extract regex match with 80-character boundary window
              - Compute matching counts (`matching_notes_count`, `matching_transcripts_count`)
      ▼
[Return MeetingSearchResponse with Paginated Results & Snippets]
```

### 7.3 Decision Architecture: Basis for Decisions

| Decision Point | Decision Taken | Rationale & Basis |
| :--- | :--- | :--- |
| **Pre-Scoping via SQL Subquery** | Base query enforces participation before text matching | Security & privacy guarantee: prevents information leakage via search index across different organizational teams. |
| **Cross-Entity Relational Search** | Search across Meeting title, Note title/content, and Transcript text in a single query | Users often remember *what* was discussed ("Q3 budget") rather than *where* it was written (in a note vs spoken in a transcript). |
| **80-Character Regex Context Window** | `_extract_snippets` returns `...{prefix 80 chars}[Match]{suffix 80 chars}...` | Delivers immediate context to the UI search results page without transmitting entire multi-megabyte transcripts over the wire. |
| **In-Memory Role Check Post-Filter** | Resolve roles using `get_meeting_role` after base query | The user's role in a meeting is a computed property combining organizer rules and participant overrides. Running the standard role resolver guarantees exact RBAC consistency. |

---

## 8. Meeting Notes CRUD Pipeline

### 8.1 Overview & Purpose
The Meeting Notes Pipeline governs the structured authoring of meeting minutes, decisions, and action items. It enforces role requirements on creation and author-ownership on modifications.

### 8.2 Data Movement Flow

```
[Note Taker / Member Client]
      │
      ├── POST /api/meetings/{id}/notes  ──> require_meeting_roles(["note_taker"])
      │     ├─ Validate input schema (title, content, action_items: [{description, assignee, due_date}])
      │     ├─ Set note.author_user_id = current_user.id
      │     └─ INSERT INTO meeting_notes
      │
      ├── GET /api/meetings/{id}/notes   ──> require_meeting_member
      │     └─ SELECT * FROM meeting_notes WHERE meeting_id = :id ORDER BY created_at DESC
      │
      ├── PATCH /api/meetings/{id}/notes/{nid} ──> require_meeting_roles(["note_taker"])
      │     ├─ Fetch note by (nid, meeting_id)
      │     ├─ Authorization Check: note.author_user_id == current_user.id?
      │     │    ├─ NO: 403 Forbidden ("Only the note's author can edit this note")
      │     │    └─ YES: Update title, content, action_items
      │     └─ Return updated note
      │
      └── DELETE /api/meetings/{id}/notes/{nid} ──> require_meeting_roles(["note_taker"])
            ├─ Authorization Check: note.author_user_id == current_user.id?
            │    ├─ NO: 403 Forbidden ("Only the note's author can delete this note")
            │    └─ YES: DELETE FROM meeting_notes
            └─ Return 200 {"message": "Note deleted successfully"}
```

### 8.3 Decision Architecture: Basis for Decisions

| Decision Point | Decision Taken | Rationale & Basis |
| :--- | :--- | :--- |
| **Dual Layer Authorization** | Layer 1: Must hold `note_taker` role in meeting; Layer 2: Must be the original author (`author_user_id`) | Role check ensures general competence to manage notes, while author check guarantees accountability and prevents colleagues from altering each other's recorded action items. |
| **Structured Action Items** | Stored as JSON/JSONB with schema validation (`description`, `assignee`, `due_date`) | Allows future automation (calendar reminders, task exports) while preserving easy rendering on the frontend. |
| **Read Access for All Members** | Listing and viewing notes requires only `require_meeting_member` | Transparency: all participants in a meeting have a legitimate need to inspect meeting minutes and action items. |

---

## 9. Meeting & Participant Role Management Pipeline

### 9.1 Overview & Purpose
This pipeline enables Agenda Owners to organize meeting participants and delegate responsibilities (such as assigning a Note Taker or Personal Assistant).

### 9.2 Data Movement Flow

```
[Agenda Owner Client]
      │
      │ PATCH /api/meetings/{meeting_id}/participants/{participant_id}/role
      │ Body: {"role": "note_taker"}
      ▼
[FastAPI: meetings.py (update_meeting_participant_role)]
      │
      ├── 1. Role Gate:
      │     require_meeting_roles(["agenda_owner"]) ──> 403 if caller is not Agenda Owner
      │
      ├── 2. Target Lookup:
      │     Query DB: MeetingParticipant WHERE id = :participant_id AND meeting_id = :meeting_id
      │     ──> Not found: 404 Not Found
      │
      ├── 3. Agenda Owner Demotion Protection:
      │     Is target_participant.role in ("agenda_owner", "organizer")?
      │     ──> YES: 400 Bad Request ("Cannot reassign the role of the Agenda Owner")
      │
      ├── 4. Role Update:
      │     target_participant.role = body.role ("note_taker" | "personal_assistant" | "participant")
      │     DB Commit & Refresh
      ▼
[Return ParticipantResponse with updated role]
```

### 9.3 Decision Architecture: Basis for Decisions

| Decision Point | Decision Taken | Rationale & Basis |
| :--- | :--- | :--- |
| **Owner Exclusivity** | Only `agenda_owner` can change roles | Role delegation is a managerial decision. Regular attendees cannot designate themselves as note-takers or personal assistants. |
| **Demotion Protection** | Cannot alter the role of an `agenda_owner` | Protects the meeting hierarchy from becoming orphaned without an agenda owner. |
| **Automatic Role Injection on Meeting List** | `GET /api/meetings` dynamically computes and embeds `user_role` into each returned meeting | Avoids N+1 roundtrips from the frontend: the UI dashboard immediately knows whether to show "Upload Transcript" or "Assign Roles" buttons on each meeting card. |

---

## 10. Frontend API Client & State Sync Pipeline

### 10.1 Overview & Purpose
The Frontend Pipeline handles network transport, authentication header injection, centralized session expiration detection, and optimistic state synchronization between React components and backend REST endpoints.

### 10.2 Data Movement Flow

```
[React UI Component] (e.g., NoteEditor, CalendarView, SearchBar)
      │
      │ Calls domain service: meetingsApi.getParticipants(meetingId)
      ▼
[src/api/http.js: Central Axios Instance]
      │
      ├── Request Interceptor:
      │     - Read token from localStorage / auth state
      │     - If token exists: attach `Authorization: Bearer <token>`
      │     - Include `withCredentials: true` (ensures meetsync_session cookie is sent)
      │     - Transmit HTTP request to backend
      ▼
[Backend FastAPI Processing]
      │
      ▼
[src/api/http.js: Response Interceptor]
      │
      ├── Check Status:
      │     ├─ 200..299: Return response.data to caller
      │     └─ 401 Unauthorized:
      │          - Clear local session cache
      │          - Dispatch session expiration event
      │          - Redirect user to `/login`
      ▼
[React Component updates state & re-renders]
```

### 10.3 Decision Architecture: Basis for Decisions

| Decision Point | Decision Taken | Rationale & Basis |
| :--- | :--- | :--- |
| **Dual Header + Cookie Support** | Axios config sets `withCredentials: true` and conditionally attaches `Bearer` header | Allows seamless operation across diverse deployment environments (same-origin cookie proxying or cross-origin API deployments). |
| **Global 401 Interception** | Intercept 401 responses centrally in Axios response handler | Prevents individual UI components from having to duplicate session-expiry handling logic. |
| **Modular Domain APIs** | Split into `auth.js`, `meetings.js`, `notes.js`, `transcripts.js`, `search.js` | Enforces single-responsibility architecture on the frontend matching the backend route boundaries. |

---

## 11. Cross-Pipeline Data Flow Matrix

| Pipeline | Primary Data Source | Core Data Entity Modified | Output / Destination | Critical Invariant Enforced |
| :--- | :--- | :--- | :--- | :--- |
| **1. Authentication** | Google OAuth API | `User`, `GoogleCredential`, `MeetingParticipant` | JWT Token + HttpOnly Cookie | Refresh tokens must be Fernet-encrypted; PKCE state validated. |
| **2. Authorization** | JWT Session / DB | None (Read & Gate) | Route Execution or 403 Forbidden | Permissions resolved per-meeting, not globally. |
| **3. Calendar Sync** | Google Calendar API | `Meeting`, `MeetingSource`, `MeetingParticipant`, `CalendarSync` | Local Postgres DB + Raw JSON on Disk | Deduplication via `(ical_uid, start_time)`; manual roles preserved. |
| **4. Webhook** | Google Push Headers | `CalendarSync` (Background sync triggered) | Async Worker Queue + 200 OK Response | Response must return in < 20ms; resource-id verified. |
| **5. Watch Renewal** | DB Expiration Query | `CalendarSync` | Google Watch API + DB Update | Create-New before Stop-Old; sync_token untouched. |
| **6. Transcript Upload** | Note Taker Multipart File | `Transcript` + Storage File | Extracted Text + Validation Report in DB | `note_taker` role required; soft speaker matching (non-blocking). |
| **7. Search** | User Search Query | None (Read & Filter) | Filtered Results + 80-char Context Snippets | Strict tenant isolation: user must be participant or organizer. |
| **8. Meeting Notes** | Note Taker JSON Form | `MeetingNote` | Stored Note + Structured Action Items | Author-only edit/delete; `note_taker` role required to create. |
| **9. Role Management**| Agenda Owner Request | `MeetingParticipant` | Updated Participant Role | Agenda Owner cannot be demoted; only Agenda Owner can assign. |
| **10. Frontend Client**| User UI Interaction | Browser LocalStorage / Memory State | Backend REST Endpoints | Unified Bearer + Cookie transport; centralized 401 handling. |

---

*Document compiled and verified against the MeetSync production codebase.*

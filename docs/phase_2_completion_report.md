# MeetSync — Phase 2 Project Completion Report

## Executive Summary

Phase 2 of the MeetSync platform has been successfully completed. This phase focused on delivering an enterprise-grade security foundation, dynamic per-meeting Role-Based Access Control (RBAC), collaborative note authoring with interactive action item tracking, deterministic transcript ingestion and heuristic validation, and a dedicated cross-meeting intelligence search engine for Personal Assistants.

### Phase 2 Core Objectives Achieved
1. **Secure Authentication:** Implemented Google OAuth 2.0 with Proof Key for Code Exchange (PKCE), symmetrical Fernet token encryption at rest, and zero-trust stateless JWT session management utilizing `HttpOnly` browser cookies.
2. **Per-Meeting Role-Based Access Control:** Engineered a dynamic authorization model distinguishing between Agenda Owner, Note Taker, Personal Assistant, and Participant on a per-meeting basis, protected by FastAPI dependencies.
3. **Agenda Owner Governance:** Delivered dedicated workflows for assigning Note Takers and Personal Assistants, enforcing single-holder exclusivity, restricting assignments to registered MeetSync users, and gating participant additions to upcoming or ongoing meetings.
4. **Note Taker Capabilities (Notes & Transcripts):** Enabled designated Note Takers to author collaborative notes with interactive checklist action items, and ingest meeting transcripts (`.vtt`, `.srt`, `.json`, `.txt`) backed by a deterministic four-stage validation engine.
5. **Personal Assistant Intelligence & Archive:** Built cross-meeting keyword search and past meeting archive exploration with contextual snippet extraction, exclusively accessible to authorized Personal Assistants.

---

## 1. Secure Authentication & Session Architecture

### Technical Implementation Details
- **OAuth 2.0 PKCE Flow:** MeetSync authenticates users using Google OAuth 2.0 with Proof Key for Code Exchange (`code_verifier` and `code_challenge`). This prevents authorization code interception and cross-site injection attacks.
- **Three-Layer State Resolution:** The authorization state string contains an encrypted JSON payload containing the PKCE verifier, creation timestamp, and random entropy. State validation is evaluated through three fallback strategies (encrypted state parameter, encrypted cookie, and an in-memory cache), ensuring resilience across multi-worker setups, restarts, and domain switches.
- **Symmetric Encryption at Rest:** Google refresh tokens are encrypted using Fernet symmetric encryption (`cryptography` library) before being written to PostgreSQL (`google_credentials.encrypted_refresh_token`). Keys are managed via the environment configuration (`TOKEN_ENCRYPTION_KEY`).
- **Zero-Trust Cookie-Based Sessions:** Upon successful OAuth exchange, MeetSync generates an HMAC-SHA256 JWT containing the user's UUID, email, and name. This token is written into a strict `HttpOnly`, `SameSite=Lax`, `Path=/` cookie named `meetsync_session`. Client-side code never stores JWTs in `localStorage` or `sessionStorage`, eliminating exposure to Cross-Site Scripting (XSS).
- **Retroactive Entity Linking:** When new users log in for the first time, `_link_user_to_existing_records()` scans the database for historical meetings and participant records where their email was present from Google Calendar syncs and automatically links their newly minted `user_id`.
- **Secure Termination:** The logout endpoint (`POST /api/auth/logout`) explicitly expires both the `meetsync_session` and `meetsync_oauth_state` cookies across all browser paths.

---

## 2. Dynamic Per-Meeting Role-Based Access Control (RBAC)

### Scoping Architecture
In MeetSync, **roles are strictly per-meeting, never platform-wide**. A single user simultaneously holds different privileges across different meetings:
- Agenda Owner in their team sync
- Note Taker in a technical architecture session
- Personal Assistant in an executive board review
- Participant in a company all-hands

### Backend Dependency Guardrails
Every incoming request is verified using specialized FastAPI dependencies:
- `get_current_user`: Extracts, validates, and decodes the JWT from the `HttpOnly` session cookie and fetches the active `User` record.
- `require_meeting_member`: Asserts that the authenticated user is an active participant or the organizer of the requested meeting. Non-members are rejected immediately with HTTP `403 Forbidden`.
- `require_meeting_roles(allowed_roles)`: Factory dependency asserting that the user's evaluated role in the specified meeting belongs to the authorized role list (e.g., `["agenda_owner"]` or `["note_taker"]`).
- `require_personal_assistant_user`: Asserts that the user holds the `personal_assistant` role in at least one meeting across their entire meeting portfolio.

### The Role Capabilities Matrix

| Capability / Action | Agenda Owner | Note Taker | Personal Assistant | Participant | Non-Member |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **View Agenda, Details & Attendees** | Yes | Yes | Yes | Yes | ❌ 403 Forbidden |
| **Assign Note Taker / Personal Assistant** | **Yes (Exclusive)** | No | No | No | ❌ 403 Forbidden |
| **Add Participants to Meeting** | **Yes (Exclusive)** | No | No | No | ❌ 403 Forbidden |
| **Create Meeting Notes** | No | **Yes (Exclusive)** | No | No | ❌ 403 Forbidden |
| **Edit / Delete Own Notes** | No | **Yes** | No | No | ❌ 403 Forbidden |
| **Toggle Action Item Status** | No | **Yes** | No | No | ❌ 403 Forbidden |
| **Upload Transcripts (.vtt, .srt, .json, .txt)** | No | **Yes (Exclusive)** | No | No | ❌ 403 Forbidden |
| **View Notes & Transcript Text** | Yes | Yes | Yes | Yes | ❌ 403 Forbidden |
| **Download Original Transcript File** | Yes | Yes | Yes | Yes | ❌ 403 Forbidden |
| **Cross-Meeting Search & Past Archive** | Restricted | Restricted | **Yes (Exclusive)** | Restricted | ❌ 403 Forbidden |

---

## 3. Agenda Owner Governance & Role Assignment Workflows

### Dedicated Role Assignment Modals
Instead of inline dropdowns, the frontend provides dedicated dialogs initiated by the Agenda Owner:
- **"Assign Note Taker" Action**
- **"Assign Personal Assistant" Action**
- **"Add Participant" Action**

### Validations Enforced on Role Changes (`PATCH /api/meetings/{id}/participants/{pid}/role`)
1. **Agenda Owner Authority:** Only the Agenda Owner can reassign roles.
2. **Owner Immutability:** An Agenda Owner cannot demote themselves or be reassigned through the participant role API.
3. **Registered User Requirement:** A participant can only be assigned as Note Taker or Personal Assistant if they have an active account on MeetSync (`user_id` is populated or their email exists in the `users` table). Unregistered attendees are blocked with HTTP `400 Bad Request` because they cannot sign in to fulfill their duties.
4. **Single-Holder Exclusivity:** Each meeting is constrained to strictly **one Note Taker** and **one Personal Assistant**. When a new attendee is assigned either role, the backend automatically locates any existing holder of that role in the meeting and demotes them to `participant`.
5. **Attendee Registration Flags:** Attendees synced from Google Calendar who have not yet logged in display a visual warning badge: `⚠️ Not registered on MeetSync` in both the participant roster and the assignment modal.

### Validations Enforced on Participant Addition (`POST /api/meetings/{id}/participants`)
1. **Meeting Status & Timing Restrictions:** Participants can only be added to **upcoming** (`start_time > now`) or **ongoing** (`start_time <= now <= end_time`) meetings. Adding participants to expired or cancelled meetings is rejected with HTTP `400 Bad Request`.
2. **Duplicate Prevention:** Case-insensitive email comparison ensures an attendee cannot be added more than once (`409 Conflict`).
3. **Existing MeetSync User Requirement:** Only users who already have an account on MeetSync can be added as participants (`404 Not Found` if the email is not registered).

---

## 4. Note Taker Capabilities: Notes & Action Items Subsystem

### Collaborative Notes Management (`/api/meetings/{meeting_id}/notes`)
- **Exclusive Note Creation:** Dedicated exclusively to the meeting's designated Note Taker (`POST`). Notes require a title (1 to 255 characters) and textual content.
- **Author Ownership Enforcement:** The Note Taker can update (`PATCH`) or delete (`DELETE`) notes that they authored. Modifying notes authored by another account is blocked with HTTP `403 Forbidden`.
- **Interactive Action Items:** Action items are stored within a PostgreSQL `JSONB` array in each note record:
  - `description`: Text string (1 to 500 characters).
  - `assignee_email`: Optional email address of the responsible attendee.
  - `is_completed`: Boolean toggle state.
  - `due_date`: Optional ISO date-time string.
- **Roster Visibility:** All confirmed meeting attendees have read access to published notes and action item statuses.

---

## 5. Note Taker Capabilities: Transcript Ingestion & Validation Engine

### Ingestion Controls (`POST /api/meetings/{meeting_id}/transcripts`)
- **Authorized Uploader:** Uploading is strictly restricted to the meeting's Note Taker via `require_meeting_roles(["note_taker"])`.
- **Streaming Size Enforcement:** The file is streamed to temporary disk storage in 1MB chunks. If the cumulative size exceeds 25MB (`MAX_TRANSCRIPT_FILE_SIZE_BYTES`), the upload is terminated with HTTP `413 Request Entity Too Large` and the partial file is purged.
- **Supported Formats:** `.vtt` (WebVTT), `.srt` (SubRip Subtitle), `.json` (Platform Transcript JSON), and `.txt` / `.md` (Plain Text).

### Multi-Format Parsing Subsystem (`transcript_parser.py`)
- **WebVTT Parser:** Regex-parses `HH:MM:SS.mmm --> HH:MM:SS.mmm` cues, `<v Speaker>` tags, and converts cue intervals into floating-point seconds.
- **SRT Parser:** Parses numeric cue indices, comma-delimited timestamp intervals (`00:00:10,500 --> 00:00:15,000`), and extracts speaker prefixes (`Speaker:` or `[Speaker]`).
- **Structured JSON Parser:** Ingests outputs from major transcription services (Google Meet, Whisper, Zoom). Automatically detects keys: `segments`, `cues`, `transcript`, or `messages`.
- **Plain Text Parser:** Tokenizes words and extracts speaker labels from line-start patterns.

### Deterministic Four-Stage Heuristic Validator (`transcript_validator.py`)
Each uploaded transcript is evaluated deterministically and assigned a status: `ACCEPTED`, `NEEDS_REVIEW`, or `REJECTED`:
1. **Minimum Word Count Check:**
   - Empty files (`word_count == 0`) are immediately `REJECTED`.
   - Files below 25 words (`TRANSCRIPT_MIN_WORD_COUNT`) are marked `NEEDS_REVIEW` with an informative warning.
2. **Subtitle Cue Verification:**
   - `.vtt` and `.srt` files lacking valid timestamp cues are `REJECTED`.
   - Any cues where `start_time > end_time` set `timestamp_match: false` and downgrade the status to `NEEDS_REVIEW`.
3. **Duration Comparison vs. Meeting Span:**
   - Compares the maximum cue end time against scheduled meeting duration (`end_time - start_time`).
   - If transcript duration exceeds 3x scheduled meeting time, `timestamp_match: false` is set with an explanatory warning (`NEEDS_REVIEW`).
4. **Soft Speaker Matching (Non-Blocking):**
   - Detected speaker names are compared against known attendee tokens (emails, local parts, user profile names).
   - Unmatched speakers generate an informative warning and set `participant_mismatch: true` (`NEEDS_REVIEW`). This accommodates automated speech-to-text phonetic variations without rejecting the file.

### Separation of Data Delivery
- Metadata and validation reports are returned in list responses (`GET /api/meetings/{id}/transcripts`).
- Plain text is delivered on-demand via `GET /api/meetings/{id}/transcripts/{tid}/text` to keep payload sizes small.
- Original files can be downloaded directly via `GET /api/meetings/{id}/transcripts/{tid}/file`.

---

## 6. Personal Assistant Capabilities: Search & Archive Subsystem

### Cross-Meeting Intelligence Search (`GET /api/meetings/search`)
- **Exclusive Authority:** Access is restricted exclusively to users holding the `personal_assistant` role in at least one meeting (`require_personal_assistant_user`).
- **Authorized Scope:** Search is strictly scoped to meetings where the user is an authorized member or organizer.
- **Multi-Entity Indexing:** Searches case-insensitively across:
  - Meeting titles (`meetings.title`)
  - Note titles and contents (`meeting_notes.title`, `meeting_notes.content`)
  - Extracted transcript dialogue (`transcripts.content_text`)
- **Snippet Extraction:** Generates contextual snippet windows of 80 characters preceding and following matching keywords.
- **Rich Filtering & Pagination:** Supports keyword queries (`q`), date ranges (`start_date`, `end_date`), role filtering (`role`), and pagination (`page`, `limit`).

### Historical Meeting Archive (`GET /api/meetings/past`)
- Dedicated archive view returning past concluded meetings for Personal Assistants.
- Fully integrated with the frontend Assistant Page (`/assistant`) featuring tabbed navigation between "Past Meetings" and "Search All Meetings", debounced query inputs, and keyword snippet highlighting.

---

## 7. Deliverables & Verification Summary

### Backend Deliverables
- `app/api/routes/auth.py`: Google OAuth 2.0 PKCE, session issuance, user profile, logout.
- `app/api/routes/meetings.py`: Participant listing, role assignment with exclusivity, participant addition with timing and registration validations.
- `app/api/routes/notes.py`: Complete Note Taker CRUD endpoints and action items management.
- `app/api/routes/transcripts.py`: Streaming transcript uploads, validation reports, plain text retrieval, raw file streaming.
- `app/api/routes/search.py`: Personal Assistant cross-meeting search and past archive endpoints.
- `app/services/transcript_parser.py`: Multi-format parser (.vtt, .srt, .json, .txt).
- `app/services/transcript_validator.py`: Deterministic 4-stage heuristic validation engine.
- `app/core/dependencies.py`: Role enforcement guards (`get_current_user`, `require_meeting_roles`, `require_personal_assistant_user`).

### Frontend Deliverables
- `src/features/meetings/MeetingDetailPage.jsx`: Consolidated meeting workspace, status badges, role permission banners, participant roster.
- `src/features/meetings/AssignRoleModal.jsx`: Interactive modal for designating Note Takers and Personal Assistants with search and registration flags.
- `src/features/meetings/AddParticipantModal.jsx`: Modal for inviting participants with timing and registered-user validations.
- `src/features/notes/NotesSection.jsx`: Note Taker authoring interface, note editor, and action item checklists.
- `src/features/transcripts/TranscriptsSection.jsx`: Drag-and-drop transcript uploader, validation status indicators, and modal viewer.
- `src/features/search/AssistantPage.jsx`: Personal Assistant search and archive page with debounced query syncing, filters, and snippet highlighting.

### Verification Status
- ✅ **Authentication:** Verified OAuth PKCE login, Fernet encryption, and `HttpOnly` JWT cookie issuance.
- ✅ **RBAC Guards:** Verified that non-members receive HTTP 403, and role-protected operations reject unauthorized users.
- ✅ **Role Exclusivity:** Verified that assigning a new Note Taker or Personal Assistant automatically demotes previous holders to participant.
- ✅ **Participant Ingestion:** Verified that only upcoming/ongoing meetings accept new participants and require registered accounts.
- ✅ **Transcript Validation:** Verified parsing and heuristic validation across WebVTT, SRT, JSON, and Text files.
- ✅ **Cross-Meeting Search:** Verified that search queries correctly extract snippets and enforce Personal Assistant authority.

Phase 2 is fully implemented, verified, and ready for deployment.


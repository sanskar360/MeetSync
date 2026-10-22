# MeetSync: Meeting Roles & Authorities Specification

This document defines the Role-Based Access Control (RBAC) model, permissions, and operational authorities across MeetSync.

---

## 1. Core Principle: Per-Meeting Scoped Roles

> [!IMPORTANT]
> In MeetSync, **roles are strictly scoped per meeting**, never globally.
> A single user can hold different roles across different meetings simultaneously:
> - **Agenda Owner** in their weekly project sync
> - **Note Taker** in a technical architecture review
> - **Personal Assistant** in an executive planning session
> - **Participant** in an engineering all-hands

---

## 2. Detailed Role Authorities & Restrictions

### 2.1. `agenda_owner` (Agenda Owner / Host)
* **How Assigned**: Automatically assigned to the Google Calendar meeting organizer (via `organizer_email` or `organizer_user_id`).
* **Core Purpose**: Meeting leadership, agenda direction, and participant role governance.
* **Authorities & Capabilities**:
  * **Role Governance (Exclusive)**: Can assign and reassign roles (`note_taker`, `personal_assistant`, `participant`) to any meeting attendee via `PATCH /api/meetings/{id}/participants/{pid}/role`.
  * **Meeting Oversight**: Can view the full consolidated meeting agenda, participant roster, published notes, and uploaded transcripts.
* **Restrictions**:
  * **No Note Authoring**: Cannot create or edit notes (delegated exclusively to the Note Taker).
  * **No Transcript Ingestion**: Cannot upload transcripts (delegated exclusively to the Note Taker).
  * **Cannot Transfer Ownership via Role API**: Cannot demote themselves or assign `agenda_owner` to others through the participant role endpoint.

---

### 2.2. `note_taker` (Designated Note Taker)
* **How Assigned**: Explicitly designated by the `agenda_owner` for that specific meeting.
* **Core Purpose**: Collaborative documentation, structured action item tracking, and recording ingestion.
* **Authorities & Capabilities**:
  * **Notes Authoring (Exclusive CRUD)**: Authorized to author new meeting notes via `POST /api/meetings/{id}/notes`.
  * **Edit & Delete Own Notes**: Can update (`PATCH`) or delete (`DELETE`) notes that they authored for this meeting.
  * **Action Items Management**: Can add, update, and toggle the completion state of interactive checklist action items within notes.
  * **Transcript Ingestion (Exclusive)**: Authorized to upload meeting recording files (`.vtt`, `.srt`, `.json`, `.txt`, `.docx`) via `POST /api/meetings/{id}/transcripts`.
* **Restrictions**:
  * **Cannot Manage Roles**: Cannot modify or assign participant roles.
  * **Cannot Edit Others' Notes**: Limited to modifying and deleting notes authored by their own user account.

---

### 2.3. `personal_assistant` (Personal Assistant / Coordinator)
* **How Assigned**: Explicitly designated by the `agenda_owner` for executive assistants, project managers, or team coordinators.
* **Core Purpose**: Meeting monitoring, follow-up coordination, and cross-meeting portfolio search.
* **Authorities & Capabilities**:
  * **Executive Search & Archive**: Access to cross-meeting intelligence and past meetings archive (`GET /api/meetings/past` and `GET /api/meetings/search`), with the ability to filter by role and date ranges.
  * **Full Read-Only Meeting Access**: Can inspect agendas, attendee rosters, published notes, and action items across their meeting portfolio.
  * **Transcript Inspection & Download**: Can inspect automated validation reports, view full extracted text, and download raw transcript files.
* **Restrictions**:
  * **Strictly Read-Only on Meeting Materials**: Cannot create, edit, or delete notes; cannot toggle action items; cannot upload transcripts; cannot alter participant roles.

---

### 2.4. `participant` (General Attendee / Member)
* **How Assigned**: The default role for any attendee synced from Google Calendar who has not been assigned a specialized role.
* **Core Purpose**: Active meeting participant with transparent visibility into decisions.
* **Authorities & Capabilities**:
  * **Read-Only Access**: Can view the meeting details, attendee roster, and all published notes and action items.
  * **Transcript Viewing**: Can inspect transcript metadata, view extracted text, and download files for authorized meetings.
* **Restrictions**:
  * **No Administrative or Authoring Powers**: Cannot alter participant roles, write notes, toggle action items, or upload transcripts.

---

### 2.5. `non-member` (External / Uninvited User)
* **Authority**: **Zero access**.
* **Enforcement**: Any attempt by an authenticated user to view or touch a meeting where they are not an organizer or participant immediately returns **`403 Forbidden`**, preventing unauthorized data exposure.

---

## 3. Side-by-Side Permissions Matrix

| Capability / Action | `agenda_owner` | `note_taker` | `personal_assistant` | `participant` | Non-Member |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **View Agenda & Attendees** | Yes | Yes | Yes | Yes | ❌ 403 Forbidden |
| **Manage Participant Roles** | **Yes (Exclusive)** | No | No | No | ❌ 403 Forbidden |
| **Create Meeting Notes** | No | **Yes (Exclusive)** | No | No | ❌ 403 Forbidden |
| **Edit / Delete Own Notes** | No | **Yes** | No | No | ❌ 403 Forbidden |
| **Toggle Action Item Status** | No | **Yes** | No | No | ❌ 403 Forbidden |
| **Upload Transcripts** | No | **Yes (Exclusive)** | No | No | ❌ 403 Forbidden |
| **View Notes & Transcripts** | Yes | Yes | Yes | Yes | ❌ 403 Forbidden |
| **Download Transcript Files** | Yes | Yes | Yes | Yes | ❌ 403 Forbidden |
| **Search & Past Meetings Archive** | Yes | Yes | **Yes (Dedicated View)** | Yes | ❌ 403 Forbidden |

---

## 4. Backend API Enforcement Mapping

| API Endpoint | Method | Required Role / Dependency | Description |
| :--- | :--- | :--- | :--- |
| `/api/meetings` | `GET` | `get_current_user` | Lists user's meetings with active per-meeting role |
| `/api/meetings/{id}` | `GET` | `require_meeting_member` | Retrieves meeting metadata |
| `/api/meetings/{id}/participants` | `GET` | `require_meeting_member` | Lists participant roster with current roles |
| `/api/meetings/{id}/participants/{pid}/role` | `PATCH` | `require_meeting_roles(["agenda_owner"])` | Assigns `note_taker`, `personal_assistant`, or `participant` |
| `/api/meetings/{id}/notes` | `GET` | `require_meeting_member` | Lists all published meeting notes |
| `/api/meetings/{id}/notes` | `POST` | `require_meeting_roles(["note_taker"])` | Creates a new note with action items |
| `/api/meetings/{id}/notes/{nid}` | `PATCH` | `require_meeting_roles(["note_taker"])` (Author check) | Updates existing note and action items |
| `/api/meetings/{id}/notes/{nid}` | `DELETE` | `require_meeting_roles(["note_taker"])` (Author check) | Deletes a note |
| `/api/meetings/{id}/transcripts` | `GET` | `require_meeting_member` | Lists transcript metadata and validation status |
| `/api/meetings/{id}/transcripts` | `POST` | `require_meeting_roles(["note_taker"])` | Uploads transcript file for validation |
| `/api/meetings/{id}/transcripts/{tid}/text` | `GET` | `require_meeting_member` | Retrieves extracted transcript text |
| `/api/meetings/{id}/transcripts/{tid}/file` | `GET` | `require_meeting_member` | Streams original transcript file for download |
| `/api/meetings/search` | `GET` | `get_current_user` | Searches meetings where user is an authorized member |
| `/api/meetings/past` | `GET` | `get_current_user` | Browse past meetings archive |

---

## 5. Calendar Synchronization & Role Preservation Rules

1. **Guaranteed Agenda Owner Record**: In Google Calendar payloads, the organizer is frequently omitted from the `attendees` array. MeetSync guarantees an `agenda_owner` participant record is created for `organizer_email`.
2. **Preserving Manual Role Assignments**: Recurring Google Calendar syncs will **never** overwrite manually assigned `"note_taker"` or `"personal_assistant"` roles with `"participant"`.
3. **Attendee Removal**: If an attendee is removed from Google Calendar, their historical notes and uploaded transcripts remain preserved in MeetSync.

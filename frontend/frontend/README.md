# MeetSync Frontend

A modern, role-governed meeting intelligence and collaboration frontend built with **React 19 + Vite + JavaScript**, **Tailwind CSS**, **React Router v7**, and **TanStack Query v5**.

MeetSync communicates with a FastAPI backend at the same origin (`/api/...`) using HttpOnly cookie sessions.

---

## 🚀 Quick Start

### 1. Installation
```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install
```

### 2. Development Server
```bash
npm run dev
```
Starts the Vite dev server at `http://localhost:5173`.
All requests to `/api/*` are automatically reverse-proxied to the FastAPI server at `http://localhost:8000` via `vite.config.js`.

### 3. Production Build
```bash
npm run build
```
Generates an optimized production bundle inside `frontend/dist/` with split vendor, TanStack Query, and Lucide icon chunks.

---

## 🧪 Mock Mode (Demo Workspace)

MeetSync includes a fully stateful, offline-capable in-memory mock adapter designed for testing and reviewer exploration without requiring a live backend or Google OAuth configuration:

- **Toggle in UI**: Click the **Mock: ON / OFF** toggle pill located in the top header.
- **One-Click Demo Login**: Click **"Explore Demo Workspace (Alex Mercer)"** on the `/login` screen.
- **Preloaded Sample Data**:
  - Pre-populated with **Alex Mercer** (`alex.mercer@company.com`) across 7 diverse meetings in October 2026:
    1. `meeting-1`: Role = **Agenda Owner** (`agenda_owner`) — Can reassign roles (`note_taker`, `personal_assistant`, `participant`).
    2. `meeting-2`: Role = **Note Taker** (`note_taker`) — Can author notes, update action items, and upload transcripts.
    3. `meeting-3`: Role = **Personal Assistant** (`personal_assistant`) — Read-only on meeting; access to Search & Intelligence archive (`/assistant`).
    4. `meeting-4`: Role = **Participant** (`participant`) — Read-only member.
    5. `meeting-5`: Role = **Agenda Owner** (`agenda_owner`) — Multi-transcript meeting with rejected upload state.
    6. `meeting-6`: Role = **Note Taker** (`note_taker`) — Customer UX debrief.
    7. `meeting-restricted`: Non-member meeting — Accessing directly demonstrates strict **403 Access Denied** with zero private data exposure.
- **Stateful In-Memory Mutations**: Role reassignments, note creations/edits/deletions, action item completions, and transcript uploads are persisted in memory for the duration of your session.

---

## 📁 Folder Structure

```
frontend/
├── dist/                          # Production build output
├── public/                        # Static assets (favicons, etc.)
├── src/
│   ├── api/                       # API layer & client wrappers
│   │   ├── http.js                # Native fetch wrapper (credentials: 'include', FastAPI error parsing, 401 handling)
│   │   ├── auth.js                # Session restore (/api/auth/me) & Google OAuth
│   │   ├── meetings.js            # Calendar & meeting details endpoints
│   │   ├── notes.js               # Meeting notes CRUD
│   │   ├── transcripts.js         # Multipart transcript uploads & text viewing
│   │   ├── search.js              # Full-text search & past meetings archive
│   │   ├── mockData.js            # Realistic October 2026 meeting fixtures
│   │   └── mockAdapter.js         # Stateful in-memory mock engine
│   ├── app/
│   │   ├── App.jsx                # TanStack Query & Context providers setup
│   │   └── router.jsx             # React Router configuration
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.jsx      # Top header + main container (no navbar/sidebar)
│   │   │   ├── Header.jsx         # Breadcrumb, search icon, theme toggle, user avatar, mock switcher
│   │   │   └── ProtectedRoute.jsx # Auth session protector & 403 access guard
│   │   └── ui/                    # Reusable UI component library
│   │       ├── Badge.jsx          # Role badges & transcript status indicators
│   │       ├── Button.jsx         # Accessible primary, secondary & ghost buttons
│   │       ├── Card.jsx           # Clean card containers with eyebrow headers
│   │       ├── Dialog.jsx         # Accessible modal dialogs with focus traps
│   │       ├── EmptyState.jsx     # Visual empty states
│   │       ├── ErrorState.jsx     # Error boundary screens with status codes
│   │       ├── Input.jsx          # Accessible inputs, textareas, and selects
│   │       ├── Skeleton.jsx       # Shimmer loading skeletons
│   │       └── Toast.jsx          # Toast notifications provider
│   ├── features/
│   │   ├── auth/                  # Login screen & AuthContext session manager
│   │   ├── dashboard/             # Calendar-first dashboard & agenda picker
│   │   ├── meetings/              # Meeting details page & participant role manager
│   │   ├── notes/                 # Collaborative note editor & action items checklist
│   │   ├── transcripts/           # Drag-and-drop transcript uploader & inspection drawer
│   │   └── search/                # Personal Assistant search & past archive view
│   ├── hooks/
│   │   ├── useDebounce.js         # Reusable debounced input hook
│   │   └── useTheme.js            # Light/Dark mode state synced to CSS variables
│   ├── lib/
│   │   ├── date.js                # Timezone-safe date grouping & calendar grid generation
│   │   ├── roles.js               # Role derivation & capabilities matrix
│   │   └── utils.js               # General formatting helpers (initials, numbers)
│   ├── styles/
│   │   ├── index.css              # Tailwind base imports
│   │   └── tokens.css             # Light & Dark theme CSS variables
│   ├── types/
│   │   ├── note.js                # Zod schemas for note validation & JSONB action items
│   │   └── transcript.js          # Allowed extensions & file size validators
│   └── main.jsx                   # DOM root mount
├── index.html                     # HTML5 SPA entry point
├── package.json                   # Dependencies & build scripts
├── tailwind.config.js             # Tailwind CSS tokens configuration
└── vite.config.js                 # Vite bundler, proxy & deployment documentation
```

---

## 🔒 Security & Architecture Rules

1. **HttpOnly Cookie Sessions**:
   - MeetSync relies strictly on browser HttpOnly cookies (`credentials: 'include'`).
   - **Never** stores access tokens, refresh tokens, or user secrets in `localStorage` or Vite environment variables. `localStorage` is used solely for client theme preference (`meetsync_theme`) and mock mode state (`meetsync_mock_mode`).
2. **Per-Meeting Roles**:
   - Roles are strictly scoped **per meeting**, never global.
   - The user's role is resolved by matching the authenticated user (`/api/auth/me`) against the meeting's participant roster.
3. **Role Permission Governance**:
   - `agenda_owner`: Can view all content and manage participant roles (`note_taker`, `personal_assistant`, `participant`). **Cannot reassign `agenda_owner`** or edit their own role.
   - `note_taker`: Can create notes, edit/delete their own notes, toggle action items, and upload transcripts.
   - `personal_assistant`: Read-only access to meeting materials; access to search and past meetings archive (`/assistant`).
   - `participant`: Read-only access to published notes and transcripts.
   - **Non-member / 403**: Immediate Access Denied state; private agendas, participant rosters, notes, and transcripts are never rendered.
4. **Calendar & Webhook Isolation**:
   - No calendar sync/watch controls are rendered.
   - No direct webhook endpoints are called by the frontend.
5. **Transcript Immutability**:
   - Transcripts have **no delete endpoint or button**.
   - `NEEDS_REVIEW` validation status is treated as an informational flag requiring human verification, **not an upload failure**.

---

## 📦 Deployment with FastAPI

To serve the MeetSync frontend from the same origin as the FastAPI backend:

### Step 1: Compile the Frontend
```bash
npm run build
```
This builds static assets into `frontend/dist`.

### Step 2: Configure FastAPI (`backend/main.py`)
Mount the static assets and set up a Single Page Application (SPA) catch-all route to serve `index.html` for client-side routing:

```python
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI(title="MeetSync API")

# 1. Register API endpoints first under /api
# app.include_router(auth_router, prefix="/api/auth")
# app.include_router(meetings_router, prefix="/api/meetings")

# 2. Mount compiled static assets
DIST_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
app.mount("/assets", StaticFiles(directory=os.path.join(DIST_DIR, "assets")), name="assets")

# 3. SPA catch-all route for HTML5 history pushState fallback
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    file_path = os.path.join(DIST_DIR, full_path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(DIST_DIR, "index.html"))
```

---

## 📝 Known Schema Assumptions & TODOs

All assumptions made while matching backend API shapes are marked with `TODO` in the codebase:

1. **`action_items` Schema (`src/types/note.js`)**:
   - Assumed shape in PostgreSQL JSONB: `[{ id: string, text: string, assignee?: string, completed: boolean }]`.
   - Marked with `TODO: Confirm exact JSONB key names with backend schema`.
2. **Meeting List Role Derivation (`src/features/dashboard/DashboardPage.jsx`)**:
   - `GET /api/meetings` may either embed `participants` array or provide a `user_role` field. `deriveMeetingRole` handles both, with fallback to creator check.
   - Marked with `TODO: Confirm if backend GET /api/meetings response schema returns user_role or participants directly`.
3. **Allowed Transcript File Formats (`src/types/transcript.js`)**:
   - Client allow-list: `.vtt`, `.srt`, `.json` with a 25 MB max size cap.
   - Marked with `TODO: Confirm allowed transcript file types and size limit with backend specification`.
4. **Logout Endpoint (`src/features/auth/AuthContext.jsx`)**:
   - Session logout clears client React query cache and redirects to `/login`.
   - Marked with `TODO: Call POST /api/auth/logout once server logout endpoint is finalized`.

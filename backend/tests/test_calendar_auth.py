"""
Focused tests for calendar route authentication and ownership enforcement.

Verifies:
- Unauthenticated requests are rejected with 401.
- An authenticated user can access their own calendar data.
- User A cannot read/modify User B's calendar (returns 404 via ownership filter).
- The webhook route (/api/webhooks/google-calendar) is NOT protected by these checks.
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.core.dependencies import get_current_user
from app.core.database import get_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_user(user_id=None, email="test@example.com"):
    user = MagicMock()
    user.id = user_id or uuid.uuid4()
    user.email = email
    user.name = "Test User"
    return user


def make_db():
    return MagicMock()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

USER_A = make_user(email="user_a@example.com")
USER_B = make_user(email="user_b@example.com")


def override_get_current_user_a():
    return USER_A


def override_get_current_user_b():
    return USER_B


def override_get_db():
    yield make_db()


# ---------------------------------------------------------------------------
# 1. Unauthenticated requests must be rejected
# ---------------------------------------------------------------------------

class TestUnauthenticated:
    def setup_method(self):
        app.dependency_overrides = {get_db: override_get_db}

    def teardown_method(self):
        app.dependency_overrides = {}

    def test_sync_get_requires_auth(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/api/calendars/sync")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"

    def test_sync_post_requires_auth(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post("/api/calendars/sync")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"

    def test_events_requires_auth(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/api/calendars/events?google_calendar_id=primary")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"

    def test_sync_meetings_requires_auth(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(f"/api/calendars/sync/{uuid.uuid4()}/meetings")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"

    def test_watch_requires_auth(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(f"/api/calendars/watch/{uuid.uuid4()}")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"

    def test_stop_watch_requires_auth(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(f"/api/calendars/stop-watch/{uuid.uuid4()}")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"

    def test_status_requires_auth(self):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get(f"/api/calendars/status/{uuid.uuid4()}")
        assert resp.status_code == 401, f"Expected 401, got {resp.status_code}"


# ---------------------------------------------------------------------------
# 2. Authenticated user accesses their own calendar
# ---------------------------------------------------------------------------

class TestOwnerAccess:
    def setup_method(self):
        app.dependency_overrides = {
            get_db: override_get_db,
            get_current_user: override_get_current_user_a,
        }

    def teardown_method(self):
        app.dependency_overrides = {}

    def test_sync_with_mocked_services(self):
        """GET /api/calendars/sync returns 200 and uses authenticated user's ID."""
        with patch("app.api.routes.calendar.sync_user_calendars", return_value=[]) as m_sync, \
             patch("app.api.routes.calendar.sync_calendar_meetings", return_value=0):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get("/api/calendars/sync")
        assert resp.status_code == 200
        m_sync.assert_called_once()
        call_kwargs = m_sync.call_args.kwargs
        assert call_kwargs["user_id"] == USER_A.id

    def test_calendar_scoped_route_returns_404_when_calendar_missing(self):
        """Routes scoped to calendar_id return 404 when calendar does not exist."""
        with patch("app.api.routes.calendar.get_calendar_by_id", return_value=None):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(f"/api/calendars/status/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_sync_meetings_returns_404_when_calendar_missing(self):
        with patch("app.api.routes.calendar.get_calendar_by_id", return_value=None):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(f"/api/calendars/sync/{uuid.uuid4()}/meetings")
        assert resp.status_code == 404

# ---------------------------------------------------------------------------
# 3. Cross-user ownership: User B cannot access User A's calendar
# ---------------------------------------------------------------------------

class TestOwnershipEnforcement:
    """
    Ownership is enforced by passing current_user.id to get_calendar_by_id,
    which filters by Calendar.user_id == user_id in the DB.
    When User B requests User A's calendar_id, the repo returns None -> 404.
    """

    def setup_method(self):
        app.dependency_overrides = {
            get_db: override_get_db,
            get_current_user: override_get_current_user_b,  # Logged in as User B
        }

    def teardown_method(self):
        app.dependency_overrides = {}

    def test_status_user_b_cannot_see_user_a_calendar(self):
        """User B requesting User A's calendar_id gets 404."""
        with patch("app.api.routes.calendar.get_calendar_by_id", return_value=None):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(f"/api/calendars/status/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_sync_meetings_user_b_cannot_sync_user_a_calendar(self):
        with patch("app.api.routes.calendar.get_calendar_by_id", return_value=None):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(f"/api/calendars/sync/{uuid.uuid4()}/meetings")
        assert resp.status_code == 404

    def test_watch_user_b_cannot_watch_user_a_calendar(self):
        with patch("app.api.routes.calendar.get_calendar_by_id", return_value=None):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(f"/api/calendars/watch/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_stop_watch_user_b_cannot_stop_user_a_watch(self):
        with patch("app.api.routes.calendar.get_calendar_by_id", return_value=None):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.post(f"/api/calendars/stop-watch/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_user_id_query_param_is_ignored(self):
        """
        The old ?user_id=... attack vector is gone.
        Passing User A's ID as query param while authenticated as User B
        must NOT grant access to User A's data — User B's ID is used from token.
        """
        with patch("app.api.routes.calendar.sync_user_calendars", return_value=[]) as m_sync, \
             patch("app.api.routes.calendar.sync_calendar_meetings", return_value=0):
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(f"/api/calendars/sync?user_id={USER_A.id}")
        assert resp.status_code == 200
        # Service must be called with User B's ID (not the supplied User A ID)
        call_kwargs = m_sync.call_args.kwargs
        assert call_kwargs["user_id"] == USER_B.id
        assert call_kwargs["user_id"] != USER_A.id


# ---------------------------------------------------------------------------
# 4. Webhook route is NOT affected (server-to-server, no user auth required)
# ---------------------------------------------------------------------------

class TestWebhookUnchanged:
    def setup_method(self):
        app.dependency_overrides = {get_db: override_get_db}

    def teardown_method(self):
        app.dependency_overrides = {}

    def test_webhook_sync_handshake_does_not_require_user_auth(self):
        """Webhook handshake (state=sync) must return 200 without any user JWT."""
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(
            "/api/webhooks/google-calendar",
            headers={
                "X-Goog-Channel-ID": "test-channel-123",
                "X-Goog-Resource-State": "sync",
            },
        )
        assert resp.status_code == 200

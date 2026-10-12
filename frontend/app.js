/**
 * MeetSync Frontend Application State & Controller
 * Implements Google OAuth session handling, role-based UI adaptation,
 * Note Taker minutes/actions, transcript deterministic audit, and PA search.
 */

const API_BASE = '/api';

// In-memory application state
let currentUser = null;
let currentMeeting = null;
let actionItemsBuffer = [];
let currentTab = 'dashboard';
let currentDetailTab = 'overview';

// ==========================================
// Initialization & Authentication
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthSession();
});

function showAlert(message, type = 'success') {
  const container = document.getElementById('alertContainer');
  const alertEl = document.createElement('div');
  alertEl.className = `alert alert-${type}`;
  alertEl.innerHTML = `
    <span>${message}</span>
    <button style="background:none;border:none;color:inherit;cursor:pointer;font-weight:bold;" onclick="this.parentElement.remove()">✕</button>
  `;
  container.appendChild(alertEl);
  setTimeout(() => alertEl.remove(), 6000);
}

async function apiRequest(endpoint, options = {}) {
  const defaultHeaders = {
    'Accept': 'application/json',
  };

  // If body is JSON, add content-type
  if (options.body && !(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'include', // Automatically passes HttpOnly session cookies
  });

  if (response.status === 401) {
    currentUser = null;
    updateAuthUI();
    throw new Error('Unauthorized');
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const data = await response.json();
    if (!response.ok) {
      const errMsg = data.detail || (data.details ? JSON.stringify(data.details) : 'Request failed');
      throw new Error(errMsg);
    }
    return data;
  }

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response;
}

async function checkAuthSession() {
  try {
    const user = await apiRequest('/auth/me');
    currentUser = user;
    updateAuthUI();
    loadUserMeetings();
  } catch (err) {
    currentUser = null;
    updateAuthUI();
  }
}

async function initiateGoogleLogin() {
  try {
    const res = await apiRequest('/auth/google/login');
    if (res.authorization_url) {
      window.location.href = res.authorization_url;
    }
  } catch (err) {
    showAlert(`Failed to initiate Google login: ${err.message}`, 'error');
  }
}

function logout() {
  currentUser = null;
  currentMeeting = null;
  // Expire session cookie
  document.cookie = 'meetsync_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
  updateAuthUI();
  showAlert('Signed out successfully.');
}

function updateAuthUI() {
  const loginView = document.getElementById('loginView');
  const dashboardView = document.getElementById('dashboardView');
  const mainNav = document.getElementById('mainNav');
  const loginBtn = document.getElementById('loginBtn');
  const userProfile = document.getElementById('userProfile');

  if (currentUser) {
    loginView.style.display = 'none';
    mainNav.style.display = 'flex';
    loginBtn.style.display = 'none';
    userProfile.style.display = 'flex';

    document.getElementById('userName').textContent = currentUser.name || 'User';
    document.getElementById('userEmail').textContent = currentUser.email;
    const avatar = document.getElementById('userAvatar');
    if (currentUser.profile_picture) {
      avatar.src = currentUser.profile_picture;
      avatar.style.display = 'block';
    } else {
      avatar.style.display = 'none';
    }

    if (currentTab === 'dashboard') {
      dashboardView.style.display = 'block';
    }
  } else {
    loginView.style.display = 'block';
    dashboardView.style.display = 'none';
    document.getElementById('meetingDetailView').style.display = 'none';
    document.getElementById('searchView').style.display = 'none';
    mainNav.style.display = 'none';
    loginBtn.style.display = 'inline-flex';
    userProfile.style.display = 'none';
  }
}

// ==========================================
// Tab Switching
// ==========================================

function switchTab(tab) {
  currentTab = tab;
  document.getElementById('navDashboardBtn').classList.toggle('active', tab === 'dashboard');
  document.getElementById('navSearchBtn').classList.toggle('active', tab === 'search');

  document.getElementById('dashboardView').style.display = tab === 'dashboard' ? 'block' : 'none';
  document.getElementById('meetingDetailView').style.display = 'none';
  document.getElementById('searchView').style.display = tab === 'search' ? 'block' : 'none';

  if (tab === 'dashboard') {
    loadUserMeetings();
  }
}

function switchDetailTab(subtab) {
  currentDetailTab = subtab;
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach((btn, idx) => {
    btn.classList.toggle('active', (subtab === 'overview' && idx === 0) || (subtab === 'notes' && idx === 1) || (subtab === 'transcripts' && idx === 2));
  });

  document.getElementById('subtabParticipants').style.display = subtab === 'overview' ? 'block' : 'none';
  document.getElementById('subtabNotes').style.display = subtab === 'notes' ? 'block' : 'none';
  document.getElementById('subtabTranscripts').style.display = subtab === 'transcripts' ? 'block' : 'none';
}

// ==========================================
// Meetings Dashboard
// ==========================================

async function loadUserMeetings() {
  const container = document.getElementById('meetingsList');
  container.innerHTML = '<div style="color:var(--text-muted);">Loading your meetings...</div>';

  try {
    const meetings = await apiRequest('/meetings');
    if (meetings.length === 0) {
      container.innerHTML = `
        <div class="glass-card" style="padding: 40px; text-align: center; grid-column: 1 / -1;">
          <h3>No Meetings Found</h3>
          <p style="color: var(--text-muted); margin-top: 8px;">
            Synchronize your Google Calendar from Phase 1 to populate your scheduled meetings.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = meetings.map(m => {
      const role = m.user_role || 'participant';
      const roleLabel = role.replace('_', ' ').toUpperCase();
      const startTime = new Date(m.start_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      return `
        <div class="meeting-card glass-card" onclick="openMeetingWorkspace('${m.id}')">
          <div class="meeting-card-top">
            <h3 class="meeting-title">${escapeHtml(m.title)}</h3>
            <span class="role-badge role-${role}">${roleLabel}</span>
          </div>
          <div class="meeting-meta-list">
            <span>🕒 ${startTime}</span>
            <span>👤 Organizer: ${escapeHtml(m.organizer_email || 'Unknown')}</span>
            <span>Status: <strong style="text-transform: capitalize;">${escapeHtml(m.status)}</strong></span>
          </div>
          <div class="meeting-card-footer">
            <span style="color: var(--color-primary); font-weight: 600;">Open Workspace →</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="color: #ef4444;">Failed to load meetings: ${escapeHtml(err.message)}</div>`;
  }
}

// ==========================================
// Meeting Detail Workspace
// ==========================================

async function openMeetingWorkspace(meetingId) {
  document.getElementById('dashboardView').style.display = 'none';
  document.getElementById('searchView').style.display = 'none';
  const detailView = document.getElementById('meetingDetailView');
  detailView.style.display = 'block';

  try {
    const details = await apiRequest(`/meetings/${meetingId}/details`);
    currentMeeting = details;

    // Header info
    document.getElementById('detailTitle').textContent = details.title;
    document.getElementById('detailTime').textContent = `🕒 ${new Date(details.start_time).toLocaleString()}`;
    document.getElementById('detailOrganizer').textContent = `👤 ${details.organizer_email || 'No organizer'}`;

    const roleBadge = document.getElementById('detailRoleBadge');
    roleBadge.className = `role-badge role-${details.user_role}`;
    roleBadge.textContent = details.user_role.replace('_', ' ').toUpperCase();

    const meetLink = document.getElementById('detailMeetLink');
    if (details.meet_url) {
      meetLink.href = details.meet_url;
      meetLink.style.display = 'inline-block';
    } else {
      meetLink.style.display = 'none';
    }

    renderParticipants(details.participants, details.user_role);
    renderNotes(details.notes, details.user_role);
    renderTranscripts(details.transcripts, details.user_role);

    switchDetailTab('overview');
  } catch (err) {
    showAlert(`Failed to load meeting details: ${err.message}`, 'error');
    switchTab('dashboard');
  }
}

// Subtab: Participants
function renderParticipants(participants, currentUserRole) {
  const tbody = document.getElementById('participantsTableBody');
  const isAgendaOwner = currentUserRole === 'agenda_owner';

  document.getElementById('roleNotice').textContent = isAgendaOwner
    ? 'You are the Agenda Owner. You can reassign participant roles below.'
    : 'View participant permissions. Only the Agenda Owner can adjust roles.';

  tbody.innerHTML = participants.map(p => {
    const isAgendaOwnerSelf = p.role === 'agenda_owner' || p.role === 'organizer';
    let actionHtml = '-';

    if (isAgendaOwner && !isAgendaOwnerSelf) {
      actionHtml = `
        <select class="form-input" style="padding: 4px 8px; font-size: 13px;" onchange="updateParticipantRole('${p.id}', this.value)">
          <option value="participant" ${p.role === 'participant' ? 'selected' : ''}>Participant</option>
          <option value="note_taker" ${p.role === 'note_taker' ? 'selected' : ''}>Note Taker</option>
          <option value="personal_assistant" ${p.role === 'personal_assistant' ? 'selected' : ''}>Personal Assistant</option>
        </select>
      `;
    }

    return `
      <tr>
        <td><strong>${escapeHtml(p.email)}</strong></td>
        <td><span style="text-transform: capitalize; color: var(--text-muted);">${escapeHtml(p.response_status || 'needsAction')}</span></td>
        <td><span class="role-badge role-${p.role}">${p.role.replace('_', ' ').toUpperCase()}</span></td>
        <td>${actionHtml}</td>
      </tr>
    `;
  }).join('');
}

async function updateParticipantRole(participantId, newRole) {
  if (!currentMeeting) return;
  try {
    await apiRequest(`/meetings/${currentMeeting.id}/participants/${participantId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole }),
    });
    showAlert(`Role updated to ${newRole.replace('_', ' ')} successfully.`);
    openMeetingWorkspace(currentMeeting.id);
  } catch (err) {
    showAlert(`Failed to update role: ${err.message}`, 'error');
  }
}

// Subtab: Notes
function renderNotes(notes, currentUserRole) {
  const container = document.getElementById('notesListContainer');
  const actionBtnContainer = document.getElementById('noteTakerActionBtnContainer');
  const isNoteTaker = currentUserRole === 'note_taker';

  if (isNoteTaker) {
    actionBtnContainer.innerHTML = `
      <button class="btn btn-primary btn-sm" onclick="showNoteEditor()">+ Create Meeting Note</button>
    `;
  } else {
    actionBtnContainer.innerHTML = '';
    document.getElementById('noteEditorContainer').style.display = 'none';
  }

  if (notes.length === 0) {
    container.innerHTML = `
      <div style="color: var(--text-muted); padding: 24px 0;">
        No notes recorded yet. ${isNoteTaker ? 'Click "Create Meeting Note" to record discussion minutes.' : ''}
      </div>
    `;
    return;
  }

  container.innerHTML = notes.map(n => {
    const isAuthor = currentUser && n.author_user_id === currentUser.id;
    const actionsHtml = (isNoteTaker && isAuthor) ? `
      <div>
        <button class="btn btn-secondary btn-sm" onclick="deleteNote('${n.id}')">Delete</button>
      </div>
    ` : '';

    const actionItemsHtml = (n.action_items && n.action_items.length > 0) ? `
      <div style="margin-top: 14px;">
        <strong style="font-size: 13px; color: var(--color-primary);">Action Items:</strong>
        <ul style="margin-top: 6px; padding-left: 20px; font-size: 13px;">
          ${n.action_items.map(item => `
            <li>
              ${escapeHtml(item.description)}
              ${item.assignee_email ? `<span style="color:var(--text-muted);">(@${escapeHtml(item.assignee_email)})</span>` : ''}
            </li>
          `).join('')}
        </ul>
      </div>
    ` : '';

    return `
      <div class="note-card">
        <div class="note-card-header">
          <h4 class="note-card-title">${escapeHtml(n.title)}</h4>
          <span style="font-size: 12px; color: var(--text-faint);">${new Date(n.created_at).toLocaleString()}</span>
        </div>
        <div class="note-card-content">${escapeHtml(n.content)}</div>
        ${actionItemsHtml}
        ${actionsHtml ? `<div style="margin-top: 16px;">${actionsHtml}</div>` : ''}
      </div>
    `;
  }).join('');
}

function showNoteEditor() {
  document.getElementById('noteEditorContainer').style.display = 'block';
  document.getElementById('noteTitleInput').value = '';
  document.getElementById('noteContentInput').value = '';
  actionItemsBuffer = [];
  renderActionItemsBuffer();
}

function cancelNoteEditor() {
  document.getElementById('noteEditorContainer').style.display = 'none';
}

function addActionItemRow() {
  const descInput = document.getElementById('newActionDesc');
  const assigneeInput = document.getElementById('newActionAssignee');
  const desc = descInput.value.trim();
  const assignee = assigneeInput.value.trim();

  if (!desc) {
    showAlert('Please enter an action item description', 'error');
    return;
  }

  actionItemsBuffer.push({
    description: desc,
    assignee_email: assignee || null,
    is_completed: false,
  });

  descInput.value = '';
  assigneeInput.value = '';
  renderActionItemsBuffer();
}

function removeActionItemRow(index) {
  actionItemsBuffer.splice(index, 1);
  renderActionItemsBuffer();
}

function renderActionItemsBuffer() {
  const container = document.getElementById('actionItemsList');
  container.innerHTML = actionItemsBuffer.map((item, idx) => `
    <div class="action-item-row">
      <span style="flex:1;">📌 ${escapeHtml(item.description)} ${item.assignee_email ? `<em>(@${escapeHtml(item.assignee_email)})</em>` : ''}</span>
      <button type="button" class="btn btn-secondary btn-sm" onclick="removeActionItemRow(${idx})">✕</button>
    </div>
  `).join('');
}

async function saveNote() {
  if (!currentMeeting) return;
  const title = document.getElementById('noteTitleInput').value.trim();
  const content = document.getElementById('noteContentInput').value.trim();

  if (!title || !content) {
    showAlert('Title and content are required.', 'error');
    return;
  }

  try {
    await apiRequest(`/meetings/${currentMeeting.id}/notes`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        content,
        action_items: actionItemsBuffer,
      }),
    });
    showAlert('Meeting note recorded successfully!');
    cancelNoteEditor();
    openMeetingWorkspace(currentMeeting.id);
  } catch (err) {
    showAlert(`Failed to save note: ${err.message}`, 'error');
  }
}

async function deleteNote(noteId) {
  if (!confirm('Are you sure you want to delete this meeting note?')) return;
  try {
    await apiRequest(`/meetings/${currentMeeting.id}/notes/${noteId}`, {
      method: 'DELETE',
    });
    showAlert('Note deleted successfully.');
    openMeetingWorkspace(currentMeeting.id);
  } catch (err) {
    showAlert(`Failed to delete note: ${err.message}`, 'error');
  }
}

// Subtab: Transcripts
function renderTranscripts(transcripts, currentUserRole) {
  const isNoteTaker = currentUserRole === 'note_taker';
  const uploadZone = document.getElementById('transcriptUploadZone');
  uploadZone.style.display = isNoteTaker ? 'block' : 'none';

  const container = document.getElementById('transcriptsListContainer');
  if (transcripts.length === 0) {
    container.innerHTML = `
      <div style="color: var(--text-muted); padding: 24px 0; grid-column: 1 / -1;">
        No transcripts uploaded. ${isNoteTaker ? 'Upload a meeting recording file above (.txt, .vtt, .srt, .md, .json).' : ''}
      </div>
    `;
    return;
  }

  container.innerHTML = transcripts.map(t => {
    const rep = t.validation_report || {};
    let badgeClass = 'badge-accepted';
    if (t.validation_status === 'NEEDS_REVIEW') badgeClass = 'badge-review';
    if (t.validation_status === 'REJECTED') badgeClass = 'badge-rejected';

    const warningsHtml = (rep.warnings && rep.warnings.length > 0) ? `
      <div class="transcript-warnings">
        <strong>Validation Flags:</strong>
        <ul style="margin-top: 4px; padding-left: 18px;">
          ${rep.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
        </ul>
      </div>
    ` : '';

    return `
      <div class="transcript-card glass-subcard">
        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px;">
          <h4 style="font-family: var(--font-display); font-size: 16px;">${escapeHtml(t.original_filename)}</h4>
          <span class="validation-badge ${badgeClass}">${escapeHtml(t.validation_status)}</span>
        </div>
        <div style="font-size: 13px; color: var(--text-muted); display: flex; flex-direction: column; gap: 4px;">
          <span>Format: ${escapeHtml(t.file_format.toUpperCase())} (${Math.round(t.file_size / 1024)} KB)</span>
          <span>Word Count: ${rep.word_count || 0} words</span>
          <span>Speakers: ${rep.detected_speakers && rep.detected_speakers.length ? escapeHtml(rep.detected_speakers.join(', ')) : 'None detected'}</span>
        </div>
        ${warningsHtml}
        <div style="display: flex; gap: 8px; margin-top: 16px;">
          <button class="btn btn-primary btn-sm" onclick="viewTranscriptText('${t.id}', '${escapeHtml(t.original_filename)}')">View Text</button>
          <a href="/api/meetings/${currentMeeting.id}/transcripts/${t.id}/file" class="btn btn-secondary btn-sm" download>Download File</a>
        </div>
      </div>
    `;
  }).join('');
}

async function handleTranscriptFileSelected(event) {
  const file = event.target.files[0];
  if (!file || !currentMeeting) return;

  const progress = document.getElementById('uploadProgress');
  progress.style.display = 'block';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await apiRequest(`/meetings/${currentMeeting.id}/transcripts`, {
      method: 'POST',
      body: formData,
    });
    showAlert(`Transcript parsed & verified! Status: ${res.validation_status}`);
    openMeetingWorkspace(currentMeeting.id);
  } catch (err) {
    showAlert(`Upload failed: ${err.message}`, 'error');
  } finally {
    progress.style.display = 'none';
    event.target.value = '';
  }
}

async function viewTranscriptText(transcriptId, filename) {
  if (!currentMeeting) return;
  try {
    const textData = await apiRequest(`/meetings/${currentMeeting.id}/transcripts/${transcriptId}/text`);
    document.getElementById('modalTranscriptTitle').textContent = `Transcript: ${filename} (${textData.word_count} words)`;
    document.getElementById('modalTranscriptContent').textContent = textData.content_text;
    document.getElementById('transcriptTextModal').style.display = 'flex';
  } catch (err) {
    showAlert(`Failed to fetch transcript text: ${err.message}`, 'error');
  }
}

function closeTranscriptModal() {
  document.getElementById('transcriptTextModal').style.display = 'none';
}

// ==========================================
// Personal Assistant Search & Past Archive
// ==========================================

async function executeSearch(event) {
  if (event) event.preventDefault();
  const query = document.getElementById('searchQueryInput').value.trim();
  const startDate = document.getElementById('searchStartDate').value;
  const endDate = document.getElementById('searchEndDate').value;
  const role = document.getElementById('searchRoleSelect').value;

  const params = new URLSearchParams();
  if (query) params.append('q', query);
  if (startDate) params.append('start_date', new Date(startDate).toISOString());
  if (endDate) params.append('end_date', new Date(endDate).toISOString());
  if (role) params.append('role', role);

  const container = document.getElementById('searchResultsContainer');
  container.innerHTML = '<div style="color:var(--text-muted);">Searching across meetings, notes, and transcripts...</div>';

  try {
    const data = await apiRequest(`/meetings/search?${params.toString()}`);
    if (data.results.length === 0) {
      container.innerHTML = `
        <div class="glass-card" style="padding: 32px; text-align: center;">
          <h3>No matching meetings or records found</h3>
          <p style="color: var(--text-muted); margin-top: 6px;">Try adjusting your keywords or date range.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = data.results.map(r => `
      <div class="snippet-card glass-card" onclick="openMeetingWorkspace('${r.meeting_id}')">
        <div style="display: flex; justify-content: space-between; align-items: baseline;">
          <h3 style="font-family: var(--font-display); font-size: 18px;">${escapeHtml(r.title)}</h3>
          <span class="role-badge role-${r.user_role || 'participant'}">${(r.user_role || 'participant').replace('_', ' ').toUpperCase()}</span>
        </div>
        <div style="font-size: 13px; color: var(--text-muted); margin: 6px 0;">
          🕒 ${new Date(r.start_time).toLocaleString()} | Matching Notes: ${r.matching_notes_count} | Matching Transcripts: ${r.matching_transcripts_count}
        </div>
        ${r.snippets.map(s => `<div class="snippet-highlight">${escapeHtml(s)}</div>`).join('')}
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<div style="color: #ef4444;">Search failed: ${escapeHtml(err.message)}</div>`;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

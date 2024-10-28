// Make sure functions are available globally
window.updateSessionsTable = updateSessionsTable;
window.populateSessionFilter = populateSessionFilter;
window.showSessionDetails = showSessionDetails;
window.closeSessionDetails = closeSessionDetails;

function updateSessionsTable(sessions) {
    const tbody = document.getElementById('sessionsTable');
    if (!tbody) return;
    tbody.innerHTML = '';

    // First, let's pair up the linked sessions
    const pairedSessions = new Map();

    sessions.forEach(session => {
        const sessionId = session.session_id;
        if (!pairedSessions.has(sessionId)) {
            // Find the linked session
            const linkedSession = session.linked_logon_id ?
                sessions.find(s => s.session_id === session.linked_logon_id) : null;

            // Store both sessions together
            pairedSessions.set(sessionId, {
                main: session,
                linked: linkedSession,
                // A session pair is elevated if either token has privileges
                isElevated: Boolean(
                    (session.privileges && session.privileges.length > 0) ||
                    (linkedSession?.privileges && linkedSession.privileges.length > 0)
                )
            });
        }
    });

    // Create table rows for paired sessions
    pairedSessions.forEach(({main, linked, isElevated}) => {
        const row = document.createElement('tr');
        row.className = isElevated ? 'elevated-session' : '';
        row.style.cursor = 'pointer';  // Add pointer cursor to indicate clickable

        const displaySession = main; // Use main session for display
        const privileges = [
            ...(main.privileges?.split('\n').filter(p => p.trim()) || []),
            ...(linked?.privileges?.split('\n').filter(p => p.trim()) || [])
        ];

        row.innerHTML = `
            <td class="session-id">
                ${displaySession.username}<br>
                <small>${displaySession.session_id}</small>
                ${linked ? `<div class="linked">Linked: ${linked.session_id}</div>` : ''}
            </td>
            <td>${formatDateTime(displaySession.start_time)}</td>
            <td>${formatDateTime(displaySession.end_time) || 'N/A'}</td>
            <td>${formatDuration(displaySession.duration)}</td>
            <td>
                <span class="status-badge status-${displaySession.status.toLowerCase()}">
                    ${displaySession.status}
                </span>
            </td>
            <td>
                <span class="uac-badge ${isElevated ? 'elevated' : 'standard'}" 
                      title="${privileges.join('\n')}">
                    ${isElevated ? 'UAC Elevated' : 'Standard User'}
                </span>
            </td>
            <td>${displaySession.workstation}</td>
            <td>${displaySession.ip_address || 'N/A'}</td>
        `;


        // Add click handler for session details
        row.addEventListener('click', () => showSessionDetails(displaySession.session_id));
        tbody.appendChild(row);
    });
}

function populateSessionFilter(sessions) {
    const sessionSelect = document.getElementById('sessionFilter');
    if (!sessionSelect) return;

    // Clear existing options except the first one
    while (sessionSelect.options.length > 1) {
        sessionSelect.remove(1);
    }

    // Add new options
    sessions.forEach(session => {
        const option = document.createElement('option');
        option.value = session.session_id;
        option.textContent = `${session.username} - ${session.session_id}`;
        sessionSelect.appendChild(option);
    });
}

function showSessionDetails(sessionId) {
    if (!sessionId) return;

    const username = document.getElementById('userFilter').value;
    fetch(`/api/session-events?logon_id=${sessionId}${username ? `&user=${username}` : ''}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(events => {
            renderSessionDetailsModal(events);
        })
        .catch(error => {
            console.error('Error loading session details:', error);
            alert('Error loading session details. Please try again.');
        });
}

function renderSessionDetailsModal(events) {
    // Sort events by timestamp
    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Find login and logout events
    const loginEvent = events.find(e => e.type === 'Login');
    const logoutEvent = events.find(e => e.type === 'Logout');

    // Calculate duration
    let duration = '';
    if (loginEvent && logoutEvent) {
        const durationMs = new Date(logoutEvent.timestamp) - new Date(loginEvent.timestamp);
        duration = formatDuration(durationMs / 1000 / 60);
    }

    // Get the modal container
    const modal = document.getElementById('session-details-modal');
    if (!modal) return;

    // Update session summary
    const summaryContainer = modal.querySelector('.session-summary');
    summaryContainer.innerHTML = `
        <div class="summary-item">
            <strong>User:</strong> ${loginEvent?.username || 'Unknown'}
        </div>
        <div class="summary-item">
            <strong>Session ID:</strong> ${loginEvent?.logon_id || 'Unknown'}
        </div>
        <div class="summary-item">
            <strong>Workstation:</strong> ${loginEvent?.workstation || 'N/A'}
        </div>
        <div class="summary-item">
            <strong>Duration:</strong> ${duration || 'Active'}
        </div>
        <div class="summary-item">
            <strong>Logon Type:</strong> ${loginEvent?.logon_type || 'N/A'}
        </div>
    `;

    // Update timeline
    const timelineContainer = modal.querySelector('.timeline-list');
    timelineContainer.innerHTML = events.map(event => `
        <div class="timeline-item ${event.type.toLowerCase()} ${event.is_elevated ? 'elevated' : ''}">
            <div class="timeline-time">${formatDateTime(event.timestamp)}</div>
            <div class="timeline-content">
                <div class="timeline-header">
                    <strong>${event.type}</strong> - Event ${event.event_id}
                    ${event.is_elevated ? '<span class="elevation-badge">Elevated</span>' : ''}
                </div>
                <div class="timeline-details">
                    <strong>LogonId:</strong> ${event.logon_id}<br>
                    ${event.logon_type ? `<strong>Logon Type:</strong> ${event.logon_type}<br>` : ''}
                    ${event.linked_logon_id ? `<strong>Linked to:</strong> ${event.linked_logon_id}<br>` : ''}
                    ${event.privileges ? `
                        <div class="privileges-section">
                            <strong>Privileges:</strong>
                            <pre>${event.privileges}</pre>
                        </div>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');

    // Show the modal
    modal.style.display = 'block';

    // Add event listener for clicking outside modal to close
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeSessionDetails();
        }
    });
}

function closeSessionDetails() {
    const modal = document.getElementById('session-details-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}
// Add event listener for ESC key to close modal
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        closeSessionDetails();
    }
});

// Make these functions available globally
window.updateSessionsTable = updateSessionsTable;
window.populateSessionFilter = populateSessionFilter;
window.showSessionDetails = showSessionDetails;
window.closeSessionDetails = closeSessionDetails;
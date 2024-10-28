// sessions.js

// Make sure functions are available globally
window.updateSessionsTable = updateSessionsTable;
window.populateSessionFilter = populateSessionFilter;
window.showSessionDetails = showSessionDetails;

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
    pairedSessions.forEach(({ main, linked, isElevated }) => {
        const row = document.createElement('tr');
        row.className = isElevated ? 'elevated-session' : '';

        const displaySession = main; // Use main session for display
        const privileges = [
            ...(main.privileges?.split('\n').filter(p => p.trim()) || []),
            ...(linked?.privileges?.split('\n').filter(p => p.trim()) || [])
        ];

        row.innerHTML = `
            <td class="session-id">
                ${displaySession.username}<br>
                <small>${displaySession.session_id}</small>
                ${linked ? 
                    `<br><small>Linked: ${linked.session_id}</small>` 
                    : ''}
                ${isElevated ? 
                    `<br><span class="uac-badge elevated" title="${privileges.join('\n')}">UAC Elevated</span>` : 
                    `<br><span class="uac-badge standard">Standard User</span>`
                }
            </td>
            <td>${formatDateTime(displaySession.start_time)}</td>
            <td>${formatDateTime(displaySession.end_time)}</td>
            <td>${formatDuration(displaySession.duration)}</td>
            <td>
                <span class="status-badge status-${displaySession.status.toLowerCase()}">
                    ${displaySession.status}
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
        .then(response => response.json())
        .then(events => {
            renderSessionDetails(events);
        })
        .catch(error => console.error('Error loading session details:', error));
}

function renderSessionDetails(events) {
    const detailsContainer = document.getElementById('sessionDetails');
    if (!detailsContainer) return;

    // Sort events by timestamp
    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Find login and logout events
    const loginEvent = events.find(e => e.type === 'Login');
    const logoutEvent = events.find(e => e.type === 'Logout');

    // Calculate duration
    let duration = '';
    if (loginEvent && logoutEvent) {
        const durationMs = new Date(logoutEvent.timestamp) - new Date(loginEvent.timestamp);
        duration = formatDuration(durationMs / (1000 * 60));
    }

    // Update session header
    const headerContainer = detailsContainer.querySelector('.session-header');
    if (headerContainer) {
        headerContainer.innerHTML = `
            <h3>Session Details</h3>
            <div class="session-info">
                <p><strong>User:</strong> ${loginEvent?.username || 'Unknown'}</p>
                <p><strong>Session ID:</strong> ${loginEvent?.logon_id || 'Unknown'}</p>
                <p><strong>Workstation:</strong> ${loginEvent?.workstation || 'N/A'}</p>
                <p><strong>Duration:</strong> ${duration || 'Active'}</p>
            </div>
        `;
    }

    // Update event timeline
    const timelineContainer = detailsContainer.querySelector('.event-timeline');
    if (timelineContainer) {
        timelineContainer.innerHTML = events.map(event => `
            <div class="event-item event-${event.type.toLowerCase()} ${event.is_elevated ? 'elevated' : ''}">
                <div class="event-time">${formatDateTime(event.timestamp)}</div>
                <div class="event-content">
                    <strong>${event.type}</strong> - Event ${event.event_id}
                    ${event.is_elevated ? '<span class="elevation-badge">Elevated</span>' : ''}
                    <br>
                    ${event.linked_logon_id ? `Linked to: ${event.linked_logon_id}<br>` : ''}
                    ${event.privileges ? `
                        <div class="privileges-section">
                            <strong>Privileges:</strong>
                            <pre>${event.privileges}</pre>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    // Show the details container
    detailsContainer.classList.add('active');
}

// Make sure these are available globally
window.updateSessionsTable = updateSessionsTable;
window.populateSessionFilter = populateSessionFilter;
window.showSessionDetails = showSessionDetails;
function refreshData() {
    updateDashboard();
}

function updateDashboard() {
    const username = document.getElementById('userFilter').value;
    const activeTab = document.querySelector('.tab.active').textContent.toLowerCase();

    // Show loading state
    const container = document.querySelector('.container');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-message';
    loadingDiv.textContent = 'Loading data...';
    container.prepend(loadingDiv);

    // Clear any existing error messages
    document.querySelectorAll('.error-message').forEach(el => el.remove());

    Promise.all([
        fetch(`/api/sessions${username ? `?user=${username}` : ''}`),
        fetch(`/api/timeline${username ? `?user=${username}` : ''}`)
    ])
        .then(responses => Promise.all(responses.map(r => r.json())))
        .then(([sessions, timeline]) => {
            // Remove loading message
            document.querySelector('.loading-message')?.remove();

            if (activeTab.includes('session')) {
                updateSessionsTable(sessions);
                populateSessionFilter(sessions);
            } else {
                createTimeline(timeline);
            }
        })
        .catch(error => {
            console.error('Error fetching data:', error);
            document.querySelector('.loading-message')?.remove();

            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = `Error loading data: ${error.message}. Please try again later.`;
            container.prepend(errorDiv);
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

async function showSessionDetails(sessionId) {
    try {
        const response = await fetch(`/api/session-events?logon_id=${sessionId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const events = await response.json();
        renderSessionDetailsModal(events);
    } catch (error) {
        console.error('Error fetching session details:', error);
        alert('Error loading session details. Please try again.');
    }
}

function renderSessionDetailsModal(events) {
    // Create or get the session details container
    let detailsContainer = document.getElementById('session-details-modal');
    if (!detailsContainer) {
        detailsContainer = document.createElement('div');
        detailsContainer.id = 'session-details-modal';
        document.body.appendChild(detailsContainer);
    }

    // Sort events by timestamp
    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Calculate session duration if we have login and logout events
    const loginEvent = events.find(e => e.type === 'Login');
    const logoutEvent = events.find(e => e.type === 'Logout');
    let duration = '';
    if (loginEvent && logoutEvent) {
        const durationMs = new Date(logoutEvent.timestamp) - new Date(loginEvent.timestamp);
        duration = formatDuration(durationMs / 1000 / 60);
    }

    // Create the modal content
    detailsContainer.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2>Session Details</h2>
                <button onclick="closeSessionDetails()" class="close-button">&times;</button>
            </div>
            <div class="modal-body">
                <div class="session-summary">
                    <div class="summary-item">
                        <strong>User:</strong> ${loginEvent?.username || 'Unknown'}
                    </div>
                    <div class="summary-item">
                        <strong>Session ID:</strong> ${loginEvent?.logon_id || 'Unknown'}
                    </div>
                    <div class="summary-item">
                        <strong>Linked ID:</strong> ${loginEvent?.linked_logon_id || 'None'}
                    </div>
                    <div class="summary-item">
                        <strong>Duration:</strong> ${duration || 'Active'}
                    </div>
                    <div class="summary-item">
                        <strong>Logon Type:</strong> ${loginEvent?.logon_type || 'N/A'}
                    </div>
                </div>
                <div class="session-timeline">
                    <h3>Event Timeline</h3>
                    <div class="timeline-list">
                        ${events.map(event => `
                            <div class="timeline-item ${event.type.toLowerCase()} ${event.is_elevated ? 'elevated' : 'standard'}">
                                <div class="timeline-time">
                                    ${formatDateTime(event.timestamp)}
                                </div>
                                <div class="timeline-content">
                                    <div class="timeline-header">
                                        <span class="event-type">${event.type}</span>
                                        <span class="event-id">Event ID: ${event.event_id}</span>
                                        ${event.is_elevated ?
        '<span class="elevation-badge">Elevated</span>' :
        '<span class="standard-badge">Standard</span>'}
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
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;

    // Show the modal
    detailsContainer.style.display = 'block';

    // Add event listener for clicking outside modal to close
    detailsContainer.addEventListener('click', function (event) {
        if (event.target === detailsContainer) {
            closeSessionDetails();
        }
    });
}

function closeSessionDetails() {
    const detailsContainer = document.getElementById('session-details-modal');
    if (detailsContainer) {
        detailsContainer.style.display = 'none';
    }
}

// Make initialize function global by adding it to window
window.initialize = function () {
    console.log("Initializing application...");

    // Add loading message
    const container = document.querySelector('.container');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading-message';
    loadingDiv.textContent = 'Loading users...';
    container.prepend(loadingDiv);

    // First load the users
    fetch('/api/users')
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(users => {
            document.querySelector('.loading-message')?.remove();

            const userSelect = document.getElementById('userFilter');
            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user;
                option.textContent = user;
                userSelect.appendChild(option);
            });

            // After loading users, load initial data
            updateDashboard();
        })
        .catch(error => {
            console.error('Error loading users:', error);
            document.querySelector('.loading-message')?.remove();

            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = `Error loading users: ${error.message}. Please try again later.`;
            container.prepend(errorDiv);
        });

    // Add event listeners
    document.getElementById('userFilter')?.addEventListener('change', updateDashboard);

    // Add session filter event listener if it exists
    const sessionFilter = document.getElementById('sessionFilter');
    if (sessionFilter) {
        sessionFilter.addEventListener('change', function (e) {
            if (e.target.value) {
                showSessionDetails(e.target.value);
            }
        });
    }

    // Add event listener for ESC key to close modal
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeSessionDetails();
        }
    });

    console.log("Initialization complete");
};

// Also make these functions global

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', window.initialize);

// At the end of main.js
window.initialize = initialize;
window.refreshData = refreshData;
window.updateDashboard = updateDashboard;
window.showSessionDetails = showSessionDetails;
window.closeSessionDetails = closeSessionDetails;

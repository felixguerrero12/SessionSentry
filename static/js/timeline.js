// Add this right after your EVENT_COLORS constant
function getContrastColor(hexcolor) {
    // Remove the # if present
    hexcolor = hexcolor.replace('#', '');

    // Convert to RGB
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);

    // Calculate luminance
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;

    // Return black or white depending on background brightness
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

// Make the function available globally
window.getContrastColor = getContrastColor;

const LOGON_TYPES = {
    '2': 'Interactive',
    '3': 'Network',
    '4': 'Batch',
    '5': 'Service',
    '7': 'Unlock',
    '8': 'NetworkCleartext',
    '9': 'NewCredentials',
    '10': 'RemoteInteractive',
    '11': 'CachedInteractive'
};

const LOGON_TYPE_REVERSE = {
    'Interactive': '2',
    'Network': '3',
    'Batch': '4',
    'Service': '5',
    'Unlock': '7',
    'NetworkCleartext': '8',
    'NewCredentials': '9',
    'RemoteInteractive': '10',
    'CachedInteractive': '11'
};

function getLogonTypeDisplay(logonType) {
    if (!logonType) return 'N/A';

    // If it's already a descriptive name, return it
    if (typeof logonType === 'string' && !LOGON_TYPES[logonType]) {
        return logonType;
    }

    // Try to get the description from the numeric code
    return LOGON_TYPES[logonType] || logonType;
}



// Event type color mapping
const EVENT_COLORS = {
    'Login': '#4CAF50',               // Green
    'Logoff': '#F44336',             // Red

    'LoginFailed': '#FF9800',        // Orange
    'WorkstationLocked': '#2196F3',  // Blue
    'WorkstationUnlocked': '#8BC34A', // Light Green
    'SessionReconnected': '#00BCD4', // Cyan
    'SessionDisconnected': '#FF5722', // Deep Orange
    'ScreensaverOn': '#9E9E9E',      // Grey
    'ScreensaverOff': '#607D8B',     // Blue Grey
    'TokenElevated': '#9C27B0',      // Purple
    'ExplicitLogin': '#673AB7',      // Deep Purple
    'UserInitiatedLogoff': '#E91E63'  // Pink
};


// Initialize legend state
const LEGEND_STATE = {};
Object.keys(EVENT_COLORS).forEach(type => {
    LEGEND_STATE[type] = true;  // All types visible by default
});

// Global variables
let currentTimelineData = [];

function createLegend(container, data) {
    container.html('');

    const legendWrapper = container
        .append('div')
        .attr('class', 'legend-wrapper')
        .style('margin-top', '10px')
        .style('margin-bottom', '20px')
        .style('padding', '10px')
        .style('border', '1px solid #eee')
        .style('border-radius', '4px')
        .style('background-color', '#fafafa');

    // Add Select All / Deselect All controls
    const controlsDiv = legendWrapper
        .append('div')
        .attr('class', 'legend-controls')
        .style('margin-bottom', '10px')
        .style('padding-bottom', '8px')
        .style('border-bottom', '1px solid #eee')
        .style('display', 'flex')
        .style('gap', '8px');

    controlsDiv.append('button')
        .attr('class', 'legend-control-btn')
        .text('Select All')
        .style('margin-right', '10px')
        .style('padding', '4px 8px')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('background', '#fff')
        .style('color', '#333')  // Added darker text color
        .style('font-weight', '500')  // Made text slightly bolder
        .style('cursor', 'pointer')
        .style('transition', 'all 0.2s ease')  // Smooth transition for hover effects
        .on('mouseover', function () {
            d3.select(this)
                .style('background', '#f0f0f0')
                .style('border-color', '#ccc');
        })
        .on('mouseout', function () {
            d3.select(this)
                .style('background', '#fff')
                .style('border-color', '#ddd');
        })
        .on('click', function () {
            Object.keys(LEGEND_STATE).forEach(type => {
                LEGEND_STATE[type] = true;
            });
            updateLegendVisuals();
            updatePointsVisibility(data);
        });


    // Deselect All button
    controlsDiv.append('button')
        .attr('class', 'legend-control-btn')
        .text('Deselect All')
        .style('padding', '4px 8px')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('background', '#fff')
        .style('color', '#333')  // Added darker text color
        .style('cursor', 'pointer')
        .on('click', function () {
            Object.keys(LEGEND_STATE).forEach(type => {
                LEGEND_STATE[type] = false;
            });
            updateLegendVisuals();
            updatePointsVisibility(data);
        });

    // Calculate items per row
    const allTypes = Object.keys(EVENT_COLORS);
    const itemsPerRow = Math.ceil(allTypes.length / 2);

    // Create two row divs
    const row1 = legendWrapper
        .append('div')
        .attr('class', 'legend-row')
        .style('display', 'flex')
        .style('justify-content', 'flex-start')
        .style('gap', '8px')
        .style('margin-bottom', '8px');

    const row2 = legendWrapper
        .append('div')
        .attr('class', 'legend-row')
        .style('display', 'flex')
        .style('justify-content', 'flex-start')
        .style('gap', '8px');

    // Split types into two arrays
    const firstRowTypes = allTypes.slice(0, itemsPerRow);
    const secondRowTypes = allTypes.slice(itemsPerRow);

    // Function to create legend items
    const createLegendItems = (container, types) => {
        types.forEach(type => {
            const color = EVENT_COLORS[type];

            const legendItem = container
                .append('div')
                .attr('class', 'legend-item')
                .style('display', 'flex')
                .style('align-items', 'center')
                .style('padding', '4px 8px')
                .style('cursor', 'pointer')
                .style('border-radius', '4px')
                .style('background-color', LEGEND_STATE[type] ? 'rgba(0,0,0,0.05)' : 'transparent')
                .style('transition', 'all 0.2s ease')
                .style('flex', '1')
                .style('min-width', '150px')
                .style('max-width', '200px');

            // Checkbox
            const checkbox = legendItem
                .append('input')
                .attr('type', 'checkbox')
                .attr('checked', LEGEND_STATE[type])
                .style('margin-right', '8px');

            // Color indicator
            legendItem
                .append('span')
                .attr('class', 'legend-color')
                .style('display', 'inline-block')
                .style('width', '12px')
                .style('height', '12px')
                .style('background-color', color)
                .style('border-radius', '50%')
                .style('margin-right', '8px')
                .style('opacity', LEGEND_STATE[type] ? 1 : 0.5);

            // Label
            legendItem
                .append('span')
                .text(type)
                .style('opacity', LEGEND_STATE[type] ? 1 : 0.5)
                .style('white-space', 'nowrap')
                .style('overflow', 'hidden')
                .style('text-overflow', 'ellipsis');

            // Click handler for the entire legend item
            legendItem.on('click', function () {
                const newState = !LEGEND_STATE[type];
                LEGEND_STATE[type] = newState;

                // Update visual state
                d3.select(this)
                    .style('background-color', newState ? 'rgba(0,0,0,0.05)' : 'transparent')
                    .select('.legend-color')
                    .style('opacity', newState ? 1 : 0.5);

                d3.select(this)
                    .select('span:last-child')
                    .style('opacity', newState ? 1 : 0.5);

                // Update checkbox
                checkbox.property('checked', newState);

                // Update points visibility
                updatePointsVisibility(data);
            });

            // Prevent checkbox from triggering two events
            checkbox.on('click', function (event) {
                event.stopPropagation();
                legendItem.dispatch('click');
            });
        });
    };

    // Create legend items for both rows
    createLegendItems(row1, firstRowTypes);
    createLegendItems(row2, secondRowTypes);
}

function updateLegendVisuals() {
    d3.selectAll('.legend-item').each(function () {
        const type = d3.select(this).select('span:last-child').text();
        const isActive = LEGEND_STATE[type];

        d3.select(this)
            .style('background-color', isActive ? 'rgba(0,0,0,0.05)' : 'transparent')
            .select('.legend-color')
            .style('opacity', isActive ? 1 : 0.5);

        d3.select(this)
            .select('span:last-child')
            .style('opacity', isActive ? 1 : 0.5);

        d3.select(this)
            .select('input')
            .property('checked', isActive);
    });
}

function updatePointsVisibility(data) {
    // Update points in the timeline
    d3.selectAll('circle.event-point')
        .style('display', d => LEGEND_STATE[d.type] ? null : 'none');

    // Update table rows
    updateEventsTable(currentTimelineData);
}

function createTimeline(data) {
    if (!data || !data.length) {
        console.log("No data provided to createTimeline");
        return;
    }

    // First, identify elevated login IDs
    const elevatedLoginIds = new Set();
    const linkedToElevatedIds = new Set();

    // First pass: identify elevated and their linked IDs
    data.forEach(event => {
        if (event.type === 'Login' &&
            event.is_elevated === true &&
            event.privileges) {
            elevatedLoginIds.add(event.logon_id);
            if (event.linked_logon_id) {
                linkedToElevatedIds.add(event.linked_logon_id);
            }
        }
    });

    // Filter to keep only standard logins and their corresponding logouts
    let processedData = data.filter(event => {
        // Keep events that are neither elevated nor linked to elevated
        return !elevatedLoginIds.has(event.logon_id) && !linkedToElevatedIds.has(event.logon_id);
    });

    // Sort all processed events by timestamp
    processedData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    currentTimelineData = processedData;

    // Clear existing timeline
    const container = d3.select('#timeline');
    container.html('');

    // Initialize the container
    if (processedData.length === 0) {
        console.log("No valid sessions found after filtering");
        container.append('div')
            .attr('class', 'no-data')
            .style('text-align', 'center')
            .style('padding', '20px')
            .style('color', '#666')
            .text('No standard user sessions found in the selected data.');
        return;
    }

    const margin = {top: 20, right: 70, bottom: 30, left: 100};
    const width = container.node().getBoundingClientRect().width - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    const svg = container.append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const y = d3.scaleTime()
        .domain(d3.extent(processedData, d => new Date(d.timestamp)))
        .range([height, 0]);

    const x = d3.scaleLinear()
        .domain([0, 23])
        .range([0, width]);

    // Format functions
    const formatHour = d => `${Math.floor(d).toString().padStart(2, '0')}:00`;
    const formatDate = d3.timeFormat('%Y-%m-%d');

    // Add axes
    svg.append('g')
        .call(d3.axisLeft(y)
            .tickFormat(formatDate)
            .ticks(d3.timeDay.every(1)));

    svg.append('g')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(x)
            .tickFormat(formatHour)
            .ticks(24));

    // Add grid lines
    const yGrid = svg.append('g')
        .attr('class', 'grid')
        .style('stroke', '#e0e0e0')
        .style('stroke-opacity', 0.7);

    yGrid.selectAll('line')
        .data(y.ticks(d3.timeDay.every(1)))
        .enter()
        .append('line')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', d => y(d))
        .attr('y2', d => y(d));

    const xGrid = svg.append('g')
        .attr('class', 'grid')
        .style('stroke', '#e0e0e0')
        .style('stroke-opacity', 0.7);

    xGrid.selectAll('line')
        .data(d3.range(0, 24))
        .enter()
        .append('line')
        .attr('x1', d => x(d))
        .attr('x2', d => x(d))
        .attr('y1', 0)
        .attr('y2', height);

    // Add points with new color scheme
    const points = svg.selectAll('circle')
        .data(processedData)
        .enter()
        .append('circle')
        .attr('class', d => `event-point session-${d.logon_id}`)
        .attr('cx', d => {
            const date = new Date(d.timestamp);
            return x(date.getHours() + date.getMinutes() / 60);
        })
        .attr('cy', d => y(new Date(d.timestamp)))
        .attr('r', 6)
        .attr('fill', d => EVENT_COLORS[d.type] || '#757575')
        .style('cursor', 'pointer')
        .style('display', d => LEGEND_STATE[d.type] ? null : 'none');

    // Enhanced tooltip
    const tooltip = d3.select('body').append('div')
        .attr('class', 'tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('padding', '10px')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('pointer-events', 'none')
        .style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)')
        .style('font-size', '12px')
        .style('z-index', '1000');

    // Event handlers
    points
        .on('mouseover', function (event, d) {
            // Highlight the point
            d3.select(this)
                .attr('r', 8)
                .style('stroke', '#000')
                .style('stroke-width', 2);

            // Show tooltip
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);

            tooltip.html(`
                <div style="border-left: 4px solid ${EVENT_COLORS[d.type]}; padding-left: 8px;">
                    <strong>${d.type}</strong> (Event ${d.event_id})<br/>
                    <strong>User:</strong> ${d.username}<br/>
                    <strong>Time:</strong> ${formatDateTime(d.timestamp)}<br/>
                    <strong>Session ID:</strong> ${d.logon_id}<br/>
                    ${d.linked_logon_id ? `<strong>Linked Session:</strong> ${d.linked_logon_id}<br/>` : ''}
                    <strong>Workstation:</strong> ${d.workstation}<br/>
                    <strong>IP Address:</strong> ${d.ip_address || 'N/A'}<br/>
                    <strong>Logon Type:</strong> ${getLogonTypeDisplay(d.logon_type)}<br/>
                    <strong>Event Type:</strong> ${d.type} (${d.event_id})<br/>
                    <strong>Elevation:</strong> ${d.is_elevated ? 'Elevated' : 'Standard'}
                </div>
            `)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', function () {
            // Reset point size
            d3.select(this)
                .attr('r', 6)
                .style('stroke', null);

            // Hide tooltip
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        })
        .on('click', function (event, d) {
            if (window.showSessionDetails) {
                window.showSessionDetails(d.logon_id);
            }
        });

    // Create legend below the chart
    createLegend(d3.select('#timelineLegend'), processedData);

    // Update the events table with colored event types
    updateEventsTable(processedData);
}

function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString();
}

function formatDuration(minutes) {
    if (!minutes || minutes < 0) return '';
    if (minutes < 1) return '< 1m';

    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);

    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
}

function updateEventsTable(data) {
    const container = document.getElementById('timeline-events');
    if (!container) return;

    container.innerHTML = `
        <table class="events-table">
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Username</th>
                    <th>Type</th>
                    <th>LogonId</th>
                    <th>Linked LogonId</th>
                    <th>Event ID</th>
                    <th>Logon Type</th>
                    <th>Workstation</th>
                    <th>IP Address</th>
                    <th>Elevation</th>
                </tr>
            </thead>
            <tbody>
                ${data.map(d => `
                    <tr class="event-row session-${d.logon_id}" 
                        style="display: ${LEGEND_STATE[d.type] ? '' : 'none'}">
                        <td>${formatDateTime(d.timestamp)}</td>
                        <td>${d.username}</td>
                        <td>
                            <span class="event-type-badge" style="
                                background-color: ${EVENT_COLORS[d.type] || '#757575'};
                                color: ${getContrastColor(EVENT_COLORS[d.type] || '#757575')};
                                padding: 2px 6px;
                                border-radius: 3px;
                                font-size: 0.9em;
                            ">
                                ${d.type}
                            </span>
                        </td>
                        <td>${d.logon_id}</td>
                        <td>${d.linked_logon_id || '-'}</td>
                        <td>${d.event_id}</td>
                        <td>
                            <span class="logon-type-badge" style="
                                background-color: #607D8B;
                                color: white;
                                padding: 2px 6px;
                                border-radius: 3px;
                                font-size: 0.9em;
                            ">
                                ${LOGON_TYPES[d.logon_type] || d.logon_type || 'N/A'}
                            </span>
                        </td>
                        <td>${d.workstation}</td>
                        <td>${d.ip_address || 'N/A'}</td>
                        <td>
                            <span class="elevation-badge" style="
                                background-color: ${d.is_elevated ? '#9C27B0' : '#757575'};
                                color: #ffffff;
                                padding: 2px 6px;
                                border-radius: 3px;
                                font-size: 0.9em;
                                text-shadow: 0 1px 1px rgba(0,0,0,0.2);
                            ">
                                ${d.is_elevated ? 'Elevated' : 'Standard'}
                            </span>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

const additionalStyles = `
    .logon-type-badge {
        display: inline-block;
        min-width: 70px;
        text-align: center;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }
`;


// Add some CSS styles programmatically
const styles = `
    .legend-wrapper {
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .legend-item {
        user-select: none;
    }

    .legend-item:hover {
        background-color: rgba(0,0,0,0.1) !important;
    }

    .legend-item input[type="checkbox"] {
        cursor: pointer;
    }

    .legend-control-btn:hover {
        background-color: #f0f0f0;
    }

    .legend-control-btn:active {
        background-color: #e0e0e0;
    }

    #timelineLegend {
        margin: 10px 0 20px 0;
    }

    .events-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 15px;
    }

    .events-table th,
    .events-table td {
        padding: 8px;
        border: 1px solid #ddd;
        text-align: left;
    }

    .events-table th {
        background-color: #f5f5f5;
        font-weight: bold;
    }

    .events-table tr:hover {
        background-color: #f8f8f8;
    }

    .event-type-badge,
    .elevation-badge {
        display: inline-block;
        min-width: 70px;
        text-align: center;
    }
`;

// Add the styles to the document
const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

// Make sure these are available globally
window.createTimeline = createTimeline;
window.formatDateTime = formatDateTime;
window.formatDuration = formatDuration;
window.updateEventsTable = updateEventsTable;
window.EVENT_COLORS = EVENT_COLORS;

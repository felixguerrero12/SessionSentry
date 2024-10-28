import os
import traceback

import pandas as pd
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)


def load_activity_data():
    """Load and process the CSV data"""
    csv_path = 'user_activity_logs.csv'
    if os.path.exists(csv_path):
        try:
            # Read CSV first without parsing dates
            df = pd.read_csv(
                csv_path,
                na_values=['', '-', 'N/A'],
                keep_default_na=True
            )

            # Convert timestamp column after reading
            df['Timestamp'] = pd.to_datetime(
                df['Timestamp'],
                format='%m/%d/%Y %I:%M:%S %p'
            )

            # Fill NaN values appropriately
            df['IPAddress'] = df['IPAddress'].fillna('N/A')
            df['LinkedLogonId'] = df['LinkedLogonId'].fillna('')
            df['LogonType'] = df['LogonType'].fillna('N/A')

            df['IsElevated'] = df['IsElevated'].fillna(False)

            # Remove ElevatedTime handling since we don't have this column
            # df['ElevatedTime'] = pd.to_datetime(df['ElevatedTime'], format='%m/%d/%Y %I:%M:%S %p', errors='coerce')

            # Ensure LogonId is always a string
            df['LogonId'] = df['LogonId'].astype(str)

            # Convert other string columns - only include columns we actually have
            string_columns = ['Username', 'Domain', 'WorkstationName', 'EventType', 'EventId', 'LogonType']
            for col in string_columns:
                if col in df.columns:
                    df[col] = df[col].fillna('').astype(str)

            print(f"Successfully loaded {len(df)} events")
            return df

        except Exception as e:
            print(f"Error loading CSV: {str(e)}")
            traceback.print_exc()
            return pd.DataFrame()

    print(f"CSV file not found: {csv_path}")
    return pd.DataFrame()


def get_timeline_data(df, username=None):
    """Create timeline data for visualization"""
    try:
        if df.empty:
            return []

        if username:
            df = df[df['Username'].str.lower() == username.lower()]

        timeline_data = []
        for _, event in df.iterrows():
            # Create a descriptive details string
            details = f"Event {event['EventId']} ({event['EventType']})"
            if pd.notnull(event['LogonType']) and event['LogonType'] != 'N/A':
                details += f", Type {event['LogonType']}"
            if pd.notnull(event['LinkedLogonId']) and event['LinkedLogonId']:
                details += f", Linked to {event['LinkedLogonId']}"

            # Convert IsElevated to boolean
            is_elevated = False
            if pd.notnull(event['IsElevated']):
                if isinstance(event['IsElevated'], str):
                    is_elevated = event['IsElevated'].lower() == 'true'
                else:
                    is_elevated = bool(event['IsElevated'])

            # Build event data
            event_data = {
                'timestamp': event['Timestamp'].isoformat(),
                'type': event['EventType'],
                'username': event['Username'],
                'workstation': event['WorkstationName'],
                'ip_address': event['IPAddress'],
                'logon_id': event['LogonId'],
                'linked_logon_id': event['LinkedLogonId'] if pd.notnull(event['LinkedLogonId']) else None,
                'event_id': event['EventId'],
                'session_id': event['LogonId'],
                'details': details,
                'is_elevated': is_elevated,
                'elevated_time': None,  # We don't have this information
                'logon_type': event['LogonType'] if pd.notnull(event['LogonType']) else 'N/A'  # Add logon type
            }
            timeline_data.append(event_data)

        return timeline_data

    except Exception as e:
        print(f"Error in get_timeline_data: {str(e)}")
        traceback.print_exc()
        return []


def create_session_stories(df, username=None):
    """Create detailed session stories linking login to logout"""
    try:
        if df.empty:
            return []

        if username:
            df = df[df['Username'].str.lower() == username.lower()]

        # Sort by timestamp
        df = df.sort_values('Timestamp')

        # Track sessions
        sessions = []
        active_sessions = {}
        now = pd.Timestamp.now()

        for _, event in df.iterrows():
            logon_id = event['LogonId']
            event_type = event['EventType']
            timestamp = event['Timestamp']

            # Convert IsElevated to boolean
            is_elevated = False
            if pd.notnull(event['IsElevated']):
                if isinstance(event['IsElevated'], str):
                    is_elevated = event['IsElevated'].lower() == 'true'
                else:
                    is_elevated = bool(event['IsElevated'])

            if event_type == 'Login':
                # Calculate duration for any previous session with same logon_id
                if logon_id in active_sessions:
                    prev_session = active_sessions[logon_id]
                    prev_session['end_time'] = timestamp.isoformat()
                    prev_session['duration'] = (timestamp - pd.Timestamp(
                        prev_session['start_time'])).total_seconds() / 60
                    prev_session['duration_formatted'] = format_duration(prev_session['duration'])
                    prev_session['status'] = 'Completed'
                    sessions.append(prev_session)

                # Start new session
                active_sessions[logon_id] = {
                    'session_id': logon_id,
                    'username': event['Username'],
                    'start_time': timestamp.isoformat(),
                    'workstation': event['WorkstationName'],
                    'ip_address': event['IPAddress'],
                    'security_id': event.get('SecurityId', ''),  # Using get() with default value
                    'linked_logon_id': event['LinkedLogonId'] if pd.notnull(event['LinkedLogonId']) else None,
                    'logon_type': event['LogonType'],
                    'is_elevated': is_elevated,
                    'elevated_time': None,  # We don't have this information anymore
                    'events': [{
                        'type': event_type,
                        'timestamp': timestamp.isoformat(),
                        'details': (f"Login event {event['EventId']}, "
                                    f"Type {event['LogonType']}"
                                    f"{', Linked to ' + event['LinkedLogonId'] if pd.notnull(event['LinkedLogonId']) else ''}")
                    }],
                    'status': 'Active',
                    'duration': None,
                    'duration_formatted': 'Active'
                }

            elif event_type == 'Logoff' and logon_id in active_sessions:
                session = active_sessions[logon_id]
                session['end_time'] = timestamp.isoformat()
                session['status'] = 'Completed'

                # Calculate duration
                start_time = pd.Timestamp(session['start_time'])
                duration_minutes = (timestamp - start_time).total_seconds() / 60
                session['duration'] = duration_minutes
                session['duration_formatted'] = format_duration(duration_minutes)

                session['events'].append({
                    'type': event_type,
                    'timestamp': timestamp.isoformat(),
                    'details': f"{event_type} event {event['EventId']}"
                })
                sessions.append(session)
                del active_sessions[logon_id]

        # Process remaining active sessions
        for session in active_sessions.values():
            start_time = pd.Timestamp(session['start_time'])
            duration_minutes = (now - start_time).total_seconds() / 60
            session['duration'] = duration_minutes
            session['duration_formatted'] = format_duration(duration_minutes)
            session['end_time'] = None
            sessions.append(session)

        # Sort sessions by start time (newest first)
        return sorted(sessions, key=lambda x: x['start_time'], reverse=True)

    except Exception as e:
        print(f"Error in create_session_stories: {str(e)}")
        traceback.print_exc()
        return []


def format_duration(minutes):
    """Format duration in minutes to a readable string"""
    if minutes is None:
        return 'Active'

    hours = int(minutes // 60)
    mins = int(minutes % 60)

    if hours == 0:
        if mins == 0:
            return '< 1m'
        return f'{mins}m'
    return f'{hours}h {mins}m'


@app.route('/')
def index():
    df = load_activity_data()
    users = sorted(df['Username'].unique()) if not df.empty else []
    return render_template('index.html', users=users)


@app.route('/api/sessions')
def get_sessions():
    try:
        df = load_activity_data()
        username = request.args.get('user')
        sessions = create_session_stories(df, username)
        return jsonify(sessions)
    except Exception as e:
        print(f"Error in /api/sessions: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/session/<session_id>')
def get_session_details(session_id):
    try:
        df = load_activity_data()
        username = request.args.get('user')
        sessions = create_session_stories(df, username)
        session = next((s for s in sessions if s['session_id'] == session_id), None)
        if session:
            return jsonify(session)
        return jsonify({'error': 'Session not found'}), 404
    except Exception as e:
        print(f"Error in /api/session/<session_id>: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/session-events')
def get_session_events():
    try:
        df = load_activity_data()
        logon_id = request.args.get('logon_id')
        username = request.args.get('user')

        if not logon_id:
            return jsonify({'error': 'No logon_id provided'}), 400

        # Filter data for the specific session
        session_df = df[df['LogonId'] == logon_id]
        if username:
            session_df = session_df[session_df['Username'].str.lower() == username.lower()]

        if session_df.empty:
            return jsonify({'error': 'Session not found'}), 404

        # Convert session data to list of events
        events = []
        for _, event in session_df.iterrows():
            # Convert IsElevated to boolean
            is_elevated = False
            if pd.notnull(event['IsElevated']):
                if isinstance(event['IsElevated'], str):
                    is_elevated = event['IsElevated'].lower() == 'true'
                else:
                    is_elevated = bool(event['IsElevated'])

            event_data = {
                'timestamp': event['Timestamp'].isoformat(),
                'type': event['EventType'],
                'event_id': event['EventId'],
                'username': event['Username'],
                'logon_id': event['LogonId'],
                'linked_logon_id': event['LinkedLogonId'] if pd.notnull(event['LinkedLogonId']) else None,
                'workstation': event['WorkstationName'],
                'ip_address': event['IPAddress'],
                'logon_type': event['LogonType'] if pd.notnull(event['LogonType']) else 'N/A',
                'is_elevated': is_elevated,
                'privileges': None  # Add if you have privileges data in your CSV
            }
            events.append(event_data)

        # Sort events by timestamp
        events.sort(key=lambda x: x['timestamp'])
        return jsonify(events)

    except Exception as e:
        print(f"Error in /api/session-events: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/users')
def get_users():
    try:
        df = load_activity_data()
        if df.empty:
            return jsonify([])
        users = sorted(df['Username'].unique())
        return jsonify(users)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/timeline')
def get_timeline():
    try:
        df = load_activity_data()
        username = request.args.get('user')
        timeline_data = get_timeline_data(df, username)
        return jsonify(timeline_data)
    except Exception as e:
        print(f"Error in /api/timeline: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True)

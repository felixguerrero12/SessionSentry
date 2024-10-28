# SessionSentry

SessionSentry is a comprehensive Windows login session tracking and analysis tool that provides visualization and insights into user login patterns, session durations, and elevated access events.

## Features

- Track Windows login/logout events
- Monitor UAC elevation events
- Visualize session timelines
- Track workstation locks/unlocks
- Monitor remote sessions
- Interactive filtering by event types
- Detailed session analysis
- Export capabilities

## Data Collection Methods

### Method 1: PowerShell Collection (Local)

#### Requirements

##### Python Requirements
```bash
# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate

# Install requirements
pip install -r requirements.txt
```

##### Requirements.txt Content
```
flask==3.0.3
pandas
```

##### Windows Requirements
- Windows OS (tested on Windows 10/11)
- PowerShell 5.1 or later
- Administrative privileges (for accessing Security Event Log)
- Enabled Windows Security Auditing policies

#### Setup

1. Enable Security Auditing in Windows:
   ```powershell
   # Run PowerShell as Administrator
   auditpol /set /category:"Logon/Logoff" /success:enable /failure:enable
   auditpol /set /category:"Privilege Use" /success:enable /failure:enable
   ```

2. Save the collector script as `Collector.ps1`

3. Set execution policy (if needed):
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

### Method 2: Splunk Collection (Enterprise)

#### Splunk Query
```splunk
# Base query for Windows Security Events
index=windows source="WinEventLog:Security" 
(EventCode=4624 OR EventCode=4625 OR EventCode=4634 OR EventCode=4647 OR 
 EventCode=4648 OR EventCode=4672 OR EventCode=4778 OR EventCode=4779 OR 
 EventCode=4800 OR EventCode=4801 OR EventCode=4802 OR EventCode=4803)
| eval type=case(
    EventCode=4624, "Login",
    EventCode=4625, "LoginFailed",
    EventCode=4634, "Logoff",
    EventCode=4647, "UserInitiatedLogoff",
    EventCode=4648, "ExplicitLogin",
    EventCode=4672, "TokenElevated",
    EventCode=4778, "SessionReconnected",
    EventCode=4779, "SessionDisconnected",
    EventCode=4800, "WorkstationLocked",
    EventCode=4801, "WorkstationUnlocked",
    EventCode=4802, "ScreensaverOn",
    EventCode=4803, "ScreensaverOff"
)
| eval timestamp=_time
| eval username=coalesce(TargetUserName, SubjectUserName, AccountName)
| eval domain=coalesce(TargetDomainName, SubjectDomainName, AccountDomain)
| eval logon_id=coalesce(TargetLogonId, SubjectLogonId, LogonID)
| eval linked_logon_id=TargetLinkedLogonId
| eval workstation=coalesce(WorkstationName, ComputerName)
| eval ip_address=coalesce(IpAddress, ClientAddress, ClientIPAddress)
| eval event_id=EventCode
| eval is_elevated=if(EventCode=4672, "true", "false")
| where username!="SYSTEM" AND username!="LOCAL SERVICE" AND username!="NETWORK SERVICE" 
  AND NOT username LIKE "DWM-%" AND NOT username LIKE "UMFD-%" 
  AND NOT username LIKE "%$" AND domain!="NT AUTHORITY"
| table timestamp, type, username, domain, logon_id, linked_logon_id, 
  workstation, ip_address, event_id, is_elevated
| sort timestamp
```

#### Optional Splunk Query Parameters
```splunk
# Add time range
... your query ... earliest=-30d latest=now

# Add specific users
... your query ... AND username IN ("user1", "user2", "user3")

# Add specific workstations
... your query ... AND workstation IN ("PC1", "PC2", "PC3")

# Export to CSV
| outputcsv user_activity_logs.csv
```

## Usage

### PowerShell Collection
```powershell
# Run PowerShell as Administrator
.\Collector.ps1 -DaysBack 30
```

Parameters:
- `-DaysBack`: Number of days of history to collect (default: 30)
- `-IncludeSystem`: Include system account activities (optional)
- `-Debug`: Enable detailed logging (optional)
- `-OutputPath`: Custom path for output file (optional)
- `-ShowExamples`: Display example session sequences (optional)

### Splunk Collection
1. Run the Splunk query
2. Export results as CSV named `user_activity_logs.csv`
3. Place the CSV file in the application directory

### Run Web Application
```bash
# Activate virtual environment if not already activated
.venv\Scripts\activate

# Run Flask app
python app.py
```

Access the web interface:
- Open browser and navigate to `http://localhost:5000`
- Select a user from the dropdown to view their activity
- Switch between Sessions and Timeline views
- Use legend toggles to filter event types

## Output Format

The data should be in CSV format (`user_activity_logs.csv`) with the following fields:
- Timestamp
- EventType
- EventId
- Username
- Domain
- LogonId
- LinkedLogonId
- WorkstationName
- IPAddress
- LogonType
- SessionName
- Status
- FailureReason
- IsElevated

## Troubleshooting

### PowerShell Collection Issues
1. No events collected:
   - Verify you're running PowerShell as Administrator
   - Check Security Event Log access permissions
   - Verify auditing is enabled: `auditpol /get /category:"Logon/Logoff"`

2. Missing elevation events:
   - Verify UAC is enabled
   - Check Privilege Use auditing: `auditpol /get /category:"Privilege Use"`

### Splunk Collection Issues
1. Missing events:
   - Verify Windows Security logs are being forwarded to Splunk
   - Check index permissions
   - Verify event code collection in Splunk forwarder configuration

### Application Issues
- Check `user_activity_logs.csv` exists in the application directory
- Verify Python virtual environment is activated
- Check Flask debug output for detailed error messages

## Contributing

Issues and pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](https://choosealicense.com/licenses/mit/)

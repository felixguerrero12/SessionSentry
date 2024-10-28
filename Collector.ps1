[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [int]$DaysBack = 30,
    
    [Parameter()]
    [switch]$IncludeSystem,
    
    [Parameter()]
    [string]$OutputPath = "user_activity_logs.csv",

    [Parameter()]
    [switch]$ShowExamples,

    [Parameter()]
    [switch]$Help
)

# Set error action preference to continue
$ErrorActionPreference = "Continue"
$VerbosePreference = "Continue"

function Write-LogMessage {
    param(
        [string]$Message,
        [ValidateSet('Info', 'Warning', 'Error', 'Debug')]
        [string]$Level = 'Info'
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    switch ($Level) {
        'Warning' { Write-Warning "[$timestamp] $Message" }
        'Error' { Write-Error "[$timestamp] $Message" }
        'Debug' { if ($Debug) { Write-Host "[$timestamp] [DEBUG] $Message" -ForegroundColor Cyan } }
        default { Write-Host "[$timestamp] $Message" }
    }
}

function Test-AdminPrivileges {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-LogonTypeDescription {
    param([int]$LogonType)
    
    switch ($LogonType) {
        2 { "Interactive" }
        3 { "Network" }
        4 { "Batch" }
        5 { "Service" }
        7 { "Unlock" }
        8 { "NetworkCleartext" }
        9 { "NewCredentials" }
        10 { "RemoteInteractive" }
        11 { "CachedInteractive" }
        default { "Unknown ($LogonType)" }
    }
}

# Script start
Write-LogMessage "=== Windows Session State Collector v1.2 ==="

# Check admin privileges
if (-not (Test-AdminPrivileges)) {
    Write-LogMessage "Script requires administrative privileges to access security logs." -Level Warning
}

# Define date range
$EndTime = Get-Date
$StartTime = $EndTime.AddDays(-$DaysBack)

Write-LogMessage "Collection period: $($StartTime.ToString('yyyy-MM-dd HH:mm:ss')) to $($EndTime.ToString('yyyy-MM-dd HH:mm:ss'))"
Write-LogMessage "----------------------------------------"

# Initialize events array
$Events = @()

try {
    # Check Security log accessibility
    $secLog = Get-WinEvent -LogName Security -MaxEvents 1 -ErrorAction Stop
    Write-LogMessage "Security log is accessible. Latest event: $($secLog.TimeCreated)" -Level Debug

    # Define all event IDs we want to collect with descriptions
    $EventMap = @{
        4624 = "Login"                    # Successful login
        4625 = "LoginFailed"              # Failed login
        4634 = "Logoff"                   # Logoff
        4647 = "UserInitiatedLogoff"      # User-initiated logoff
        4648 = "ExplicitLogin"            # Explicit credentials login (UAC)
        4672 = "TokenElevated"            # Admin privileges assigned
        4778 = "SessionReconnected"       # Session reconnected
        4779 = "SessionDisconnected"      # Session disconnected
        4800 = "WorkstationLocked"        # Workstation locked
        4801 = "WorkstationUnlocked"      # Workstation unlocked
        4802 = "ScreensaverOn"            # Screen saver invoked
        4803 = "ScreensaverOff"           # Screen saver dismissed
    }

    Write-LogMessage "Collecting events..."
    $AllEvents = @()

    foreach ($id in $EventMap.Keys) {
        Write-LogMessage "Collecting $($EventMap[$id]) events (ID: $id)..." -Level Debug
        try {
            $events = Get-WinEvent -FilterHashtable @{
                LogName = 'Security'
                ID = $id
                StartTime = $StartTime
                EndTime = $EndTime
            } -ErrorAction Stop

            $AllEvents += $events
            Write-LogMessage "Found $($events.Count) events for ID $id" -Level Debug
        } catch [System.Exception] {
            if ($_.Exception.Message -notmatch 'No events were found') {
                Write-LogMessage "Error collecting events for ID $id : $_" -Level Warning
            }
        }
    }

    # Initialize a hashtable to track elevated sessions
    $ElevatedSessions = @{}

    # First pass - identify elevated sessions from 4672 events
    Write-LogMessage "First pass - identifying elevated sessions from special privileges events..." -Level Debug
    $AllEvents | Where-Object { $_.Id -eq 4672 } | ForEach-Object {
        $eventXML = [xml]$_.ToXml()
        $logonId = $eventXML.Event.EventData.Data |
            Where-Object { $_.Name -eq 'SubjectLogonId' } |
            Select-Object -ExpandProperty '#text'
        if ($logonId) {
            $ElevatedSessions[$logonId] = $true
            Write-LogMessage "Marked LogonId $logonId as elevated from Event 4672" -Level Debug
        }
    }

    Write-LogMessage "Found total of $($AllEvents.Count) events"
    foreach ($id in $EventMap.Keys) {
        $count = ($AllEvents | Where-Object { $_.Id -eq $id }).Count
        Write-LogMessage "Event ID $id ($($EventMap[$id])) : $count events"
    }

    # Process events
    foreach ($event in $AllEvents) {
        try {
            $eventXML = [xml]$event.ToXml()

            # Extract fields based on event type
            $username = $null
            $domain = $null
            $logonId = $null
            $logonType = "N/A"
            $linkedLogonId = $null
            $workstation = $event.MachineName
            $ipAddress = "N/A"
            $status = "N/A"
            $failureReason = $null
            $sessionName = $null
            $isElevated = $false

            # Get the appropriate fields based on event ID
            switch ($event.Id) {
                4624 {
                    # Successful logon
                    $username = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetUserName' } | Select-Object -ExpandProperty '#text'
                    $domain = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetDomainName' } | Select-Object -ExpandProperty '#text'
                    $logonId = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetLogonId' } | Select-Object -ExpandProperty '#text'
                    $logonType = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'LogonType' } | Select-Object -ExpandProperty '#text'
                    $linkedLogonId = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetLinkedLogonId' } | Select-Object -ExpandProperty '#text'
                    $workstation = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'WorkstationName' } | Select-Object -ExpandProperty '#text'
                    $ipAddress = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'IpAddress' } | Select-Object -ExpandProperty '#text'
                    $logonType = Get-LogonTypeDescription -LogonType ([int]$logonType)

                    # Check for elevated token from both sources
                    $elevatedToken = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'ElevatedToken' } | Select-Object -ExpandProperty '#text'
                    $isElevated = $elevatedToken -eq 'Yes' -or $ElevatedSessions.ContainsKey($logonId)

                    Write-LogMessage "Login event for $username with LogonId $logonId - Elevated Token: $($elevatedToken -eq 'Yes'), Event 4672: $($ElevatedSessions.ContainsKey($logonId)), Final: $isElevated" -Level Debug
                }
                4625 {
                    # Failed logon
                    $username = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetUserName' } | Select-Object -ExpandProperty '#text'
                    $domain = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetDomainName' } | Select-Object -ExpandProperty '#text'
                    $logonType = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'LogonType' } | Select-Object -ExpandProperty '#text'
                    $status = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'Status' } | Select-Object -ExpandProperty '#text'
                    $failureReason = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'SubStatus' } | Select-Object -ExpandProperty '#text'
                    $workstation = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'WorkstationName' } | Select-Object -ExpandProperty '#text'
                    $ipAddress = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'IpAddress' } | Select-Object -ExpandProperty '#text'
                    $logonType = Get-LogonTypeDescription -LogonType ([int]$logonType)
                }
                { $_ -in @(4634, 4647) } {
                    # Logoff events
                    $username = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetUserName' } | Select-Object -ExpandProperty '#text'
                    $domain = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetDomainName' } | Select-Object -ExpandProperty '#text'
                    $logonId = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetLogonId' } | Select-Object -ExpandProperty '#text'
                    $logonType = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'LogonType' } | Select-Object -ExpandProperty '#text'
                    $logonType = Get-LogonTypeDescription -LogonType ([int]$logonType)
                }
                4648 {
                    # Explicit credential logon
                    $username = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetUserName' } | Select-Object -ExpandProperty '#text'
                    $domain = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetDomainName' } | Select-Object -ExpandProperty '#text'
                    $logonId = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'SubjectLogonId' } | Select-Object -ExpandProperty '#text'
                    $targetServer = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetServerName' } | Select-Object -ExpandProperty '#text'
                    $workstation = $targetServer
                }
                { $_ -in @(4778, 4779) } {
                    # Session reconnection/disconnection
                    $username = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'AccountName' } | Select-Object -ExpandProperty '#text'
                    $domain = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'AccountDomain' } | Select-Object -ExpandProperty '#text'
                    $logonId = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'LogonID' } | Select-Object -ExpandProperty '#text'
                    $sessionName = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'SessionName' } | Select-Object -ExpandProperty '#text'
                }
                4672 {
                    # Special privileges
                    $username = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'SubjectUserName' } | Select-Object -ExpandProperty '#text'
                    $domain = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'SubjectDomainName' } | Select-Object -ExpandProperty '#text'
                    $logonId = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'SubjectLogonId' } | Select-Object -ExpandProperty '#text'
                    $isElevated = $true  # 4672 events are always elevated

                    # Store the elevation status
                    $ElevatedSessions[$logonId] = $true
                }
                { $_ -in @(4800, 4801, 4802, 4803) } {
                    # Workstation lock/unlock and screensaver events
                    $username = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetUserName' } | Select-Object -ExpandProperty '#text'
                    $domain = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetDomainName' } | Select-Object -ExpandProperty '#text'
                    $logonId = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'TargetLogonId' } | Select-Object -ExpandProperty '#text'
                    $sessionName = $eventXML.Event.EventData.Data | Where-Object { $_.Name -eq 'SessionName' } | Select-Object -ExpandProperty '#text'
                }
            }

            # For all other event types, check if the session is known to be elevated
            if ($logonId -and $ElevatedSessions.ContainsKey($logonId)) {
                $isElevated = $true
            }


            # Skip system accounts unless explicitly requested
            if (-not $IncludeSystem -and
                ($username -match '^(SYSTEM|NETWORK SERVICE|LOCAL SERVICE|DWM-\d+|UMFD-\d+)$' -or
                $username -match '\$$' -or
                $domain -eq 'NT AUTHORITY')) {
                Write-LogMessage "Skipping system account: $username" -Level Debug
                continue
            }

            # Create event record with all possible fields
            $eventRecord = [PSCustomObject]@{
                Timestamp = $event.TimeCreated
                EventType = $EventMap[$event.Id]
                EventId = $event.Id
                Username = $username
                Domain = $domain
                LogonId = $logonId
                LinkedLogonId = $linkedLogonId
                WorkstationName = $workstation
                IPAddress = $ipAddress
                LogonType = $logonType
                SessionName = $sessionName
                Status = $status
                FailureReason = $failureReason
                IsElevated = $isElevated
                SecurityId = $eventXML.Event.EventData.Data |
                    Where-Object { $_.Name -eq 'SubjectUserSid' -or $_.Name -eq 'TargetUserSid' } |
                    Select-Object -First 1 -ExpandProperty '#text'
            }

            # Add to collection if we have valid username
            if (-not [string]::IsNullOrEmpty($username)) {
                $Events += $eventRecord
                Write-LogMessage "Added event: $($eventRecord.EventType) for user $username with LogonId $logonId (Elevated: $isElevated)" -Level Debug
            }

        } catch {
            Write-LogMessage "Error processing event $($event.Id): $_" -Level Warning
            continue
        }
    }

    # Clean up the Events collection before sorting and exporting
    $CleanEvents = $Events | Where-Object {
        $null -ne $_ -and
        $null -ne $_.Timestamp -and
        $null -ne $_.Username
    }

    # Sort events by timestamp
    $SortedEvents = $CleanEvents | Sort-Object { $_.Timestamp }

    # Export to CSV, removing empty rows
    $fullOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
    $SortedEvents | Where-Object { $null -ne $_ } | Export-Csv -Path $fullOutputPath -NoTypeInformation

    Write-LogMessage "`nCollection complete:"
Write-LogMessage "Total events collected: $($Events.Count)"
    Write-LogMessage "Output written to: $fullOutputPath"

    # Show example sequences if requested
    if ($ShowExamples -and $Events.Count -gt 0) {
        Write-LogMessage "`nExample session sequences:"
        $SortedEvents | Group-Object LogonId | Select-Object -First 3 | ForEach-Object {
            Write-LogMessage "`nSession ID: $($_.Name)"
            $_.Group | Format-Table Timestamp, EventType, Username, LogonId, LinkedLogonId, SessionName, IsElevated -AutoSize
        }
    }

} catch {
    Write-LogMessage "An error occurred: $_" -Level Error
    Write-LogMessage "Error details: $($_.Exception.Message)" -Level Error
    Write-LogMessage "Stack trace: $($_.ScriptStackTrace)" -Level Error
    throw $_
} finally {
    # Clean up any resources if needed
    Write-LogMessage "Script execution completed" -Level Debug
}

# Display usage help if requested
if ($Help) {
    @"
Windows User Activity Logger
Usage: .\Get-UserActivityLogs.ps1 [-DaysBack <days>] [-IncludeSystem] [-Debug] [-OutputPath <path>] [-ShowExamples]

Parameters:
  -DaysBack     : Number of days to look back (default: 30)
  -IncludeSystem: Include system account activities
  -Debug        : Enable detailed debug logging
  -OutputPath   : Custom path for CSV output
  -ShowExamples : Show example session sequences

Examples:
  .\Get-UserActivityLogs.ps1
  .\Get-UserActivityLogs.ps1 -DaysBack 7
  .\Get-UserActivityLogs.ps1 -IncludeSystem -Debug
  .\Get-UserActivityLogs.ps1 -OutputPath "C:\Logs\activity.csv"
"@ | Write-Host
}

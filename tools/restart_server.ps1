[CmdletBinding()]
param(
    [string]$IPAddress,
    [ValidateRange(1, 65535)][int]$HttpPort = 8001,
    [ValidateRange(1, 65535)][int]$HttpsPort = 8443,
    [string]$DataDir = 'server-data\nanum-demo',
    [string]$PythonPath,
    [ValidateRange(1, 120)][int]$ReadyTimeoutSeconds = 20,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
if ($HttpPort -eq $HttpsPort) {
    throw 'HTTP and HTTPS ports must be different.'
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$resolvedDataDir = if ([System.IO.Path]::IsPathRooted($DataDir)) {
    [System.IO.Path]::GetFullPath($DataDir)
} else {
    [System.IO.Path]::GetFullPath((Join-Path $projectRoot $DataDir))
}

if (-not $IPAddress) {
    $candidates = @(
        foreach ($configuration in (Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' })) {
            foreach ($address in $configuration.IPv4Address) {
                $value = $address.IPAddress
                if ($value -match '^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$') {
                    [pscustomobject]@{
                        IPAddress = $value
                        HasDefaultGateway = [bool]$configuration.IPv4DefaultGateway
                        IsPreferred192 = $value -like '192.168.*'
                    }
                }
            }
        }
    )
    $address = $candidates |
        Sort-Object @{ Expression = { if ($_.HasDefaultGateway) { 0 } else { 1 } } },
                    @{ Expression = { if ($_.IsPreferred192) { 0 } else { 1 } } } |
        Select-Object -First 1
    if ($address) { $IPAddress = $address.IPAddress }
}
if (-not $IPAddress) {
    throw 'Could not find an active private IPv4 address (10.x, 172.16-31.x, or 192.168.x). Connect to Wi-Fi/Ethernet or supply -IPAddress explicitly.'
}

$setupScript = Join-Path $PSScriptRoot 'setup_lan_https.ps1'
$setupParameters = @{
    IPAddress = $IPAddress
    DataDir = $resolvedDataDir
}
if ($Force) { $setupParameters.Force = $true }
& $setupScript @setupParameters
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw 'LAN HTTPS certificate setup failed. The existing server has not been stopped.'
}

if (-not $PythonPath) {
    $pythonCommand = Get-Command python.exe -ErrorAction SilentlyContinue
    if ($pythonCommand) { $PythonPath = $pythonCommand.Source }
}
if (-not $PythonPath -or -not (Test-Path -LiteralPath $PythonPath)) {
    throw 'python.exe was not found. Supply its full path with -PythonPath.'
}

function Get-PortOwnerIds([int]$Port) {
    return @(
        Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
    )
}

$owners = @()
foreach ($port in @($HttpPort, $HttpsPort)) {
    foreach ($ownerId in (Get-PortOwnerIds $port)) {
        if ($owners -notcontains [int]$ownerId) { $owners += [int]$ownerId }
    }
}

$processesToStop = @()
$pidFile = Join-Path $resolvedDataDir 'fitshare-server.pid'
$managedPid = $null
if (Test-Path -LiteralPath $pidFile) {
    $pidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
    $parsedPid = 0
    if ([int]::TryParse($pidText, [ref]$parsedPid)) { $managedPid = $parsedPid }
}
foreach ($ownerId in $owners) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
    if (-not $owner) { continue }
    if ($owner.Name -notin @('python.exe', 'pythonw.exe') -or
        $owner.CommandLine -notmatch '(?i)(?:^|\s|\\)server\.py(?:"|\s|$)' -or
        $managedPid -ne [int]$owner.ProcessId) {
        throw "Port $port is occupied by PID $ownerId ($($owner.Name)), not a managed FitShare server. No processes were stopped."
    }
    $processesToStop += $owner
}

foreach ($owner in $processesToStop) {
    Stop-Process -Id $owner.ProcessId -Force
}
$stopDeadline = [DateTime]::UtcNow.AddSeconds(10)
while ([DateTime]::UtcNow -lt $stopDeadline) {
    $remaining = @()
    foreach ($port in @($HttpPort, $HttpsPort)) {
        $remaining += Get-PortOwnerIds $port
    }
    if (@($remaining | Where-Object { $_ -in $owners }).Count -eq 0) { break }
    Start-Sleep -Milliseconds 200
}
$stillRunning = @()
foreach ($port in @($HttpPort, $HttpsPort)) {
    $stillRunning += Get-PortOwnerIds $port
}
if (@($stillRunning | Where-Object { $_ -in $owners }).Count -gt 0) {
    throw 'The old FitShare process did not release its listening ports in time.'
}

New-Item -ItemType Directory -Path $resolvedDataDir -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$stdoutLog = Join-Path $resolvedDataDir "server-$timestamp.stdout.log"
$stderrLog = Join-Path $resolvedDataDir "server-$timestamp.stderr.log"

$environmentNames = @(
    'FITSHARE_HOST',
    'PORT',
    'FITSHARE_TLS_PORT',
    'FITSHARE_DATA_DIR',
    'FITSHARE_TLS_CERT_FILE',
    'FITSHARE_TLS_KEY_FILE'
)
$previousEnvironment = @{}
foreach ($name in $environmentNames) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
[Environment]::SetEnvironmentVariable('FITSHARE_HOST', '0.0.0.0', 'Process')
[Environment]::SetEnvironmentVariable('PORT', [string]$HttpPort, 'Process')
[Environment]::SetEnvironmentVariable('FITSHARE_TLS_PORT', [string]$HttpsPort, 'Process')
[Environment]::SetEnvironmentVariable('FITSHARE_DATA_DIR', $resolvedDataDir, 'Process')
[Environment]::SetEnvironmentVariable('FITSHARE_TLS_CERT_FILE', (Join-Path $resolvedDataDir 'certs\fitshare-demo-server.crt'), 'Process')
[Environment]::SetEnvironmentVariable('FITSHARE_TLS_KEY_FILE', (Join-Path $resolvedDataDir 'certs\fitshare-demo-server.key'), 'Process')

try {
    $newProcess = Start-Process -FilePath $PythonPath -ArgumentList @('-u', 'server.py') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
} finally {
    foreach ($name in $environmentNames) {
        [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
    }
}

$readyDeadline = [DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
$httpReady = $false
$httpsReady = $false
while ([DateTime]::UtcNow -lt $readyDeadline) {
    $newProcess.Refresh()
    if ($newProcess.HasExited) { break }
    $httpReady = (Get-PortOwnerIds $HttpPort) -contains $newProcess.Id
    $httpsReady = (Get-PortOwnerIds $HttpsPort) -contains $newProcess.Id
    if ($httpReady -and $httpsReady) { break }
    Start-Sleep -Milliseconds 250
}

if (-not $httpReady -or -not $httpsReady) {
    $newProcess.Refresh()
    if (-not $newProcess.HasExited) {
        $newOwner = Get-CimInstance Win32_Process -Filter "ProcessId = $($newProcess.Id)"
        if ($newOwner -and $newOwner.CommandLine -match '(?i)server\.py(?:"|\s|$)') {
            Stop-Process -Id $newProcess.Id -Force
        }
    }
    $logTail = @()
    if (Test-Path -LiteralPath $stderrLog) { $logTail = Get-Content -LiteralPath $stderrLog -Tail 20 }
    throw ("FitShare did not start on both ports. See {0}{1}{2}" -f $stderrLog, [Environment]::NewLine, ($logTail -join [Environment]::NewLine))
}

Write-Output "Stopped FitShare process IDs: $($owners -join ', ')"
Set-Content -LiteralPath $pidFile -Value $newProcess.Id -NoNewline
Write-Output "Started FitShare server PID: $($newProcess.Id)"
Write-Output ("HTTP URL: http://{0}:{1}/" -f $IPAddress, $HttpPort)
Write-Output ("HTTPS URL: https://{0}:{1}/" -f $IPAddress, $HttpsPort)
Write-Output ("CA download URL: http://{0}:{1}/api/demo-ca" -f $IPAddress, $HttpPort)
Write-Output "Server logs: $stdoutLog and $stderrLog"

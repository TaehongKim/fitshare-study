param(
    [string]$IPAddress,
    [string]$DataDir = 'server-data\nanum-demo',
    [string]$OpenSslPath,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$storage = if ([System.IO.Path]::IsPathRooted($DataDir)) {
    [System.IO.Path]::GetFullPath($DataDir)
} else {
    [System.IO.Path]::GetFullPath((Join-Path $projectRoot $DataDir))
}
$certificateDirectory = Join-Path $storage 'certs'
$caKey = Join-Path $certificateDirectory 'fitshare-demo-ca.key'
$caCertificate = Join-Path $certificateDirectory 'fitshare-demo-ca.crt'
$serverKey = Join-Path $certificateDirectory 'fitshare-demo-server.key'
$serverCertificate = Join-Path $certificateDirectory 'fitshare-demo-server.crt'

if (-not $IPAddress) {
    $adapterAddress = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -like '192.168.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
        Select-Object -First 1
    if ($adapterAddress) { $IPAddress = $adapterAddress.IPAddress }
}
$parsedAddress = $null
if (-not [System.Net.IPAddress]::TryParse($IPAddress, [ref]$parsedAddress) -or
    $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
    throw 'Provide a valid IPv4 LAN address with -IPAddress.'
}

if (-not $OpenSslPath) {
    $opensslCandidates = @(
        (Join-Path $env:ProgramFiles 'Git\usr\bin\openssl.exe'),
        (Join-Path $env:ProgramFiles 'Git\mingw64\bin\openssl.exe')
    )
    $OpenSslPath = $opensslCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $OpenSslPath) {
        $opensslCommand = Get-Command openssl.exe -ErrorAction SilentlyContinue
        if ($opensslCommand) { $OpenSslPath = $opensslCommand.Source }
    }
}
if (-not $OpenSslPath -or -not (Test-Path -LiteralPath $OpenSslPath)) {
    throw 'OpenSSL was not found. Git for Windows includes openssl.exe.'
}

function Invoke-OpenSsl([string[]]$Arguments) {
    & $OpenSslPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "OpenSSL command failed: openssl $($Arguments -join ' ')"
    }
}

function New-DemoServerCertificate([string]$Address) {
    $serverCsr = Join-Path $certificateDirectory 'fitshare-demo-server.csr'
    $extensionsPath = Join-Path $certificateDirectory 'fitshare-demo-extensions.cnf'
    Invoke-OpenSsl @(
        'req', '-new', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', $serverKey,
        '-out', $serverCsr,
        '-subj', "/CN=$Address"
    )

    @"
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=IP:$Address
authorityKeyIdentifier=keyid,issuer
"@ | Set-Content -LiteralPath $extensionsPath -Encoding ASCII

    Invoke-OpenSsl @(
        'x509', '-req',
        '-in', $serverCsr,
        '-CA', $caCertificate, '-CAkey', $caKey, '-CAcreateserial',
        '-out', $serverCertificate, '-days', '365', '-sha256',
        '-extfile', $extensionsPath
    )
    Remove-Item -LiteralPath $serverCsr, $extensionsPath -Force
    $serial = Join-Path $certificateDirectory 'fitshare-demo-ca.srl'
    if (Test-Path -LiteralPath $serial) { Remove-Item -LiteralPath $serial -Force }
}

New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null
$existingFiles = @($caKey, $caCertificate, $serverKey, $serverCertificate) |
    Where-Object { Test-Path -LiteralPath $_ }
if ($existingFiles.Count -eq 4 -and -not $Force) {
    & $OpenSslPath x509 -in $serverCertificate -checkip $IPAddress -noout 2>$null
    if ($LASTEXITCODE -eq 0) {
        $fingerprint = (& $OpenSslPath x509 -in $caCertificate -noout -fingerprint -sha256) -join ''
        Write-Output "LAN IP: $IPAddress"
        Write-Output "HTTPS server certificate: $serverCertificate"
        Write-Output "HTTPS server private key: $serverKey"
        Write-Output ("Phone CA download: http://{0}:8001/api/demo-ca" -f $IPAddress)
        Write-Output ("FitShare HTTPS URL: https://{0}:8443/" -f $IPAddress)
        Write-Output "CA fingerprint: $fingerprint"
        Write-Output 'Before trusting the CA, compare its SHA-256 fingerprint on the phone with the value printed above.'
        return
    }
    Write-Output "IP $IPAddress does NOT match the existing server certificate; renewing only the server certificate and preserving the demo CA."
    New-DemoServerCertificate $IPAddress
    $fingerprint = (& $OpenSslPath x509 -in $caCertificate -noout -fingerprint -sha256) -join ''
    Write-Output "LAN IP: $IPAddress"
    Write-Output "HTTPS server certificate: $serverCertificate"
    Write-Output "HTTPS server private key: $serverKey"
    Write-Output ("Phone CA download: http://{0}:8001/api/demo-ca" -f $IPAddress)
    Write-Output ("FitShare HTTPS URL: https://{0}:8443/" -f $IPAddress)
    Write-Output "CA fingerprint: $fingerprint"
    Write-Output 'The existing demo CA was preserved, so a previously trusted CA does not need to be installed again.'
    return
}
if ($existingFiles.Count -gt 0 -and -not $Force) {
    throw 'Some demo certificate files already exist. Re-run with -Force to replace only the listed demo certificate files.'
}
if ($Force) {
    if ($existingFiles.Count -gt 0) {
        Write-Warning 'Force replaces the demo CA and server certificate; reinstall the downloaded CA on phones that use HTTPS camera access.'
    }
    @($caKey, $caCertificate, $serverKey, $serverCertificate,
      (Join-Path $certificateDirectory 'fitshare-demo-server.csr'),
      (Join-Path $certificateDirectory 'fitshare-demo-extensions.cnf'),
      (Join-Path $certificateDirectory 'fitshare-demo-ca.srl')) |
        Where-Object { Test-Path -LiteralPath $_ } |
        ForEach-Object { Remove-Item -LiteralPath $_ -Force }
}

Invoke-OpenSsl @(
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', $caKey, '-out', $caCertificate, '-days', '3650', '-sha256',
    '-subj', '/CN=FitShare Demo Local CA',
    '-addext', 'basicConstraints=critical,CA:TRUE',
    '-addext', 'keyUsage=critical,keyCertSign,cRLSign'
)
New-DemoServerCertificate $IPAddress

$fingerprint = (& $OpenSslPath x509 -in $caCertificate -noout -fingerprint -sha256) -join ''
Write-Output "LAN IP: $IPAddress"
Write-Output "HTTPS server certificate: $serverCertificate"
Write-Output "HTTPS server private key: $serverKey"
Write-Output ("Phone CA download: http://{0}:8001/api/demo-ca" -f $IPAddress)
Write-Output ("FitShare HTTPS URL: https://{0}:8443/" -f $IPAddress)
Write-Output "CA fingerprint: $fingerprint"
Write-Output 'Before trusting the CA, compare its SHA-256 fingerprint on the phone with the value printed above.'

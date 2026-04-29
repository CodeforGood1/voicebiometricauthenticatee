$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$backendDir = Join-Path $repoRoot 'backend'
$mainFile = Join-Path $backendDir 'main.py'
$port = 8765

if (-not (Test-Path $mainFile)) {
    throw "Could not find backend\main.py in $backendDir"
}

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
$launchFile = $null
$launchArgs = @('-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', $port)

if ($pythonCommand) {
    $launchFile = $pythonCommand.Source
} else {
    $pyCommand = Get-Command py -ErrorAction SilentlyContinue
    if ($pyCommand) {
        $launchFile = $pyCommand.Source
        $launchArgs = @('-3') + $launchArgs
    }
}

if (-not $launchFile) {
    throw 'Python was not found on PATH. Install Python 3.10+ and run this script again.'
}

Start-Process -FilePath $launchFile -ArgumentList $launchArgs -WorkingDirectory $backendDir

$ready = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200 -and $response.Content -match 'Voice Biometric Access') {
            $ready = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 1
    }
}

if ($ready) {
    Start-Process "http://127.0.0.1:$port/"
    Write-Host "Voice Biometric Local is ready at http://127.0.0.1:$port/"
} else {
    Write-Host "The backend started, but the UI was not ready yet. Open http://127.0.0.1:$port/ manually after a few seconds."
}

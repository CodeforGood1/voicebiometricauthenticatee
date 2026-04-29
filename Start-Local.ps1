$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$backendDir = Join-Path $repoRoot 'backend'
$mainFile = Join-Path $backendDir 'main.py'

if (-not (Test-Path $mainFile)) {
    throw "Could not find backend\main.py in $backendDir"
}

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
$launchFile = $null
$launchArgs = @('-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000')

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
Start-Process 'http://127.0.0.1:8000'
Write-Host 'Voice Biometric Local is starting at http://127.0.0.1:8000'

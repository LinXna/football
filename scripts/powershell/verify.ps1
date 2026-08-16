param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
Set-Location $projectRoot

function Invoke-Step([string]$Name, [scriptblock]$Action) {
    Write-Host "[verify] $Name"
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
}

Invoke-Step 'TypeScript check' { & .\node_modules\.bin\tsc.cmd --noEmit }
Invoke-Step 'Python tests' { & python -m unittest discover -s tests -p 'test_*.py' }
if (-not $SkipBuild) {
    Invoke-Step 'Production build' { & npm run build --ignore-scripts }
}

$stdoutPath = Join-Path $env:TEMP 'lx-football-verify.stdout.log'
$stderrPath = Join-Path $env:TEMP 'lx-football-verify.stderr.log'
Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
$server = Start-Process -FilePath 'node.exe' `
    -ArgumentList @('.\node_modules\tsx\dist\cli.mjs', '--env-file-if-exists=.env', 'server.ts') `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru

try {
    $health = $null
    for ($attempt = 0; $attempt -lt 10 -and -not $health; $attempt++) {
        Start-Sleep -Milliseconds 500
        try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 2 } catch { }
    }
    if (-not $health -or $health.status -ne 'ok') {
        $details = (Get-Content -LiteralPath $stdoutPath, $stderrPath -Raw -ErrorAction SilentlyContinue) -join "`n"
        throw "Health check failed. $details"
    }
    Write-Host "[verify] Health check passed ($($health.environment))"
} finally {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
}

Write-Host '[verify] All checks passed.'

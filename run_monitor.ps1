param(
    [int]$IntervalSeconds = 60,
    [string]$Provider = "auto"
)

$ErrorActionPreference = "Stop"
$runner = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "run_daily.ps1"
Write-Host "Live monitor started. Press Ctrl+C to stop."

while ($true) {
    try {
        & $runner -Provider $Provider
    }
    catch {
        Write-Warning $_
    }
    Start-Sleep -Seconds ([Math]::Max(30, $IntervalSeconds))
}

param(
    [int]$MaxSnapshotGapSeconds = 180,
    [int]$MaxFileAgeSeconds = 900
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$downloadFolder = Join-Path $env:USERPROFILE "Downloads"
$outputFolder = Join-Path $projectRoot "output"
New-Item -ItemType Directory -Path $outputFolder -Force | Out-Null

function Get-LatestExport([string]$Pattern) {
    Get-ChildItem -LiteralPath $downloadFolder -Filter $Pattern -File |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
}

function Get-LatestFastLeisuExport {
    $files = @(
        Get-ChildItem -LiteralPath $downloadFolder -Filter "leisu_live_*.json" -File |
            Sort-Object LastWriteTimeUtc -Descending
    )
    foreach ($file in $files) {
        try {
            $payload = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 |
                ConvertFrom-Json
            if ($payload.export_profile -eq "fast") {
                return $file
            }
        } catch {
            continue
        }
    }
    return $files | Select-Object -First 1
}

function Get-CapturedAt([System.IO.FileInfo]$File) {
    $payload = Get-Content -LiteralPath $File.FullName -Raw -Encoding UTF8 |
        ConvertFrom-Json
    if (-not $payload.captured_at) {
        throw "Export is missing captured_at: $($File.FullName)"
    }
    [DateTimeOffset]::Parse($payload.captured_at)
}

$ybty = Get-LatestExport "ybty_live_*.json"
$leisu = Get-LatestFastLeisuExport
if (-not $ybty) { throw "No YBTY export was found in Downloads." }
if (-not $leisu) { throw "No Leisu export was found in Downloads." }

$ybtyTime = Get-CapturedAt $ybty
$leisuTime = Get-CapturedAt $leisu
$now = [DateTimeOffset]::UtcNow
$gapSeconds = [Math]::Abs(($ybtyTime - $leisuTime).TotalSeconds)
$ybtyAge = ($now - $ybtyTime).TotalSeconds
$leisuAge = ($now - $leisuTime).TotalSeconds

if ($gapSeconds -gt $MaxSnapshotGapSeconds) {
    throw "Snapshot gap is $([Math]::Round($gapSeconds)) seconds; limit is $MaxSnapshotGapSeconds seconds."
}
if ($ybtyAge -gt $MaxFileAgeSeconds -or $leisuAge -gt $MaxFileAgeSeconds) {
    throw "Exports are stale: YBTY=$([Math]::Round($ybtyAge))s, Leisu=$([Math]::Round($leisuAge))s."
}

$ybtyLatest = Join-Path $outputFolder "ybty_latest.json"
$leisuLatest = Join-Path $outputFolder "leisu_latest.json"
Copy-Item -LiteralPath $ybty.FullName -Destination $ybtyLatest -Force
Copy-Item -LiteralPath $leisu.FullName -Destination $leisuLatest -Force

$candidateFile = Join-Path $outputFolder "ybty_leisu_candidates.json"
$decisionFile = Join-Path $outputFolder "ybty_leisu_decisions.json"
$ledgerFile = Join-Path $outputFolder "recommendation_ledger.json"
if (Test-Path -LiteralPath $ledgerFile) {
    & python (Join-Path $projectRoot "review_recommendations.py") $leisuLatest `
        --ledger $ledgerFile
}
& python (Join-Path $projectRoot "football_live.py") $ybtyLatest `
    --live-fixture $leisuLatest --output $candidateFile
if ($LASTEXITCODE -ne 0) {
    throw "Match pipeline failed with exit code $LASTEXITCODE."
}

& python (Join-Path $projectRoot "recommend_live.py") $candidateFile `
    --output $decisionFile --ledger $ledgerFile
if ($LASTEXITCODE -ne 0) {
    throw "Decision pipeline failed with exit code $LASTEXITCODE."
}

$candidate = Get-Content -LiteralPath $candidateFile -Raw -Encoding UTF8 |
    ConvertFrom-Json
$decision = Get-Content -LiteralPath $decisionFile -Raw -Encoding UTF8 |
    ConvertFrom-Json
$status = [ordered]@{
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    ybty_file = $ybty.FullName
    leisu_file = $leisu.FullName
    snapshot_gap_seconds = [Math]::Round($gapSeconds, 1)
    ybty_age_seconds = [Math]::Round($ybtyAge, 1)
    leisu_age_seconds = [Math]::Round($leisuAge, 1)
    market_events = $candidate.summary.market_events
    live_events = $candidate.summary.live_events
    matched = $candidate.summary.matched
    unmatched = $candidate.summary.unmatched
    watch = $decision.summary.watch
    pass = $decision.summary.pass
    candidate_file = $candidateFile
    decision_file = $decisionFile
    ledger_file = $ledgerFile
}
$statusFile = Join-Path $outputFolder "pipeline_status.json"
$status | ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath $statusFile -Encoding UTF8
$status | Format-List

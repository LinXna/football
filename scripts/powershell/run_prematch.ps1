param(
    [int]$MaxSnapshotGapSeconds = 3600,
    [int]$MaxFileAgeSeconds = 3600
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
$downloadFolder = Join-Path $env:USERPROFILE "Downloads"
$outputFolder = Join-Path $projectRoot "output"
New-Item -ItemType Directory -Path $outputFolder -Force | Out-Null

function Get-LatestExport([string]$Pattern) {
    Get-ChildItem -LiteralPath $downloadFolder -Filter $Pattern -File |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
}

function Get-CapturedAt([System.IO.FileInfo]$File) {
    $payload = Get-Content -LiteralPath $File.FullName -Raw -Encoding UTF8 |
        ConvertFrom-Json
    if (-not $payload.captured_at) {
        throw "Export is missing captured_at: $($File.FullName)"
    }
    [DateTimeOffset]::Parse($payload.captured_at)
}

$ybty = Get-LatestExport "ybty_prematch_*.json"
$leisu = Get-LatestExport "leisu_prematch_*.json"
if (-not $ybty -and (Test-Path -LiteralPath (Join-Path $outputFolder "ybty_prematch_latest.json"))) {
    $ybty = Get-Item -LiteralPath (Join-Path $outputFolder "ybty_prematch_latest.json")
}
if (-not $leisu -and (Test-Path -LiteralPath (Join-Path $outputFolder "leisu_prematch_latest.json"))) {
    $leisu = Get-Item -LiteralPath (Join-Path $outputFolder "leisu_prematch_latest.json")
}
if (-not $ybty) { throw "No YBTY export was found in Downloads." }
if (-not $leisu) { throw "No Leisu export was found in Downloads." }

$ybtyTime = Get-CapturedAt $ybty
$leisuTime = Get-CapturedAt $leisu
$now = [DateTimeOffset]::UtcNow
$gapSeconds = [Math]::Abs(($ybtyTime - $leisuTime).TotalSeconds)
$ybtyAge = ($now - $ybtyTime).TotalSeconds
$leisuAge = ($now - $leisuTime).TotalSeconds
if ($gapSeconds -gt $MaxSnapshotGapSeconds) {
    throw "Export time gap is $([Math]::Round($gapSeconds)) seconds; prematch limit is $MaxSnapshotGapSeconds seconds. Re-export the older source."
}
if ($ybtyAge -gt $MaxFileAgeSeconds -or $leisuAge -gt $MaxFileAgeSeconds) {
    throw "Exports are stale: YBTY=$([Math]::Round($ybtyAge)) seconds, Leisu=$([Math]::Round($leisuAge)) seconds. Re-export both sources."
}

$ybtyLatest = Join-Path $outputFolder "ybty_prematch_latest.json"
$leisuLatest = Join-Path $outputFolder "leisu_prematch_latest.json"
if ($ybty.FullName -ne $ybtyLatest) {
    Copy-Item -LiteralPath $ybty.FullName -Destination $ybtyLatest -Force
}
if ($leisu.FullName -ne $leisuLatest) {
    Copy-Item -LiteralPath $leisu.FullName -Destination $leisuLatest -Force
}

$candidateFile = Join-Path $outputFolder "ybty_leisu_prematch_candidates.json"
$decisionFile = Join-Path $outputFolder "ybty_leisu_prematch_decisions.json"
$briefFile = Join-Path $outputFolder "prematch_ai_brief.json"
& python (Join-Path $projectRoot "football_live.py") $ybtyLatest `
    --live-fixture $leisuLatest --mode prematch --output $candidateFile
if ($LASTEXITCODE -ne 0) {
    throw "Prematch match pipeline failed with exit code $LASTEXITCODE."
}
& python (Join-Path $projectRoot "recommend_prematch.py") $candidateFile `
    --output $decisionFile --brief-output $briefFile
if ($LASTEXITCODE -ne 0) {
    throw "Prematch assessment failed with exit code $LASTEXITCODE."
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
    market_events = $candidate.summary.market_events
    prematch_events = $candidate.summary.prematch_events
    matched = $candidate.summary.matched
    unmatched = $candidate.summary.unmatched
    learned_aliases = $candidate.summary.learned_aliases
    auto_aliases_total = $candidate.summary.auto_aliases_total
    research = $decision.summary.research
    pass = $decision.summary.pass
    candidate_file = $candidateFile
    decision_file = $decisionFile
    ai_brief_file = $briefFile
}
$statusFile = Join-Path $outputFolder "prematch_pipeline_status.json"
$status | ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath $statusFile -Encoding UTF8
$status | Format-List

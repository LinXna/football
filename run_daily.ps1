param(
    [string]$Provider = "auto",
    [string]$MarketFile = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceFolder = Join-Path $projectRoot "sources"
$dateToken = Get-Date -Format "yyyyMMdd"
$datedFile = Join-Path $sourceFolder "soccer_odds_$dateToken.json"
$primeFile = Join-Path $sourceFolder "prime_market_data_for_ai.json"
$marketFiles = @()

if ($MarketFile) {
    $resolvedMarketFile = (Resolve-Path -LiteralPath $MarketFile).Path
    $marketFiles += $resolvedMarketFile
} else {
    if (Test-Path -LiteralPath $datedFile) {
        $marketFiles += $datedFile
    }
    if (Test-Path -LiteralPath $primeFile) {
        $marketFiles += $primeFile
    }
}
if ($marketFiles.Count -eq 0) {
    throw "No market JSON found in $sourceFolder"
}

$outputFile = Join-Path $projectRoot "output\live_candidates_$dateToken.json"
& python (Join-Path $projectRoot "football_live.py") @marketFiles --provider $Provider --output $outputFile
if ($LASTEXITCODE -ne 0) {
    throw "Live collection failed with exit code $LASTEXITCODE"
}

$decisionFile = Join-Path $projectRoot "output\live_decisions_$dateToken.json"
& python (Join-Path $projectRoot "recommend_live.py") $outputFile --output $decisionFile
if ($LASTEXITCODE -ne 0) {
    throw "Live decision layer failed with exit code $LASTEXITCODE"
}

Write-Host "Daily live candidate file: $outputFile"
Write-Host "Daily live decision file: $decisionFile"

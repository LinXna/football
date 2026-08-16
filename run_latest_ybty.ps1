param([Parameter(ValueFromRemainingArguments=$true)][object[]]$Arguments)
& (Join-Path $PSScriptRoot 'scripts\powershell\run_latest_ybty.ps1') @Arguments
exit $LASTEXITCODE

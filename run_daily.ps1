param([Parameter(ValueFromRemainingArguments=$true)][object[]]$Arguments)
& (Join-Path $PSScriptRoot 'scripts\powershell\run_daily.ps1') @Arguments
exit $LASTEXITCODE

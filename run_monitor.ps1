param([Parameter(ValueFromRemainingArguments=$true)][object[]]$Arguments)
& (Join-Path $PSScriptRoot 'scripts\powershell\run_monitor.ps1') @Arguments
exit $LASTEXITCODE

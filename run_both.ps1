param([Parameter(ValueFromRemainingArguments=$true)][object[]]$Arguments)
& (Join-Path $PSScriptRoot 'scripts\powershell\run_both.ps1') @Arguments
exit $LASTEXITCODE

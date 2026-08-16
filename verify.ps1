param([switch]$SkipBuild)

& (Join-Path $PSScriptRoot 'scripts\powershell\verify.ps1') @PSBoundParameters
exit $LASTEXITCODE

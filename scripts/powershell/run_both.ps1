$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))
& (Join-Path $projectRoot "scripts\powershell\run_latest_ybty.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "滚球分析运行失败。"
}
& (Join-Path $projectRoot "scripts\powershell\run_prematch.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "非滚球分析运行失败。"
}

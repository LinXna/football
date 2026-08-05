$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $projectRoot "run_latest_ybty.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "滚球分析运行失败。"
}
& (Join-Path $projectRoot "run_prematch.ps1")
if ($LASTEXITCODE -ne 0) {
    throw "非滚球分析运行失败。"
}

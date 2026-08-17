# Regenerates template.html (and refreshes the shared scripts + src/engine.js)
# from the personal tracker repo this toolkit was forked from. Since 2026-08-16
# late this is a thin wrapper: the personal repo keeps the source tree
# (src/page.html, styles.css, engine.js, app.js + data/) and its build.ps1
# assembles both pages -- with -Template it swaps the SITE identity block, title
# and brand for generic values (asserted; it refuses to write if a personal
# string survives) and empties the scores block.
#
# Only relevant if you're maintaining this toolkit itself, not using it.
$ErrorActionPreference = 'Stop'
$build = Join-Path (Split-Path $PSScriptRoot -Parent) 'mini-benchmarks-tracker\build.ps1'
if (-not (Test-Path $build)) { Write-Output "Personal repo's build.ps1 not found: $build"; exit 1 }
& $build -Template -ToolkitDir $PSScriptRoot

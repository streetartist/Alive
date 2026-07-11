[CmdletBinding()]
param(
  [string]$OutputName = "stage-tamagotchi-win-unpacked-runnable-verified.zip",
  [switch]$SkipBuild,
  [switch]$SkipLaunchVerification,
  [switch]$LaunchAfterVerification,
  [switch]$KeepWorkDirectories
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Remove-GeneratedDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$AllowedParent
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
  $resolvedParent = (Resolve-Path -LiteralPath $AllowedParent).Path.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  if (-not $resolvedPath.StartsWith($resolvedParent + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove generated directory outside '$resolvedParent': $resolvedPath"
  }

  Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

function Get-InstalledPackageVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PackageName
  )

  $version = node -e "const name = process.argv[1]; console.log(require(require.resolve(name + '/package.json')).version)" $PackageName
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($version)) {
    throw "Unable to resolve installed version for '$PackageName'. Run 'pnpm install' first."
  }
  return $version.Trim()
}

function Stop-ProcessTree {
  param(
    [Parameter(Mandatory = $true)]
    [int]$ProcessId
  )

  $childIds = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty ProcessId
  foreach ($childId in $childIds) {
    Stop-ProcessTree -ProcessId $childId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Assert-CommandAvailable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found in PATH."
  }
}

$appDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$workspaceDirectory = (Resolve-Path (Join-Path $appDirectory "..\..")).Path
$stagingDirectory = Join-Path $appDirectory ".electron-runnable-project"
$packageOutputName = "dist-runnable-$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))"
$packageOutputDirectory = Join-Path $appDirectory $packageOutputName
$unpackedDirectory = Join-Path $packageOutputDirectory "win-unpacked"
$zipPath = Join-Path $workspaceDirectory $OutputName
$zipTemporaryPath = "$zipPath.partial.zip"
$verificationDirectory = Join-Path ([IO.Path]::GetTempPath()) "airi-clean-unzip-runnable-$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))"
$completed = $false

Push-Location $appDirectory
try {
  Assert-CommandAvailable -Name "node"
  Assert-CommandAvailable -Name "npm"
  Assert-CommandAvailable -Name "pnpm"

  if (-not (Test-Path -LiteralPath (Join-Path $appDirectory "node_modules\electron\package.json"))) {
    Write-Host "[0/6] Workspace dependencies are missing; installing from the lockfile..."
    pnpm --dir $workspaceDirectory install --frozen-lockfile --prefer-offline
    if ($LASTEXITCODE -ne 0) {
      throw "Workspace dependency installation failed with exit code $LASTEXITCODE."
    }
  }

  if (-not $SkipBuild) {
    Write-Host "[1/6] Building desktop runtime packages and stage-tamagotchi..."
    pnpm --dir $workspaceDirectory --filter @proj-airi/desktop-control build
    if ($LASTEXITCODE -ne 0) {
      throw "Desktop-control package build failed with exit code $LASTEXITCODE."
    }
    pnpm --dir $workspaceDirectory --filter @proj-airi/pipelines-audio build
    if ($LASTEXITCODE -ne 0) {
      throw "Pipelines-audio package build failed with exit code $LASTEXITCODE."
    }
    pnpm run build
    if ($LASTEXITCODE -ne 0) {
      throw "Application build failed with exit code $LASTEXITCODE."
    }
  }

  if (-not (Test-Path -LiteralPath (Join-Path $appDirectory "out\main\index.js"))) {
    throw "Compiled main entry is missing. Run without -SkipBuild first."
  }

  Write-Host "[2/6] Creating clean packaging project..."
  Remove-GeneratedDirectory -Path $stagingDirectory -AllowedParent $appDirectory
  Remove-GeneratedDirectory -Path $packageOutputDirectory -AllowedParent $appDirectory
  New-Item -ItemType Directory -Path $stagingDirectory | Out-Null
  Copy-Item -LiteralPath (Join-Path $appDirectory "out") -Destination (Join-Path $stagingDirectory "out") -Recurse
  if (Test-Path -LiteralPath (Join-Path $appDirectory "resources")) {
    Copy-Item -LiteralPath (Join-Path $appDirectory "resources") -Destination (Join-Path $stagingDirectory "resources") -Recurse
  }

  $sourcePackage = Get-Content -Raw -LiteralPath (Join-Path $appDirectory "package.json") | ConvertFrom-Json
  $electronVersion = Get-InstalledPackageVersion -PackageName "electron"

  # These packages are externalized by the main-process bundle and therefore must
  # remain real production dependencies inside app.asar. Keep these exact versions
  # aligned with pnpm-lock.yaml when upgrading the desktop runtime dependency graph.
  $runtimeDependencies = [ordered]@{
    "@jimp/custom" = Get-InstalledPackageVersion -PackageName "@jimp/custom"
    "@nut-tree-fork/nut-js" = Get-InstalledPackageVersion -PackageName "@nut-tree-fork/nut-js"
    "@proj-airi/i18n" = "file:../../../packages/i18n"
    "electron-click-drag-plugin" = Get-InstalledPackageVersion -PackageName "electron-click-drag-plugin"
    # uiohook-napi loads this helper dynamically, so it is not linked at the app root.
    "node-gyp-build" = "4.8.4"
    "semver" = Get-InstalledPackageVersion -PackageName "semver"
    "uiohook-napi" = Get-InstalledPackageVersion -PackageName "uiohook-napi"
  }

  $stagingPackage = [ordered]@{
    name = "ai.moeru.airi"
    type = "module"
    version = $sourcePackage.version
    description = $sourcePackage.description
    main = "out/main/index.js"
    author = "Moeru AI"
    license = "MIT"
    dependencies = $runtimeDependencies
    build = [ordered]@{
      appId = "ai.moeru.airi"
      productName = "AIRI"
      electronVersion = $electronVersion
      directories = [ordered]@{
        output = "../$packageOutputName"
        buildResources = "../build"
      }
      files = @("out/**", "resources/**", "package.json", "node_modules/**")
      asar = $true
      asarUnpack = @("**/*.node")
      extraResources = @(
        [ordered]@{
          from = "../../../engines/stage-tamagotchi-godot/build/win"
          to = "godot-stage"
          filter = @("**/*")
        }
      )
      win = [ordered]@{ executableName = "airi" }
      npmRebuild = $false
    }
  }
  $stagingPackageJson = $stagingPackage | ConvertTo-Json -Depth 10
  [IO.File]::WriteAllText(
    (Join-Path $stagingDirectory "package.json"),
    $stagingPackageJson,
    [Text.UTF8Encoding]::new($false)
  )

  Write-Host "[3/6] Installing isolated runtime dependencies..."
  Push-Location $stagingDirectory
  try {
    npm install --ignore-scripts --no-package-lock
    if ($LASTEXITCODE -ne 0) {
      throw "Runtime dependency installation failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }

  Write-Host "[4/6] Packaging Windows application..."
  $electronBuilderCli = Get-ChildItem -Path (Join-Path $workspaceDirectory "node_modules\.pnpm\electron-builder@*\node_modules\electron-builder\out\cli\cli.js") |
    Select-Object -First 1 -ExpandProperty FullName
  if ([string]::IsNullOrWhiteSpace($electronBuilderCli)) {
    throw "electron-builder is not installed. Run 'pnpm install' in the workspace first."
  }
  Push-Location $stagingDirectory
  try {
    node $electronBuilderCli --dir
    if ($LASTEXITCODE -ne 0) {
      throw "electron-builder failed with exit code $LASTEXITCODE."
    }
  }
  finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath (Join-Path $unpackedDirectory "airi.exe"))) {
    throw "Packaged executable was not created."
  }

  Write-Host "[5/6] Creating runnable ZIP..."
  if (Test-Path -LiteralPath $zipTemporaryPath) {
    Remove-Item -LiteralPath $zipTemporaryPath -Force
  }
  Compress-Archive -Path (Join-Path $unpackedDirectory "*") -DestinationPath $zipTemporaryPath -CompressionLevel Optimal

  if (-not $SkipLaunchVerification) {
    Write-Host "[6/6] Verifying a clean extraction..."
    Remove-GeneratedDirectory -Path $verificationDirectory -AllowedParent ([IO.Path]::GetTempPath())
    Expand-Archive -LiteralPath $zipTemporaryPath -DestinationPath $verificationDirectory
    $executablePath = Join-Path $verificationDirectory "airi.exe"
    $stdoutPath = Join-Path $verificationDirectory "startup.stdout.log"
    $stderrPath = Join-Path $verificationDirectory "startup.stderr.log"
    $verificationProfile = Join-Path $verificationDirectory "user-data"
    $process = Start-Process -FilePath $executablePath -ArgumentList "--user-data-dir=$verificationProfile" -WorkingDirectory $verificationDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    Start-Sleep -Seconds 12
    $startupError = if (Test-Path -LiteralPath $stderrPath) { Get-Content -Raw -LiteralPath $stderrPath } else { "" }
    if ($process.HasExited) {
      throw "Clean-extracted app exited during startup with code $($process.ExitCode)."
    }
    if ($startupError -match "ERR_MODULE_NOT_FOUND|Uncaught Exception|A JavaScript error occurred") {
      Stop-ProcessTree -ProcessId $process.Id
      throw "Clean-extracted app reported a main-process startup error:`n$startupError"
    }
    Stop-ProcessTree -ProcessId $process.Id
  }
  else {
    Write-Host "[6/6] Launch verification skipped."
  }

  if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
  }
  Move-Item -LiteralPath $zipTemporaryPath -Destination $zipPath

  $hash = Get-FileHash -LiteralPath $zipPath -Algorithm SHA256
  Write-Host ""
  Write-Host "Runnable ZIP: $zipPath"
  Write-Host "SHA256: $($hash.Hash)"
  $completed = $true

  if ($LaunchAfterVerification) {
    Write-Host "Launching verified application..."
    $launchDirectory = Join-Path ([IO.Path]::GetTempPath()) "airi-user-run-$([DateTime]::Now.ToString('yyyyMMdd-HHmmss'))"
    Expand-Archive -LiteralPath $zipPath -DestinationPath $launchDirectory
    Start-Process -FilePath (Join-Path $launchDirectory "airi.exe") -WorkingDirectory $launchDirectory | Out-Null
  }
}
finally {
  Pop-Location
  if ($completed -and -not $KeepWorkDirectories) {
    Remove-GeneratedDirectory -Path $stagingDirectory -AllowedParent $appDirectory
    Remove-GeneratedDirectory -Path $packageOutputDirectory -AllowedParent $appDirectory
    Remove-GeneratedDirectory -Path $verificationDirectory -AllowedParent ([IO.Path]::GetTempPath())
  }
  elseif (-not $completed) {
    Write-Warning "Packaging failed. Diagnostic directories were preserved: '$stagingDirectory', '$packageOutputDirectory', '$verificationDirectory'."
  }
}

# OmniMuse CLI installer for Windows.
#   irm https://omnimuse.io/install.ps1 | iex
$ErrorActionPreference = 'Stop'

$hostUrl = if ($env:OMNIMUSE_HOST) { $env:OMNIMUSE_HOST.TrimEnd('/') } else { 'https://omnimuse.io' }
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
$dir = if ($env:OMNIMUSE_INSTALL_DIR) { $env:OMNIMUSE_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'OmniMuse\bin' }
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$url = "$hostUrl/cli/omnimuse-windows-$arch.exe"
$target = Join-Path $dir 'omnimuse.exe'
Write-Host "Downloading $url"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $url -OutFile "$target.download" -UseBasicParsing
Move-Item -Force "$target.download" $target

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (($userPath -split ';') -contains $dir)) {
    [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $dir).TrimStart(';'), 'User')
    $env:Path = "$env:Path;$dir"
    Write-Host "Added $dir to your PATH (open a new terminal if 'omnimuse' is not found)."
}

Write-Host "Installed omnimuse to $target"
if ($hostUrl -ne 'https://omnimuse.io') {
    Write-Host "Next: omnimuse login --host $hostUrl"
} else {
    Write-Host 'Next: omnimuse login'
}

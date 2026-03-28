# build-docker-tar.ps1
$ImageName = "stationarr"
$OutputFile = "stationarr.tar"
$DockerPath = "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe"

# 1. Cleanup: Delete existing tar if it exists
if (Test-Path $OutputFile) {
    Write-Host "Removing existing $OutputFile..." -ForegroundColor Yellow
    Remove-Item $OutputFile -Force
}

# 2. Validation: Ensure Dockerfile exists
if (!(Test-Path "Dockerfile")) {
    Write-Error "No Dockerfile found in $(Get-Location)."
    exit 1
}

# 3. Ensure Docker Desktop is running
if (!(Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) {
    Write-Host "Docker Desktop is not running. Launching..." -ForegroundColor Yellow
    Start-Process $DockerPath
}

# 4. Wait for Engine (API check)
Write-Host "Waiting for Docker Engine..." -NoNewline -ForegroundColor Cyan
$MaxRetries = 20
$DockerReady = $false
for ($i = 0; $i -lt $MaxRetries; $i++) {
    & docker info > $null 2>&1
    if ($LASTEXITCODE -eq 0) {
        $DockerReady = $true
        Write-Host " [READY]" -ForegroundColor Green
        break
    }
    Write-Host "." -NoNewline -ForegroundColor Yellow
    Start-Sleep -Seconds 5
}

if (!$DockerReady) {
    Write-Error "Docker Engine timed out."
    exit 1
}

# 5. Build and Export
Write-Host "Building and exporting to $OutputFile..." -ForegroundColor Cyan
& docker buildx build --platform linux/amd64 --output "type=docker,dest=$OutputFile" -t "${ImageName}:latest" .

# 6. Verify and Force Quit
if (Test-Path $OutputFile) {
    $Size = [Math]::Round((Get-Item $OutputFile).Length / 1MB, 2)
    Write-Host "Success! Archive created: $((Get-Item $OutputFile).FullName) ($Size MB)" -ForegroundColor Green
    
    Write-Host "Shutting down Docker Desktop (Force)..." -ForegroundColor Yellow
    
    Start-Process $DockerPath -ArgumentList "--quit" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3

    $DockerProcesses = "Docker Desktop", "Docker Desktop Backend", "com.docker.backend"
    foreach ($proc in $DockerProcesses) {
        if (Get-Process $proc -ErrorAction SilentlyContinue) {
            Stop-Process -Name $proc -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Docker Desktop closed." -ForegroundColor Green
} else {
    Write-Error "Build finished, but $OutputFile was not created. Keeping Docker open."
    exit 1
}

# --- Deployment Section ---
$NAS_IP = "192.168.1.155"
$NAS_User = "mariocape"
$NAS_SSH_Port = 32847
$RemotePath = "/volume1/docker/stationarr/stationarr.tar"
$ContainerName = "stationarr-1"
$D = "/usr/local/bin/docker"

# 7. Upload to Synology
Write-Host "Uploading to Synology via port $NAS_SSH_Port..." -ForegroundColor Cyan
& scp -P $NAS_SSH_Port -O $OutputFile "${NAS_User}@${NAS_IP}:${RemotePath}"

if ($LASTEXITCODE -ne 0) {
    Write-Error "SCP upload failed."
    exit 1
}

# 8. Remote: load image, stop/remove old container, run new one
Write-Host "Updating container on Synology (Enter password if prompted)..." -ForegroundColor Cyan

$RemoteCmd = "sudo $D load -i $RemotePath && sudo $D stop $ContainerName 2>/dev/null; sudo $D rm $ContainerName 2>/dev/null; sudo $D run -d --name $ContainerName -p 8000:3000 ${ImageName}:latest"

& ssh -p $NAS_SSH_Port "${NAS_User}@${NAS_IP}" "bash -c '$RemoteCmd'"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! Container $ContainerName is now running at http://${NAS_IP}:8000" -ForegroundColor Green
} else {
    Write-Error "Deployment failed. Check if port 8000 is occupied by another app on the NAS."
}
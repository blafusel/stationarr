#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="stationarr"
OUTPUT_FILE="stationarr.tar"
NAS_IP="192.168.1.155"
NAS_USER="mariocape"
NAS_SSH_PORT=32847
REMOTE_PATH="/volume1/docker/stationarr/stationarr.tar"
CONTAINER_NAME="stationarr-1"
D="/usr/local/bin/docker"

# Colors
RED='\033[0;31m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; GREEN='\033[0;32m'; NC='\033[0m'

# 1. Cleanup: Delete existing tar if it exists
if [[ -f "$OUTPUT_FILE" ]]; then
    echo -e "${YELLOW}Removing existing $OUTPUT_FILE...${NC}"
    rm -f "$OUTPUT_FILE"
fi

# 2. Validation: Ensure Dockerfile exists
if [[ ! -f "Dockerfile" ]]; then
    echo -e "${RED}Error: No Dockerfile found in $(pwd).${NC}" >&2
    exit 1
fi

# 3. Ensure Docker is running (macOS: start Docker Desktop if needed)
if ! docker info > /dev/null 2>&1; then
    if [[ "$(uname)" == "Darwin" ]]; then
        echo -e "${YELLOW}Docker Desktop is not running. Launching...${NC}"
        open -a "Docker Desktop"
    else
        echo -e "${YELLOW}Docker daemon is not running. Attempting to start...${NC}"
        sudo systemctl start docker 2>/dev/null || true
    fi
fi

# 4. Wait for Docker Engine
echo -en "${CYAN}Waiting for Docker Engine...${NC}"
MAX_RETRIES=20
DOCKER_READY=false
for ((i = 0; i < MAX_RETRIES; i++)); do
    if docker info > /dev/null 2>&1; then
        DOCKER_READY=true
        echo -e " ${GREEN}[READY]${NC}"
        break
    fi
    echo -en "${YELLOW}.${NC}"
    sleep 5
done

if [[ "$DOCKER_READY" == false ]]; then
    echo -e "\n${RED}Error: Docker Engine timed out.${NC}" >&2
    exit 1
fi

# 5. Build and Export
echo -e "${CYAN}Building and exporting to $OUTPUT_FILE...${NC}"
docker buildx build --platform linux/amd64 --output "type=docker,dest=$OUTPUT_FILE" -t "${IMAGE_NAME}:latest" .

# 6. Verify output and shut down Docker Desktop (macOS only)
if [[ -f "$OUTPUT_FILE" ]]; then
    SIZE_MB=$(awk "BEGIN {printf \"%.2f\", $(wc -c < "$OUTPUT_FILE") / 1048576}")
    echo -e "${GREEN}Success! Archive created: $(pwd)/$OUTPUT_FILE ($SIZE_MB MB)${NC}"

    if [[ "$(uname)" == "Darwin" ]]; then
        echo -e "${YELLOW}Shutting down Docker Desktop...${NC}"
        osascript -e 'quit app "Docker Desktop"' 2>/dev/null || true
        sleep 3
        pkill -f "Docker Desktop" 2>/dev/null || true
        echo -e "${GREEN}Docker Desktop closed.${NC}"
    fi
else
    echo -e "${RED}Error: Build finished, but $OUTPUT_FILE was not created. Keeping Docker open.${NC}" >&2
    exit 1
fi

# --- Deployment Section ---

# 7. Upload to Synology
echo -e "${CYAN}Uploading to Synology via port $NAS_SSH_PORT...${NC}"
scp -P "$NAS_SSH_PORT" -O "$OUTPUT_FILE" "${NAS_USER}@${NAS_IP}:${REMOTE_PATH}"

# 8. Remote: load image, stop/remove old container, run new one
echo -e "${CYAN}Updating container on Synology (enter password if prompted)...${NC}"

REMOTE_CMD="sudo $D load -i $REMOTE_PATH && sudo $D stop $CONTAINER_NAME 2>/dev/null; sudo $D rm $CONTAINER_NAME 2>/dev/null; sudo $D run -d --name $CONTAINER_NAME -p 8000:3000 ${IMAGE_NAME}:latest"

ssh -p "$NAS_SSH_PORT" "${NAS_USER}@${NAS_IP}" "bash -c '$REMOTE_CMD'"

echo -e "${GREEN}Success! Container $CONTAINER_NAME is now running at http://${NAS_IP}:8000${NC}"

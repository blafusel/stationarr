# Docker Setup for Plex Stationarr

This guide explains how to run Plex Stationarr in a Docker container for easy deployment and management.

## Prerequisites

- Docker installed on your system
- Docker Compose (usually included with Docker Desktop)
- Access to your Plex Media Server

## Quick Start

### Option 1: Using Docker Compose (Recommended)

1. **Clone or download** the Plex Stationarr project
2. **Navigate** to the project directory:
   ```bash
   cd plex-stationarr
   ```

3. **Build and start** the container:
   ```bash
   docker-compose up -d
   ```

4. **Access** the application:
   - Open your browser to `http://localhost:3000`
   - Or from another device: `http://your-server-ip:3000`

### Option 2: Using Docker directly

1. **Build** the Docker image:
   ```bash
   docker build -t plex-stationarr .
   ```

2. **Run** the container:
   ```bash
   docker run -d \
     --name plex-stationarr \
     --restart unless-stopped \
     -p 3000:3000 \
     plex-stationarr
   ```

## Configuration

### Initial Setup

1. Open the application in your browser
2. Click the **⚙️ Settings** button
3. Configure your **Plex Server Settings**:
   - **Plex Server URL**: Your Plex server address (e.g., `http://YOUR_PLEX_SERVER:32400`)
   - **Plex Token**: Your Plex authentication token
4. Select your **content types** and **libraries**
5. **Save Settings**

### Getting Your Plex Token

To get your Plex token:
1. Sign in to [Plex Web](https://app.plex.tv)
2. Open any media item
3. Click "Get Info" or "View XML"
4. Look for `X-Plex-Token` in the URL
5. Or use this direct link: https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/

## Customization

### Custom Port

To run on a different port, modify `docker-compose.yml`:

```yaml
services:
  plex-stationarr:
    ports:
      - "8080:3000"  # External port 8080, internal port 3000
```

Then restart:
```bash
docker-compose down
docker-compose up -d
```

### Environment Variables

You can set environment variables in `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=production
  - PORT=3000
  # Add any other Node.js environment variables here
```

## Management Commands

### View logs
```bash
docker-compose logs -f plex-stationarr
```

### Stop the container
```bash
docker-compose down
```

### Restart the container
```bash
docker-compose restart
```

### Update the application
```bash
# Pull latest changes (if from git)
git pull

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

### Remove everything (including volumes)
```bash
docker-compose down -v
docker image rm plex-stationarr
```

## Health Check

The container includes a health check that:
- Runs every 30 seconds
- Checks if the app responds on `/health` endpoint
- Marks container as unhealthy after 3 failed attempts

Check health status:
```bash
docker ps  # Look for "(healthy)" or "(unhealthy)" in status
```

## Troubleshooting

### Container won't start
```bash
# Check logs for errors
docker-compose logs plex-stationarr

# Check if port 3000 is already in use
netstat -tulpn | grep :3000
```

### Can't connect to Plex server
- Ensure your Plex server IP is accessible from the Docker container
- If Plex is on the same machine, use your machine's IP address, not `localhost`
- Check that your Plex token is correct and not expired

### Permission issues
- The container runs as a non-root user for security
- If you have file permission issues, check the Dockerfile user configuration

### Network issues
- If you can't access from other devices, ensure:
  - Docker port is properly mapped (`-p 3000:3000`)
  - Your firewall allows connections on port 3000
  - You're using the correct IP address of the Docker host

## Security Considerations

- The container runs as a non-root user (`plexstationarr`)
- No sensitive data is stored in the container (settings are in browser localStorage)
- Consider running behind a reverse proxy (nginx, Traefik) for HTTPS
- For production use, consider setting up proper secrets management for your Plex token

## Advanced Configuration

### Running behind a reverse proxy

Example nginx configuration:
```nginx
server {
    listen 80;
    server_name plex-stationarr.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Docker Swarm / Kubernetes

The application is stateless and can be easily deployed to:
- Docker Swarm
- Kubernetes 
- Any container orchestration platform

No persistent volumes are required as all settings are stored client-side.

## Performance Tips

- **Resource Limits**: The container uses minimal resources (~50MB RAM)
- **Caching**: Enable content caching in settings for better performance
- **Network**: Ensure good network connectivity to your Plex server
- **Browser**: Modern browsers perform better with the EPG interface

## Support

If you encounter issues:
1. Check the container logs: `docker-compose logs -f`
2. Verify your Plex server is accessible
3. Check the browser console for JavaScript errors
4. Ensure your Plex token is valid

For more help, check the main project documentation or submit an issue on the project repository.
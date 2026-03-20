# Use the official Node.js 18 Alpine image as base
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application files
COPY . .

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S plexstationarr -u 1001

# Change ownership of the app directory
RUN chown -R plexstationarr:nodejs /app
USER plexstationarr

# Expose the port the app runs on
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "server.js"]
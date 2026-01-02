# Use Node.js 20 Alpine for lightweight image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev deps for building)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# --- Production Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create data directory for session storage
RUN mkdir -p /app/data

# Expose port
EXPOSE 38383

# Start server
CMD ["node", "dist/index.js"]

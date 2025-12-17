# Use Node.js 20 Alpine for lightweight image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
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

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/index.js"]

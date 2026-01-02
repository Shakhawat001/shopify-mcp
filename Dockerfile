# Use Node.js 20 Alpine for lightweight image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev deps for building)
RUN npm ci

# Copy source code and Prisma schema
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# --- Production Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

# Copy built artifacts, dependencies, and Prisma files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Install curl for healthcheck
RUN apk add --no-cache curl

# Expose port
EXPOSE 38383

# Run database push (creates tables if not exist) and start server
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]

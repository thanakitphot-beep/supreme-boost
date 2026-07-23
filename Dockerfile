# Build Stage
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies needed for native modules (if any)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build widget/UI bundle
RUN npm run build

# Prune dev dependencies for production
RUN npm prune --production

# ====================================================
# Production Stage
FROM node:20-alpine AS production

WORKDIR /usr/src/app

# Only copy necessary files from builder
COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/api ./api
COPY --from=builder /usr/src/app/services ./services
COPY --from=builder /usr/src/app/server.js ./server.js
COPY --from=builder /usr/src/app/supreme-boost ./supreme-boost
COPY --from=builder /usr/src/app/client ./client
COPY --from=builder /usr/src/app/*.html ./

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# Start server
CMD ["node", "server.js"]

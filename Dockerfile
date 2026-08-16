# Build Stage
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install native build tools
RUN apk add --no-cache python3 make g++

COPY package*.json ./

# Install ALL deps (including devDependencies for esbuild/build step)
RUN npm ci

# Copy source
COPY . .

# Build widget bundle (requires esbuild devDependency)
RUN npm run build

# ====================================================
# Production Stage
FROM node:20-alpine AS production

WORKDIR /usr/src/app

COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /usr/src/app/api ./api
COPY --from=builder /usr/src/app/services ./services
COPY --from=builder /usr/src/app/server.js ./server.js
COPY --from=builder /usr/src/app/supreme-boost ./supreme-boost
COPY --from=builder /usr/src/app/plugins ./plugins
COPY --from=builder /usr/src/app/data ./data
COPY --from=builder /usr/src/app/*.html ./

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose API port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# Start server
CMD ["node", "server.js"]

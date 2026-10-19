# ── Stage 1: Build the React frontend ──────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app

# Copy root package files (frontend)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy frontend source
COPY index.html vite.config.js ./
COPY src/ src/
COPY public/ public/

# Build production bundle
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ── Stage 2: Production backend ───────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init for proper PID 1 signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy backend package files and install production deps
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY server/ ./

# Copy built frontend into /app/dist for optional static serving
COPY --from=frontend-build /app/dist ./dist/

# Own files by non-root user
RUN chown -R appuser:appgroup /app

USER appuser

# Expose server port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

# Use dumb-init so Node.js receives SIGTERM properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]

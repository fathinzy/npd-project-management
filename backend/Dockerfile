# ── NPD Backend — Dockerfile ───────────────────────────────────────
# Multi-stage build kept simple on purpose: this is a small internal
# tool, not a service that needs aggressive image-size optimization.
#
# IMPORTANT: build this from the REPO ROOT, not from backend/, so the
# build context includes both backend/ and frontend/:
#
#   docker build -f backend/Dockerfile -t npd-backend .
#
# (docker-compose.yml at the repo root already does this correctly.)

FROM node:22-slim

# Create a non-root user to run the app (security best practice —
# never run a Node process as root inside a container)
RUN groupadd -r npduser && useradd -r -g npduser npduser

WORKDIR /app

# Install dependencies first (separate layer so `npm install` is
# cached and skipped on rebuilds unless package.json actually changes)
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy backend source
COPY backend/ ./

# Copy the frontend so the backend can serve it directly,
# matching the original single-process deployment model
COPY frontend/index.html ./index.html

# Create the data + uploads directories with correct ownership
# before dropping privileges
RUN mkdir -p /app/data /app/Project /app/templates && \
    chown -R npduser:npduser /app

USER npduser

EXPOSE 3001

# --experimental-sqlite kept for compatibility with Node 22.x versions
# prior to 22.13 where node:sqlite still required the flag explicitly.
CMD ["node", "--experimental-sqlite", "server.js"]


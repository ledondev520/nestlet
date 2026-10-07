# Node 24 matches the locally tested major; rebuild regularly for security updates.
# For a release, pin the tested image digest in the deployment manifest.
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils util-linux \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
# Explicit copies prevent an accidental .env, upload or private document inclusion.
COPY --chown=node:node package.json server.js workbook-worker.js ./
COPY --chown=node:node public ./public
COPY --chown=node:node ops/healthcheck.mjs ./ops/healthcheck.mjs
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "ops/healthcheck.mjs"]
CMD ["node", "server.js"]

# Node 24 matches the locally tested major; rebuild regularly for security updates.
# For a release, pin the tested image digest in the deployment manifest.
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM node:24-bookworm-slim AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY vite.config.js jsconfig.json components.json ./
COPY frontend ./frontend
RUN npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils util-linux \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
# Explicit copies prevent an accidental .env, upload or private document inclusion.
COPY --chown=node:node package.json server.js auth.js storage.js telemetry.js chat.js document-context.js case-records.js workbook-worker.js ./
COPY --chown=node:node public ./public
COPY --from=frontend-build --chown=node:node /app/public/next ./public/next
COPY --chown=node:node ops/healthcheck.mjs ./ops/healthcheck.mjs
# User-run operator setup uses the same Node runtime; no host Node/npm required.
COPY --chown=node:node scripts/setup-operator.js scripts/operator-setup.js scripts/setup-trial-user.js scripts/trial-user-setup.js ./scripts/
# Source checkouts may use umask 077. All image contents are public code,
# so any file-owner UID used by the isolated setup helper must be able to read it.
# This never touches bind-mounted runtime.env or other host paths.
RUN chmod -R a+rX /app \
    && mkdir -p /data \
    && chown node:node /data \
    && chmod 700 /data
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "ops/healthcheck.mjs"]
CMD ["node", "server.js"]

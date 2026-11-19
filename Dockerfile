# syntax=docker/dockerfile:1.7
# The admin panel as a small self-contained Next.js server.
# Database tables and sample data are created automatically when it starts.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npx -y npm@11.6.2 ci --no-audit --no-fund

FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 STANDALONE=true
RUN TURSO_DATABASE_URL=file:/tmp/build.db npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
# HOSTNAME=0.0.0.0 is needed inside the container; docker-compose.yml publishes the port on
# 127.0.0.1 only, and the panel itself still refuses non-localhost addresses unless ADMIN_PUBLIC=true.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 TURSO_DATABASE_URL=file:/app/data/support.db
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app && mkdir -p /app/data && chown app:app /app/data
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
# Native modules load platform binaries at runtime, which output tracing can miss.
COPY --from=deps --chown=app:app /app/node_modules/@libsql ./node_modules/@libsql
COPY --from=deps --chown=app:app /app/node_modules/libsql ./node_modules/libsql
COPY --from=deps --chown=app:app /app/node_modules/@neon-rs ./node_modules/@neon-rs
COPY --from=deps --chown=app:app /app/node_modules/detect-libc ./node_modules/detect-libc
USER app
VOLUME /app/data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# syntax=docker/dockerfile:1.7
# Multi-stage build for the admin console (Next.js standalone output).

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npx -y npm@11.6.2 ci --no-audit --no-fund

FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time placeholders only; real values come from the runtime environment.
RUN TURSO_DATABASE_URL=file:/tmp/build.db \
    ENCRYPTION_KEY=MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA= \
    INTERNAL_API_SECRET=build-only-placeholder-secret-000000 \
    npm run build

# Used by the `migrate` service: has tsx and the full dependency tree.
FROM builder AS tools
ENV NODE_ENV=production
CMD ["sh", "-c", "npm run migrate && npm run seed:owner"]

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
# Native modules load platform binaries at runtime, which output tracing can miss.
COPY --from=deps --chown=app:app /app/node_modules/@node-rs ./node_modules/@node-rs
COPY --from=deps --chown=app:app /app/node_modules/@libsql ./node_modules/@libsql
COPY --from=deps --chown=app:app /app/node_modules/libsql ./node_modules/libsql
COPY --from=deps --chown=app:app /app/node_modules/@neon-rs ./node_modules/@neon-rs
COPY --from=deps --chown=app:app /app/node_modules/detect-libc ./node_modules/detect-libc
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

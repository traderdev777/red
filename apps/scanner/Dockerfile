# RED scanner. Build from the repo root:
#   docker build -f apps/scanner/Dockerfile -t red-scanner .
# Official Playwright image: Chromium + its system deps, pinned to the
# playwright version in apps/scanner/package.json.
FROM mcr.microsoft.com/playwright:v1.48.2-noble

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app
# Manifests first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/scanner/package.json apps/scanner/
RUN pnpm install --frozen-lockfile --filter @red/scanner... --prod=false

COPY packages/shared packages/shared
COPY apps/scanner apps/scanner

# Non-root: the image ships the unprivileged "pwuser".
RUN chown -R pwuser:pwuser /app
USER pwuser

WORKDIR /app/apps/scanner
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# SIGTERM -> graceful drain (no new claims, in-flight scans finish).
STOPSIGNAL SIGTERM
CMD ["node", "--import", "tsx", "src/index.ts"]

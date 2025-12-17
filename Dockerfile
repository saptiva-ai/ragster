FROM node:20-slim AS base

# -----------------------
# Stage 1: Dependencies
# -----------------------
FROM base AS deps

RUN apt-get update && apt-get install -y \
  python3 \
  make \
  g++ \
  libcairo2-dev \
  libpango1.0-dev \
  libjpeg-dev \
  libgif-dev \
  librsvg2-dev \
  libfreetype6-dev \
  libfontconfig1-dev \
  libvips-dev \
  && rm -rf /var/lib/apt/lists/*

# Force sharp to use system libvips (avoid GitHub download)
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=0

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install -g npm@11.6.4
RUN npm ci

# -----------------------
# Stage 2: Builder
# -----------------------
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# -----------------------
# Stage 3: Runner
# -----------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN groupadd -g 1001 nodejs
RUN useradd -u 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next && chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy mupdf for PDF processing (external package not bundled by Next.js)
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/mupdf ./node_modules/mupdf

USER nextjs

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]

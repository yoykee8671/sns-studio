# SNS Studio — Render.com deployment image.
# Build context is the repo root (this folder): studio/ + @pickydoggyclub/ + deploy/fonts/.
FROM node:22-slim

# System Chromium for Playwright rendering, ffmpeg deps come bundled via ffmpeg-static.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fontconfig fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

# Brand fonts (Pretendard / Freesentation / Poppins) — must match the editor preview.
COPY deploy/fonts/ /usr/local/share/fonts/studio/
RUN fc-cache -f

WORKDIR /app
COPY studio/package.json studio/package-lock.json ./studio/
RUN cd studio && npm ci

COPY studio ./studio
COPY @pickydoggyclub ./@pickydoggyclub
RUN cd studio && npm run build

ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium \
    STUDIO_CONTENT_ROOT=/data/content

WORKDIR /app/studio
EXPOSE 3000
CMD ["npm", "start"]

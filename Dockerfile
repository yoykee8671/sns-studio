# SNS Studio — self-hosted image for the Mac mini (Colima). See docker-compose.yml.
# Build context is the repo root (this folder): studio/ + @pickydoggyclub/ + deploy/fonts/.
FROM node:22-slim

# System Chromium for Playwright rendering, ffmpeg comes bundled via ffmpeg-static.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fontconfig fonts-noto-color-emoji ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# yt-dlp (standalone build, no Python needed) for 링크로 가져오기. Instagram changes often:
# a rebuild picks up the latest release; `docker exec sns-v2-app yt-dlp -U` updates in place.
RUN case "$(uname -m)" in aarch64|arm64) f=yt-dlp_linux_aarch64 ;; *) f=yt-dlp_linux ;; esac \
  && curl -fsSL -o /usr/local/bin/yt-dlp "https://github.com/yt-dlp/yt-dlp/releases/latest/download/$f" \
  && chmod +x /usr/local/bin/yt-dlp && /usr/local/bin/yt-dlp --version

# Brand fonts (Pretendard / Freesentation / Poppins) — must match the editor preview.
COPY deploy/fonts/ /usr/local/share/fonts/studio/
RUN fc-cache -f

WORKDIR /app
COPY studio/package.json studio/package-lock.json ./studio/
RUN cd studio && npm ci

COPY studio ./studio
COPY @pickydoggyclub ./@pickydoggyclub
RUN cd studio && npm run build

# Posts and uploaded media live on a volume mounted here (never inside the image).
ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium \
    STUDIO_CONTENT_ROOT=/data/content
RUN mkdir -p /data/content

WORKDIR /app/studio
EXPOSE 3100
CMD ["npm", "start"]

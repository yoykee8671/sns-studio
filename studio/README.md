# SNS Studio

Local web app for producing Instagram feeds per brand account: preview, last-mile QA edits,
export (PNG/JPG), hand-off to Figma (layered SVG), and publishing.

## Run

```bash
npm install
npm run dev          # http://localhost:3100
```

On this Mac the app also runs automatically at login via
`~/Library/LaunchAgents/com.wooof.sns-studio.plist` (logs: `~/Library/Logs/sns-studio/`):

```bash
launchctl kickstart -k gui/$(id -u)/com.wooof.sns-studio   # restart
launchctl bootout gui/$(id -u)/com.wooof.sns-studio        # stop until next login
```

Requires Google Chrome (used for rendering) and the brand fonts installed locally
(Pretendard, Freesentation, Poppins).

## Layout

```
brands/<brand>.json                 brand kit: logo paths, colors, fonts, voice, rules
lib/templates/                      slide templates (shared by preview and export)
lib/stickers.mjs                    sticker catalog (post-its, speech bubbles, label, X bubble)
lib/render-server.mjs               Playwright export (png / jpg / svg)
lib/svg-export.mjs                  layered SVG for Figma
lib/instagram.mjs                   Graph API publishing
content/<brand>/<post>/post.json    one post = slides + caption + hashtags
content/<brand>/<post>/out/         last export (git-ignored)
content/<brand>/<post>/.history/    previous post.json versions on every save (git-ignored)
```

Brand assets (photos, logos) live outside the app in `../@<brand>/` and are referenced by
`assetDir` in the brand kit.

## Editor rules

- Each line in a text field is exactly one line in the design. The field turns red when a line
  overflows the safe area or exceeds the line limit.
- Photos are pinned by SHA-256. If a file in the asset folder changes, export is blocked until
  you re-pin it ("이 사진으로 고정").
- Stickers: tick a type to add it, edit its text, drag it on the preview, adjust rotation.

## CLI

```bash
node scripts/render.mjs <brand> <post-id> [--format png|jpg|svg] [--pin]
```

## Publishing

Copy `.env.example` to `.env.local` and fill in the Instagram and Vercel Blob values.
Until then the publish button shows what is missing; use the image download instead.

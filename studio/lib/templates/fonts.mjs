// Bundled web fonts beyond the system/brand fonts. Served from /fonts (studio/public)
// for the srcDoc previews; render-server inlines them as data URLs for export because
// page.setContent() has no base URL to resolve /fonts against. The same TTFs also sit
// in deploy/fonts, which the Docker image installs system-wide as a second net.
export const WEB_FONTS = [
  { family: 'NanumMyeongjo', weight: 400, file: 'NanumMyeongjo-Regular.ttf' },
  { family: 'NanumMyeongjo', weight: 700, file: 'NanumMyeongjo-Bold.ttf' },
  { family: 'NanumMyeongjo', weight: 800, file: 'NanumMyeongjo-ExtraBold.ttf' },
];

// 매거진 스타일에서 고를 수 있는 글꼴 (headline/body 공용 선택지).
export const FONT_CHOICES = [
  { value: 'Pretendard', label: '프리텐다드 — 기본 고딕' },
  { value: 'Freesentation', label: '프리센테이션 — 손맛 고딕' },
  { value: 'NanumMyeongjo', label: '나눔명조 — 매거진 세리프' },
];

export const isFontChoice = (v) => FONT_CHOICES.some((f) => f.value === v);

/**
 * @font-face CSS for the families a slide actually uses. Templates pass the font
 * names they render with; families that aren't bundled web fonts filter out, so a
 * Pretendard-only slide emits nothing — that keeps the export path from inlining
 * megabytes of unused base64 (render-server only inlines fonts the HTML references).
 */
export const webFontCss = (families = WEB_FONTS.map((f) => f.family)) => {
  const used = new Set(families);
  return WEB_FONTS.filter((f) => used.has(f.family))
    .map(
      (f) =>
        `@font-face { font-family: '${f.family}'; src: url('/fonts/${f.file}') format('truetype'); font-weight: ${f.weight}; font-display: block; }`,
    )
    .join('\n  ');
};

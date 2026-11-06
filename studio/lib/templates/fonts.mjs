// Bundled web fonts beyond the system/brand fonts. Served from /fonts (studio/public)
// for the srcDoc previews; render-server inlines them as data URLs for export because
// page.setContent() has no base URL to resolve /fonts against. The same TTFs also sit
// in deploy/fonts so Vercel's fontconfig path keeps working as a second net.
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

/** @font-face CSS every template includes; browsers only fetch families actually used. */
export const webFontCss = () =>
  WEB_FONTS.map(
    (f) =>
      `@font-face { font-family: '${f.family}'; src: url('/fonts/${f.file}') format('truetype'); font-weight: ${f.weight}; font-display: block; }`,
  ).join('\n  ');

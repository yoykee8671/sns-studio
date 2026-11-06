# Studio v2.5 — Edito-수준 템플릿 다양화 설계

2026-11-06. v2 기능 이식(연재·장별 템플릿·텍스트 스타일·캡션 AI) 후 사용자 피드백:
"디자인이 예전 버전이랑 비슷하다. Edito 같은 방식(다양한 템플릿·스타일)으로 업데이트해달라."
원인: 기능은 이식됐지만 템플릿 5종이 전부 같은 브랜드 룩(종이 배경 + 고정 폰트)이라
눈에 보이는 변화가 없음. 이번 라운드는 "보이는 것"을 Edito 수준으로 올린다.

## 사용자 결정 (AskUserQuestion, 2026-11-06)

- 템플릿 룩: **Edito식 다양한 룩** — 룩 자체가 다른 템플릿 10종 내외 신규 제작.
  브랜드 로고·컬러는 포인트로만.
- 선택 UI: **갤러리 + 추천 조합** — 렌더링된 미리보기 카드 갤러리 + 세트 시작.
- **원고로 시작하기 포함** — 긴 글 붙여넣으면 AI가 장별로 나눠 카드 초안 생성.
- **내 매거진 스타일 포함** — 색·글꼴을 한 번 정하면 모든 카드에 일괄 적용.

## 1. 신규 템플릿 12종

모두 기존 템플릿 계약(meta + renderSlide → 완성 HTML 문서, QA slideRuntime,
fieldStyle, renderMarkup)을 따른다. `meta.role`에 `'last'` 추가 (정렬: cover → any →
inner → last). 각 템플릿은 `meta.sample`(갤러리 미리보기용 예시 slide 데이터)을 갖는다.

표지 (role 'cover'):
| key | 룩 | 핵심 요소 |
|---|---|---|
| `cover-book` | 책 표지 느낌 | 종이 바탕, 머리글 한 줄(호수), 포인트색 띠 2줄 사이 **명조** 세로형 제목, 하단 지은이/핸들 |
| `cover-photo-full` | 사진 전체 + 큰 제목 | 풀블리드 사진, 하단 그라데이션 위 큰 제목 2줄, 상단 로고 |
| `cover-center-dark` | 큰 제목 가운데 | 검정(또는 어둡게 깐 사진) 바탕, 가운데 정렬 제목, 하단 로고 |
| `cover-minimal` | 작은 글씨 두 줄(아래) | 다크/종이 토글, 상단 머리글 한 줄 옵션, 좌하단 작은 제목 |

속지 (role 'inner') + 인용 (role 'any'):
| key | 룩 | 핵심 요소 |
|---|---|---|
| `inner-essay` | 본문 | 종이, 문단 글(들여쓰기·굵게), 하단 쪽번호 — 블로그·에세이 긴 글 |
| `inner-interview` | 인터뷰 | 종이, 따옴표 핵심 한마디, 소개 문단, 이름이 포인트색인 Q&A |
| `inner-numbered-dark` | 본문 넘버링 다크 | 다크 바탕, 포인트색 "1. 소제목", 본문 |
| `inner-item-dark` | 아이템 소개 다크 | 다크, "01. 제품 이름" 가운데, 제품 사진 칸, 한 줄 설명 + 소개 |
| `inner-photo-split` | 사진 + 소제목 | 상단 절반 사진, 아래 소제목 + 본문 (종이) |
| `inner-compare` | 사진 2장 비교 | 사진 2칸 + 사진 설명, 본문, 굵은 결론 문장 |
| `quote-dark` | 한 장 한 문장 | 검정 바탕 가운데 정렬 한두 문장 (role 'any') |

마지막 장 (role 'last'):
| key | 룩 | 핵심 요소 |
|---|---|---|
| `last-follow` | 팔로우 카드 | 다크, 마무리 문구 + 사진(선택) + 인스타 프로필 칩(핸들+팔로우 버튼 그래픽) |

- 기존 5종(editorial-photo, curation-frame, numbered-section, info-list, item-intro)은
  그대로 유지 — 과거 게시물 렌더 불변.
- 다크 템플릿의 포인트색·형광펜색은 brandPalette를 따른다(매거진 스타일로 변경 가능).
- `last-follow`의 끝장 자동 이미지(closing)와의 관계: last-follow를 쓰면 closing 이미지는
  그대로 뒤에 붙는다(기존 동작 불변). 빌더 판단: 중복이 싫으면 사용자가 둘 중 하나만 쓴다.

## 2. 폰트 — 명조 추가

- Nanum Myeongjo(OFL) Regular/Bold/ExtraBold를 `deploy/fonts/`(내보내기)와
  `studio/public/fonts/`(프리뷰)에 추가.
- `lib/templates/fonts.mjs`: WEB_FONTS 매니페스트(family, weight, file)와
  `webFontCss()` — `/fonts/<file>` URL 기반 @font-face CSS 문자열(클라이언트 안전).
  템플릿은 head에 `${webFontCss()}`를 포함한다(명조 쓰는 템플릿만이 아니라 공통 포함 OK —
  브라우저는 사용된 family만 다운로드).
- 프리뷰: srcDoc iframe은 부모 문서 base URL을 상속하므로 `/fonts/...`가 Next public에서
  로드됨.
- 내보내기: render-server가 setContent 전에 HTML의 `/fonts/<file>` URL을 base64 data URL로
  치환(`inlineWebFonts(html)`), Vercel이 아니어도 동작. Vercel의 FONTCONFIG_PATH 복사는
  기존대로 유지(이중 안전망).

## 3. 내 매거진 스타일 (브랜드 전역 스타일)

- 저장: 콘텐츠 스토리지의 `<brand>/brand-style.json` (파일 모드·Supabase 모두 store.mjs
  경유). 스키마: `{ colors?: { point?, highlight? }, fonts?: { headline?, body? } }`.
- `loadBrand()`가 읽어 brand 객체에 머지: colors.blue←point, colors.lime←highlight,
  fonts.headline/body 교체. 템플릿 코드는 수정 불필요(이미 brand에서 읽음).
- 폰트 선택지: Pretendard, Freesentation, NanumMyeongjo (매니페스트 + 기존 번들 폰트).
- 색은 hex 입력(컬러 피커). SAFE_CSS_COLOR 검증 재사용.
- UI: 홈 페이지 브랜드 카드에 "매거진 스타일" 접이식 섹션. API:
  `GET/PUT /api/brand-style/[brand]`.

## 4. 템플릿 갤러리 + 추천 조합

- 에디터의 템플릿 드롭다운 → "템플릿 바꾸기" 버튼 → 모달 갤러리.
  탭: 표지/속지/마지막 장(role별), 각 카드 = `renderSlide(meta.sample)`을 scale 축소한
  srcDoc iframe + 라벨/설명. 현재 포맷을 지원하는 템플릿만 표시.
- "+ 장 추가"도 갤러리를 연다(선택한 템플릿의 newSlide로 추가). 빠른 추가(직전 장과 같은
  템플릿)는 보조 버튼으로 유지.
- 추천 조합: `lib/templates/sets.mjs` — `{ id, label, desc, slides: [templateKey...] }`
  예: 넘버링 꿀팁 6장(cover-center-dark + inner-numbered-dark×4 + last-follow),
  인터뷰 한 편 5장(cover-photo-full + inner-interview×3 + last-follow),
  아이템 소개 5장(cover-book + inner-item-dark×3 + last-follow),
  에세이 4장(cover-minimal + inner-essay×2 + last-follow).
- 새 게시물 만들기 흐름에 "추천 조합으로 시작" — 세트 선택 시 slides가 해당 템플릿
  구성으로 미리 채워진(내용은 빈) 게시물 생성.

## 5. 원고로 시작하기

- `lib/suggest.mjs`에 `draftFromManuscript({ brand, text, set })` 추가 — 캡션 초안과 같은
  Haiku 모델. 입력: 원고 전문 + 세트의 템플릿별 필드 명세. 출력(zod): 장별
  `{ template, fields: {...} }` 배열(세트 구조 준수, 장 수는 원고 분량에 맞게 세트 범위 내).
- API `POST /api/manuscript/[brand]` → 초안 게시물 생성 후 에디터로 이동.
- UI: 홈의 새 게시물 영역에 "원고로 시작하기" — 원고 textarea + 세트 선택.
- ANTHROPIC_API_KEY 없으면(suggestReady false) UI 숨김 — 기존 캡션 초안과 동일 규칙.

## 비범위 (이번 라운드 제외)

- 사진 효과/필터(사용자가 명시적으로 제외), 자유 배치(드래그 레이아웃),
  내 표기 사전, 템플릿별 유료 잠금. Edito의 "마지막 장" 중 팔로우 카드 외 변형.

## 검증

- 신규 템플릿 전수 렌더 스모크(샘플 데이터로 renderSlide → QA 이슈 0) 테스트 추가.
- sets가 참조하는 템플릿 키·role 정합성 테스트.
- draftFromManuscript zod 스키마 단위 테스트(모델 호출은 모킹 없이 스키마만).
- 기존 테스트 25개 통과 유지, `npm run build` 통과.
- 로컬 localhost:3100에서 사용자 눈 확인 후 v2 머지.

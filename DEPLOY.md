# SNS Studio — Render(무료) + Supabase 배포 가이드

모바일을 포함해 어디서든 쓰기 위한 서버 배포 구성입니다. **월 추가 요금 $0** 구성:

- **Render Web Service (Free, Docker, Singapore)** — 앱 서버. Chrome·ffmpeg·브랜드 폰트 포함.
  - 무료 플랜 특성: 15분 동안 안 쓰면 잠들고, 다음 접속 때 30초~1분 걸려 깨어납니다.
- **Supabase Storage** — 게시물(post.json)과 업로드한 사진·영상이 전부 여기(비공개 버킷
  `sns-studio`) 저장됩니다. 서버가 재시작·재배포돼도 유지. 무료 티어(1GB)로 충분.
- **비밀번호 게이트** — `STUDIO_PASSWORD` 환경변수를 넣으면 전체 앱이 잠기고 `/login`에서
  입력해야 들어올 수 있어요. (로컬 개발은 환경변수가 없으므로 그대로 열려 있음)
- 브랜드 에셋(로고, **끝장 이미지** `@pickydoggyclub/closing/`)은 저장소에 포함돼 이미지에
  들어갑니다. **끝장 이미지를 바꾸려면 그 폴더의 파일을 교체하고 git push** 하면 자동 재배포.

## 필요한 환경변수

| 키 | 값 |
| --- | --- |
| `STUDIO_PASSWORD` | **필수.** 앱 접속 비밀번호 (폰·PC에서 이걸로 로그인) |
| `SUPABASE_URL` | Supabase 프로젝트 URL — 대시보드 Settings → API (`https://xxxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | 같은 화면의 `service_role` 키 (**secret** 쪽, anon 아님) |
| `SUPABASE_BUCKET` | 기본 `sns-studio` (blueprint가 자동 설정; 버킷은 앱이 첫 저장 때 만들어요) |
| `IG_USER_ID`, `IG_ACCESS_TOKEN`, `BLOB_READ_WRITE_TOKEN` | Instagram 바로 발행용. 비워두면 발행 버튼만 비활성 |

Supabase 쪽 사전 작업은 **없음** — 기존 프로젝트의 URL/키만 넣으면 앱이 비공개 버킷을 알아서
만듭니다. (따로 만들고 싶으면 Storage에서 private 버킷 `sns-studio` 생성)

## 배포 순서

1. **Render 대시보드** → `New +` → **Blueprint** → 이 저장소 선택 → `render.yaml` 자동 인식.
   (이미 blueprint가 있으면 Manual sync만 눌러도 됩니다)
2. 환경변수 입력 (위 표). `SUPABASE_SERVICE_ROLE_KEY` 같은 비밀 값은 본인이 직접 붙여넣기.
3. 첫 빌드(5~10분) 후 `https://sns-studio-xxxx.onrender.com` 주소가 나옵니다.
4. 폰에서 접속 → 로그인 → Safari 공유 → **홈 화면에 추가** 하면 앱처럼 사용.

## 무료 플랜 메모

- 서버 파일시스템은 휘발성입니다. 콘텐츠는 전부 Supabase에 있으므로 잃는 것 없음.
- 내려받기/발행(Chrome 렌더링)은 저메모리 모드로 돌지만 512MB라 빠듯합니다. 특히
  영상 합성은 실패할 수 있어요 → 아래 "PC에서 내보내기" 사용.
- 저메모리 Chrome 플래그가 문제를 일으키면 Render 환경변수 `CHROME_LOW_MEM=0`으로
  재빌드 없이 끌 수 있습니다.
- 무료 인스턴스 시간은 워크스페이스당 월 750시간 — 서비스 하나면 항상 켜져 있어도 충분.

## PC에서 내보내기 (서버 메모리가 부족할 때)

초안은 Supabase에 있으므로, PC의 로컬 앱을 같은 Supabase에 연결하면 **같은 게시물을
그대로 열어 PC 메모리로 내보내기/발행**할 수 있습니다:

1. `studio/.env.local` 파일 생성 (커밋 금지):
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role 키>
   ```
2. `cd studio && npm run dev` → http://localhost:3100 에 서버와 똑같은 게시물 목록이 떠요.
3. 여기서 내려받기/발행. (이 파일을 지우면 다시 로컬 `studio/content/` 파일 모드로 복귀)

폰 = 작성·저장, PC = 무거운 내보내기 분담이 무료 구성의 정석입니다.

## 기존 로컬 초안 옮기기 (선택)

로컬 `studio/content/` 폴더가 지금까지의 초안입니다. Supabase 대시보드 → Storage →
`sns-studio` 버킷에 같은 폴더 구조(`<brand>/<post-id>/post.json`, `.../media/*`)로 업로드하면
서버에서 그대로 보입니다. (또는 서버에서 새로 시작해도 됩니다.)

## 로컬 개발

변화 없음: `cd studio && npm run dev` — 파일 저장(`studio/content/`) 그대로 사용.
로컬에서도 Supabase 모드를 쓰고 싶으면 `studio/.env.local`에 `SUPABASE_URL`과
`SUPABASE_SERVICE_ROLE_KEY`를 넣으면 됩니다 (.env는 커밋 금지).

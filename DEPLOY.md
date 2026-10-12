# SNS Studio — Render 배포 가이드

모바일을 포함해 어디서든 쓰기 위한 서버 배포 구성입니다.

## 구성

- **Render Web Service** (Docker, Singapore 리전) — 앱 서버. Chrome·ffmpeg·브랜드 폰트 포함.
- **Persistent Disk** (`/data`) — 게시물(post.json)과 업로드한 사진·영상이 여기 저장돼 배포/재시작에도 유지됩니다.
- **비밀번호 게이트** — `STUDIO_PASSWORD` 환경변수를 넣으면 전체 앱이 잠기고 `/login`에서 입력해야 들어올 수 있어요. (로컬 개발은 환경변수가 없으므로 그대로 열려 있음)
- 브랜드 에셋(로고, **끝장 이미지** `@pickydoggyclub/closing/`)은 저장소에 포함돼 이미지에 들어갑니다. **끝장 이미지를 바꾸려면 그 폴더의 파일을 교체하고 git push** 하면 자동 재배포됩니다.

## 배포 순서

1. **GitHub**: 이 저장소가 GitHub에 올라가 있어야 합니다 (private 권장).
2. **Render 대시보드** → `New +` → **Blueprint** → 이 저장소 선택 → `render.yaml`이 자동 인식됩니다.
3. 환경변수 입력 (Blueprint 생성 중에 물어봅니다):
   - `STUDIO_PASSWORD` — **필수.** 앱 접속 비밀번호 (폰·PC에서 이걸로 로그인)
   - `IG_USER_ID`, `IG_ACCESS_TOKEN`, `BLOB_READ_WRITE_TOKEN` — Instagram 바로 발행용. 비워두면 발행 버튼만 비활성, 나머지는 전부 동작.
4. 첫 빌드(5~10분) 후 `https://sns-studio-xxxx.onrender.com` 주소가 나옵니다.
5. 폰에서 접속 → 로그인 → Safari 공유 → **홈 화면에 추가** 하면 앱처럼 사용.

## 비용/성능 메모

- `plan: starter`($7/월, 512MB)로 시작합니다. **내려받기/발행 중 "Out of memory"로 죽으면** Render 대시보드에서 `standard`(2GB, $25/월)로 올리세요. Chrome 렌더링이 메모리를 꽤 씁니다.
- 무료 플랜은 15분마다 잠들고 디스크를 붙일 수 없어 이 앱에는 맞지 않습니다.

## 기존 로컬 초안 옮기기 (선택)

로컬 `studio/content/` 폴더가 지금까지의 초안입니다. 서버로 옮기려면 Render 대시보드 → 서비스 → Shell 탭에서 `/data/content`가 비어 있는지 확인한 뒤, 로컬에서:

```bash
# Render CLI 설치 후 (brew install render)
render ssh sns-studio -- mkdir -p /data/content
rsync -av -e "render ssh sns-studio --" studio/content/ :/data/content/
```

(또는 그냥 서버에서 새로 시작해도 됩니다. 로컬 개발 환경은 기존대로 `studio/content/`를 계속 씁니다.)

## 로컬 개발

변화 없음: `cd studio && npm run dev`. 비밀번호 게이트는 로컬에서 자동으로 꺼집니다.

## 2단계 (선택): Supabase Storage 전환

현재는 이미지가 서버 디스크에 저장됩니다(영속·백업 스냅샷 제공). 디스크 대신 Supabase Storage/Postgres로 옮기고 싶어지면 — 예: 여러 서버 인스턴스, 디스크 용량 관리 탈피 — 그때 저장 계층(`lib/store.mjs`)만 교체하면 됩니다.

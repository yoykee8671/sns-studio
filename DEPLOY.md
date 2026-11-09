# SNS Studio — 맥미니 서버 운영 가이드 (v2)

v2부터 **맥미니 한 대가 서버**입니다. Vercel·Supabase는 쓰지 않습니다.

| 항목 | 위치 |
|---|---|
| 코드 | `~/project/sns` (이 폴더) |
| 실행 | Docker(Colima) 컨테이너 `sns-v2-app` — `docker-compose.yml` |
| 게시물·사진·영상 | Docker 볼륨 `sns-v2-content` (컨테이너 안 `/data/content`) |
| 비밀값 | `~/project/sns/.env` (git에 안 올라감, 키 목록은 `.env.example`) |
| 테스트 주소 | http://localhost:3110 (맥미니 안에서만) |
| 공개 주소 | https://sns.gnuol.com (cloudflared 터널, 전환 후) |

앱에서 "저장"하면 → 맥미니의 `sns-v2-content` 볼륨에 바로 기록됩니다. 컨테이너를
다시 빌드하거나 맥미니를 재부팅해도 볼륨은 그대로 남습니다.

## 자주 쓰는 명령

```bash
cd ~/project/sns
docker compose up -d --build     # 코드 바꾼 뒤 다시 빌드 + 재시작
docker compose ps                # 상태 (healthy면 정상)
docker compose logs -f           # 로그
```

## 백업

```bash
# 볼륨 전체를 tar로 (맥미니 ~/backups/ 에 저장)
mkdir -p ~/backups && docker run --rm -v sns-v2-content:/data -v ~/backups:/out alpine \
  tar czf /out/sns-v2-content-$(date +%Y%m%d).tgz -C /data .
```

## 인스타그램 바로 발행

Instagram은 발행할 이미지를 **공개 주소**에서 가져갑니다. 발행할 때 렌더링한 파일을
`/data/content/_public/<무작위 토큰>/`에 잠깐 두고 `PUBLIC_BASE_URL/p/<토큰>/<파일>`로
공개했다가, 발행이 끝나면 지웁니다(비밀번호 없이 열리는 경로는 이것뿐).
→ `PUBLIC_BASE_URL=https://sns.gnuol.com`이 실제로 이 컨테이너를 가리킬 때만 동작합니다.

## Instagram 연결 (바로 발행)

계정마다 홈 › 계정별 스타일 관리 › **Instagram 연결**에 액세스 토큰을 붙여넣어요. 서버가 Instagram에
확인한 뒤 볼륨의 `/data/content/_secrets/instagram.json`(권한 600)에만 저장하고, 화면에는 다시
보이지 않아요. 60일 기한은 서버가 매주 자동 연장해요. (`.env`의 IG_* 값은 예전 방식으로 계속 동작)
⚠️ 볼륨 백업(tar)에도 이 파일이 들어가니 백업 파일은 남과 공유하지 마세요.

## 인스타 링크로 가져오기 (yt-dlp)

새 게시물 → '인스타 링크'에 공개 게시물·릴스 주소를 넣으면 영상(사진)을 받아 디깅형 리포스트를
만듭니다(원작자 허락 전까지 내려받기·발행 잠김). 이미지에 yt-dlp가 들어 있고, 누를 때만 실행돼요.

- 인스타가 바뀌어 실패하면: `docker exec sns-v2-app yt-dlp -U` (또는 이미지 다시 빌드)
- 로그인이 필요한 게시물: 브라우저에서 내보낸 cookies.txt를 볼륨에 두고 `.env`에
  `INSTAGRAM_COOKIES_FILE=/data/content/_secrets/instagram-cookies.txt` 설정 (쿠키는 비밀값)

## 업로드 크기

Cloudflare 무료 터널은 요청 하나를 **100MB**로 제한합니다. 그보다 큰 영상은 압축해서
올려주세요. (맥미니 안에서 localhost:3110으로 올릴 때는 200MB까지)

## 기존 Supabase 데이터 옮기기 (전환 때 한 번)

```bash
cd ~/project/sns/studio
# 1) 옛 서버의 .env 값으로 Supabase 전체를 내려받기
set -a; . ~/infra/sns/.env; set +a
node scripts/export-supabase.mjs ~/infra/sns/supabase-export-$(date +%Y%m%d)
# 2) 볼륨에 복사 (같은 게시물이 있으면 덮어씀)
docker run --rm -v sns-v2-content:/data -v ~/infra/sns/supabase-export-YYYYMMDD:/src:ro alpine \
  cp -a /src/. /data/
```

## 운영 전환 기록 (2026-11-07 완료)

sns.gnuol.com은 **v2(`sns-v2-app`)** 로 연결돼 있습니다. cloudflared 터널은 `http://sns:3100`으로
보내고, 이 별칭(`sns`)은 `docker-compose.yml`의 `tunnel` 네트워크 설정에서 v2가 갖고 있습니다.

- 옛 v1 맥미니 컨테이너(`sns-sns-1`, `~/infra/sns`)는 터널 네트워크에서 빠져 맥미니 안
  (`localhost:3100`)에서만 열립니다. 아예 끄지 않은 이유: `~/infra/watchdog`가 그 스택을
  감시하며 꺼지면 5분 안에 다시 켭니다. 완전히 끄려면 watchdog 목록에서 먼저 빼야 합니다.
  (옛 설정 백업: `~/infra/sns/docker-compose.yml.bak-20261107`)
- 기존 Vercel 주소(v1)는 그대로 살아 있고 Supabase에 저장합니다. v1 게시물은 보관할 필요가
  없다는 결정(2026-11-07)에 따라 **v2로 더 옮기지 않습니다.** Vercel·Supabase는 그냥 끄면 됩니다.

되돌리기: 이 파일의 `aliases: [sns]` → `[sns-v2]`, `~/infra/sns`의 백업 설정을 복원한 뒤 두 폴더에서
`docker compose up -d`.

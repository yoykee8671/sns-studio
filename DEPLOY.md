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

## 운영 전환 (sns.gnuol.com → v2)

cloudflared 터널은 `http://sns:3100`으로 보냅니다. 지금은 옛 컨테이너(`sns-sns-1`,
`~/infra/sns`)가 별칭 `sns`를 갖고 있습니다.

1. 위의 "기존 Supabase 데이터 옮기기"를 한 번 더 (최신본)
2. 옛 서버 중단: `cd ~/infra/sns && docker compose down` (볼륨 없음, Supabase 데이터는 그대로)
3. `docker-compose.yml`의 `aliases: [sns-v2]` → `aliases: [sns]` 로 바꾸고
   `docker compose up -d`
4. https://sns.gnuol.com 접속 확인

되돌리기: 3번 별칭을 다시 `sns-v2`로, `cd ~/infra/sns && docker compose up -d`.

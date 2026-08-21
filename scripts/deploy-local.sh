#!/usr/bin/env bash
# Deploy TCM CRM — bản chạy NGAY TRÊN SERVER, dành cho GitHub Actions self-hosted runner
# (nút "Run workflow" của .github/workflows/deploy.yml). KHÔNG SSH, không tar qua mạng:
# nguồn code là checkout của runner ($GITHUB_WORKSPACE), đích là ~/tcm-crm.
#
# GIỮ NGUYÊN trình tự đã tôi luyện của scripts/deploy.sh (bản chạy từ máy dev — VẪN LÀ ĐƯỜNG
# DỰ PHÒNG, đừng xoá): backup → sync + dọn file mồ côi → build khi app cũ còn chạy → pm2 stop →
# migrate deploy → db:seed (BẮT BUỘC — HANDOVER mục 10.1) → pm2 start → health check.
# Sửa trình tự ở đây thì soi lại deploy.sh cho hai bản cùng luật.
#
# Khác deploy.sh ở đâu (cố ý):
#   · KHÔNG chạy tsc tiền trạm — CI đã chạy trên mỗi push, và bước build (app cũ còn phục vụ)
#     bắt được lỗi TypeScript y hệt: build hỏng thì runtime chưa đổi gì.
#   · KHÔNG kéo backup về máy dev — backup nằm ~/backup trên server; máy dev vẫn có bản kéo về
#     mỗi lần chạy deploy.sh thủ công.
#   · Nguồn sync là checkout của runner nên "repo phải sạch git" là đương nhiên (checkout đúng
#     commit được chọn lúc bấm nút).
#
# TUYỆT ĐỐI KHÔNG đụng dev.db / .env / storage của ~/tcm-crm — dữ liệu thật sống ở đó từ 28/07/2026.

set -euo pipefail

APP_DIR="$HOME/tcm-crm"
PM2_APP=tcm-crm
SRC="${GITHUB_WORKSPACE:-$(pwd)}"
COMMIT_FULL="${GITHUB_SHA:-unknown}"
TS=$(date +%Y%m%d-%H%M%S)
STAGE=tientram

# Runner chạy ngoài shell đăng nhập — tự nạp nvm để có node/npm/npx.
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1

log() { printf '\n== %s ==\n' "$*"; }
die() { printf 'LỖI: %s\n' "$*" >&2; exit 1; }

on_fail() {
  echo
  case "$STAGE" in
    build)
      cat <<M
✗ HỎNG Ở BƯỚC BUILD — app CŨ vẫn đang chạy, chưa có gì đổi về runtime.
  Sửa lỗi rồi bấm Run workflow lại. Nếu web lỗi thiếu chunk (build xoá dở .next):
    cd $APP_DIR && rm -rf .next && mv .next-prev .next && pm2 restart $PM2_APP
M
      ;;
    chuyendoi)
      cat <<M
✗ HỎNG GIỮA LÚC CHUYỂN ĐỔI (app đang DỪNG) — khôi phục về bản trước deploy:
    cd $APP_DIR
    cp ~/backup/dev.db.bak-$TS prisma/dev.db
    rm -rf .next && mv .next-prev .next
    pm2 start $PM2_APP
M
      ;;
    dongbo)
      echo "✗ Hỏng lúc đồng bộ code — runtime chưa đổi (app cũ chạy từ .next cũ). Bấm lại là được."
      ;;
    *)
      echo "✗ Lỗi ở giai đoạn '$STAGE' — chưa có gì thay đổi trên server."
      ;;
  esac
}
trap 'on_fail' ERR

# ── B0. Tiền trạm ────────────────────────────────────────
log "B0 — Tiền trạm (commit $COMMIT_FULL)"
command -v node >/dev/null || die "không thấy node — nvm chưa nạp được"
[ -d "$APP_DIR" ] || die "không thấy $APP_DIR"
[ -f "$SRC/package.json" ] || die "checkout rỗng — \$GITHUB_WORKSPACE=$SRC"
pm2 describe "$PM2_APP" >/dev/null 2>&1 || die "pm2 không có app $PM2_APP"
echo "· i18n parity"
cd "$SRC"
PARITY=$(node -e "const vi=require('./messages/vi.json'),en=require('./messages/en.json');function f(o,p=''){let k=[];for(const x in o){const q=p?p+'.'+x:x;if(o[x]&&typeof o[x]==='object')k=k.concat(f(o[x],q));else k.push(q)}return k}const V=new Set(f(vi)),E=new Set(f(en));console.log('only vi:',[...V].filter(k=>!E.has(k)).length,'only en:',[...E].filter(k=>!V.has(k)).length)")
echo "  $PARITY"
[ "$PARITY" = "only vi: 0 only en: 0" ] || die "vi.json / en.json lệch key — không deploy"

# ── B2. Backup (chưa ghi gì vào chỗ app đọc) ─────────────
log "B2 — Backup DB + code vào ~/backup"
mkdir -p ~/backup
cp "$APP_DIR/prisma/dev.db" ~/backup/dev.db.bak-$TS
tar czf ~/backup/app-$TS.tar.gz -C "$APP_DIR" --exclude=node_modules --exclude=.next --exclude=.next-prev --exclude=prisma/dev.db . 2>/dev/null
# Backup phải MỞ ĐƯỢC chứ không chỉ tồn tại — mượn @prisma/client của chính app.
STAFF_BK=$(cd "$APP_DIR" && DATABASE_URL="file:$HOME/backup/dev.db.bak-$TS" node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL}}});p.staff.count().then(n=>{console.log(n);return p.\$disconnect()})" 2>/dev/null || echo 0)
[ "$STAFF_BK" -gt 0 ] || die "backup DB không mở được bằng Prisma — DỪNG trước khi ghi bất cứ gì"
echo "✓ backup mở được (staff=$STAFF_BK): ~/backup/dev.db.bak-$TS"

# ── B3. Đồng bộ code + dọn file mồ côi ───────────────────
STAGE=dongbo
log "B3 — Đồng bộ code từ checkout (KHÔNG đụng dev.db/.env/storage) + dọn file mồ côi"
ENV_MD5=$(md5sum "$APP_DIR/.env" | cut -d' ' -f1)
ST_SIZE=$(du -sb "$APP_DIR/storage" 2>/dev/null | cut -f1 || echo 0)
LOCK_MD5=$(md5sum "$APP_DIR/package-lock.json" | cut -d' ' -f1)
# Cùng danh sách exclude với deploy.sh — sync qua tar để KHÔNG đụng file ngoài danh sách.
tar czf /tmp/code-$TS.tar.gz -C "$SRC" \
  --exclude='./.git' --exclude='./node_modules' --exclude='./.next' --exclude='./.next-prev' \
  --exclude='./storage' --exclude='./.env' --exclude='./prisma/dev.db' \
  --exclude='./prisma/dev.db-journal' --exclude='./tsconfig.tsbuildinfo' --exclude='./tmp-*' \
  . 2>/dev/null
tar xzf /tmp/code-$TS.tar.gz -C "$APP_DIR" && rm -f /tmp/code-$TS.tar.gz
[ "$(md5sum "$APP_DIR/.env" | cut -d' ' -f1)" = "$ENV_MD5" ] || die ".env bị đổi sau giải nén — DỪNG"
[ "$(du -sb "$APP_DIR/storage" 2>/dev/null | cut -f1 || echo 0)" = "$ST_SIZE" ] || die "storage bị đổi sau giải nén — DỪNG"
# tar giải nén KHÔNG xoá file mà nguồn đã xoá (bẫy 28/07) — so cây file rồi xoá phần mồ côi.
( cd "$SRC" && find src prisma/migrations messages public -type f | LC_ALL=C sort ) > /tmp/manifest-$TS.txt
( cd "$APP_DIR" && find src prisma/migrations messages public -type f | LC_ALL=C sort ) > /tmp/remote-manifest-$TS.txt
comm -13 /tmp/manifest-$TS.txt /tmp/remote-manifest-$TS.txt > /tmp/orphans-$TS.txt
if [ -s /tmp/orphans-$TS.txt ]; then
  echo '-- xoá file mồ côi (nguồn đã xoá, server còn sót):'
  sed 's/^/     /' /tmp/orphans-$TS.txt
  ( cd "$APP_DIR" && xargs -d '\n' rm -f < /tmp/orphans-$TS.txt \
    && find src prisma/migrations messages public -type d -empty -delete 2>/dev/null || true )
else
  echo '-- không có file mồ côi'
fi
rm -f /tmp/manifest-$TS.txt /tmp/remote-manifest-$TS.txt /tmp/orphans-$TS.txt
LOC_MIG=$(ls "$SRC/prisma/migrations" | grep -c '^2')
[ "$(ls "$APP_DIR/prisma/migrations" | grep -c '^2')" = "$LOC_MIG" ] || die "số migration lệch nguồn ($LOC_MIG) — DỪNG"
if [ "$(md5sum "$APP_DIR/package-lock.json" | cut -d' ' -f1)" = "$LOCK_MD5" ]; then LOCKFLAG=LOCK_SAME; else LOCKFLAG=LOCK_CHANGED; fi
echo "-- lockfile: $LOCKFLAG · migration trên đĩa: $LOC_MIG"

# ── B4. Build khi app cũ còn chạy ────────────────────────
STAGE=build
log "B4 — Build (app cũ vẫn phục vụ; hỏng thì không có gì đổi)"
cd "$APP_DIR"
if [ "$LOCKFLAG" = "LOCK_CHANGED" ]; then echo '-- lockfile đổi → npm ci'; npm ci; fi
npx prisma generate >/dev/null
rm -rf .next-prev; [ -d .next ] && cp -a .next .next-prev
npx next build 2>&1 | tail -12

# ── B5. Chuyển đổi: dừng → migrate → seed → chạy ─────────
STAGE=chuyendoi
log "B5 — pm2 stop → migrate deploy → db:seed → pm2 start"
pm2 stop "$PM2_APP" >/dev/null
npx prisma migrate deploy 2>&1 | tail -4
npm run db:seed 2>&1 | { grep -E 'Seed|Error|error' || true; } | tail -3
printf '%s\ndeploy: %s (runner)\n' "$COMMIT_FULL" "$TS" > .deployed-commit
pm2 start "$PM2_APP" >/dev/null && pm2 save >/dev/null
echo "-- đã chạy lại, commit ghi ở ~/tcm-crm/.deployed-commit"

# ── B6. Health check ─────────────────────────────────────
STAGE=health
log "B6 — Health check"
sleep 5
CODE=$(node -e "fetch('http://localhost:3000/login').then(r=>{console.log(r.status);process.exit(r.status<500?0:1)}).catch(()=>{console.log('KHÔNG KẾT NỐI ĐƯỢC');process.exit(1)})")
echo "-- HTTP /login: $CODE"
{ pm2 logs "$PM2_APP" --lines 100 --nostream 2>/dev/null || true; } | grep -m1 'scheduler bật' \
  || die "chưa thấy dòng [jobs] scheduler bật — kiểm pm2 logs"

log "✓ DEPLOY XONG"
echo "  commit : $COMMIT_FULL"
echo "  backup : ~/backup/dev.db.bak-$TS + ~/backup/app-$TS.tar.gz"

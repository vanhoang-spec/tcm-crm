#!/usr/bin/env bash
# Deploy TCM CRM lên server production — chạy từ MÁY DEV (Git Bash), một lệnh:
#
#   bash scripts/deploy.sh          # deploy thật
#   bash scripts/deploy.sh --check  # chỉ kiểm tiền trạm + kết nối, KHÔNG ghi gì lên server
#
# Quy trình (HANDOVER mục 8.2): tiền trạm local → chọn đường vào theo fingerprint → backup
# (kéo về cả máy dev) → sync code + dọn file mồ côi → build (app cũ VẪN chạy) → pm2 stop →
# migrate deploy → db:seed → pm2 start → health check.
#
# TUYỆT ĐỐI KHÔNG đụng dev.db / .env / storage trên server: từ 28/07/2026 dữ liệu thật sống
# trên production (lần đè DB 28/07 là LẦN CUỐI). Hỏng build thì app cũ vẫn chạy nguyên.
# Key SSH cần quyền 600: chmod 600 ~/.ssh/tcm_deploy

set -euo pipefail
cd "$(dirname "$0")/.."

# ── Cấu hình ──────────────────────────────────────────────
LAN_HOST=192.168.1.111
PUB_HOST=115.79.195.150; PUB_PORT=2222
FP_EXPECT='SHA256:EWU4YXJM5NoE01QTVwLnXV2ao1Q1TG7fwvabxf39CfU'
KEY="$HOME/.ssh/tcm_deploy"
PM2_APP=tcm-crm
BACKUP_ROOT=/d/TCM
NVM='export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1'

CHECK_ONLY=0; [ "${1:-}" = "--check" ] && CHECK_ONLY=1
TS=$(date +%Y%m%d-%H%M%S)
TMP=$(mktemp -d)
STAGE=tientram
trap 'on_fail' ERR
trap 'rm -rf "$TMP"' EXIT

log() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
die() { printf 'LỖI: %s\n' "$*" >&2; exit 1; }

on_fail() {
  echo
  case "$STAGE" in
    build)
      cat <<M
✗ HỎNG Ở BƯỚC BUILD — app CŨ vẫn đang chạy, chưa có gì đổi về runtime.
  Sửa lỗi rồi chạy lại script. Nếu web đang lỗi thiếu chunk (build đã xoá dở .next):
    ssh -p $PORT -i $KEY tcm@$HOST '$NVM; cd ~/tcm-crm; rm -rf .next; mv .next-prev .next; pm2 restart $PM2_APP'
M
      ;;
    chuyendoi)
      cat <<M
✗ HỎNG GIỮA LÚC CHUYỂN ĐỔI (app đang DỪNG) — khôi phục về bản trước deploy:
    ssh -p $PORT -i $KEY tcm@$HOST '$NVM; cd ~/tcm-crm
      cp ~/backup/dev.db.bak-$TS prisma/dev.db
      rm -rf .next && mv .next-prev .next
      pm2 start $PM2_APP'
  (DB backup lấy đúng lúc app đã dừng nên không mất giao dịch nào; migration additive nên
   bản build cũ trong .next-prev chạy được cả khi migrate đã áp một phần.)
M
      ;;
    dongbo)
      echo "✗ Hỏng lúc đồng bộ code — runtime chưa đổi (app cũ chạy từ .next cũ). Chạy lại script là được."
      ;;
    *)
      echo "✗ Lỗi ở giai đoạn '$STAGE' — chưa có gì thay đổi trên server."
      ;;
  esac
}

# ── B0. Tiền trạm trên máy dev ───────────────────────────
log "B0 — Tiền trạm local"
[ -f "$KEY" ] || die "không thấy key $KEY"
[ -z "$(git status --porcelain)" ] || die "repo chưa sạch — commit trước đã. Server không có git: deploy code chưa commit là tạo code mồ côi (HANDOVER mục 1)."
COMMIT_FULL=$(git log -1 --format='%H')
COMMIT=$(git log -1 --format='%h · %s')
echo "commit sẽ deploy: $COMMIT"

echo "· tsc --noEmit"
npx tsc --noEmit || die "TypeScript lỗi — không deploy"
echo "· i18n parity"
PARITY=$(node -e "const vi=require('./messages/vi.json'),en=require('./messages/en.json');function f(o,p=''){let k=[];for(const x in o){const q=p?p+'.'+x:x;if(o[x]&&typeof o[x]==='object')k=k.concat(f(o[x],q));else k.push(q)}return k}const V=new Set(f(vi)),E=new Set(f(en));console.log('only vi:',[...V].filter(k=>!E.has(k)).length,'only en:',[...E].filter(k=>!V.has(k)).length)")
echo "  $PARITY"
[ "$PARITY" = "only vi: 0 only en: 0" ] || die "vi.json / en.json lệch key — không deploy"

# ── B1. Chọn đường vào + xác minh fingerprint ────────────
log "B1 — Chọn đường vào server (fingerprint phải khớp $FP_EXPECT)"
probe() { ssh-keyscan -T 4 -p "$2" -t ed25519 "$1" 2>/dev/null | ssh-keygen -lf - 2>/dev/null | awk '{print $2}'; }
if [ "$(probe "$LAN_HOST" 22)" = "$FP_EXPECT" ]; then
  HOST=$LAN_HOST; PORT=22; echo "→ đường LAN: $HOST:22"
elif [ "$(probe "$PUB_HOST" "$PUB_PORT")" = "$FP_EXPECT" ]; then
  HOST=$PUB_HOST; PORT=$PUB_PORT; echo "→ đường ngoài: $HOST:$PORT (NAT về server)"
else
  die "KHÔNG đường nào trình ra đúng fingerprint — DỪNG, không đẩy gì. Kiểm mạng hoặc xem HANDOVER mục 8.1."
fi
SSHC() { ssh -p "$PORT" -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "tcm@$HOST" "$@"; }
SCPC() { scp -P "$PORT" -i "$KEY" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$@"; }

if [ "$CHECK_ONLY" = 1 ]; then
  log "--check: trạng thái server (không ghi gì)"
  SSHC "$NVM
    cd ~/tcm-crm
    echo \"node \$(node -v) · pm2 $PM2_APP: \$(pm2 jlist 2>/dev/null | node -pe 'JSON.parse(require(\"fs\").readFileSync(0,\"utf8\")).find(p=>p.name==\"$PM2_APP\")?.pm2_env.status ?? \"KHÔNG THẤY\"')\"
    echo \"đang chạy: \$(head -1 .deployed-commit 2>/dev/null || echo '(chưa ghi — trước khi có script này)')\"
    echo \"đĩa trống: \$(df -h ~ | awk 'NR==2{print \$4}')\"
    npx prisma migrate status 2>/dev/null | tail -3 || true"
  echo; echo "✓ Tiền trạm sạch, kết nối tốt. Bỏ --check để deploy thật."
  exit 0
fi

# ── B2. Backup (chưa ghi gì vào chỗ app đọc) ─────────────
log "B2 — Backup DB + code trên server, kéo về máy dev"
SSHC "mkdir -p ~/backup && cd ~/tcm-crm \
  && cp prisma/dev.db ~/backup/dev.db.bak-$TS \
  && tar czf ~/backup/app-$TS.tar.gz --exclude=node_modules --exclude=.next --exclude=.next-prev --exclude=prisma/dev.db . 2>/dev/null \
  && ls -la ~/backup/dev.db.bak-$TS ~/backup/app-$TS.tar.gz"
mkdir -p "$BACKUP_ROOT/backup-prod-$TS"
SCPC "tcm@$HOST:~/backup/dev.db.bak-$TS" "$BACKUP_ROOT/backup-prod-$TS/dev.db" >/dev/null
SCPC "tcm@$HOST:~/backup/app-$TS.tar.gz" "$BACKUP_ROOT/backup-prod-$TS/app.tar.gz" >/dev/null
# Backup phải MỞ ĐƯỢC chứ không chỉ tồn tại
STAFF_BK=$(DATABASE_URL="file:$BACKUP_ROOT/backup-prod-$TS/dev.db" node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL}}});p.staff.count().then(n=>{console.log(n);return p.\$disconnect()})" 2>/dev/null || echo 0)
[ "$STAFF_BK" -gt 0 ] || die "backup DB không mở được bằng Prisma — DỪNG trước khi ghi bất cứ gì"
echo "✓ backup mở được (staff=$STAFF_BK), bản sao ở $BACKUP_ROOT/backup-prod-$TS/"

# ── B3. Đồng bộ code + dọn file mồ côi ───────────────────
STAGE=dongbo
log "B3 — Đồng bộ code (KHÔNG đụng dev.db/.env/storage) + dọn file mồ côi"
tar czf "$TMP/code.tar.gz" \
  --exclude='./.git' --exclude='./node_modules' --exclude='./.next' --exclude='./.next-prev' \
  --exclude='./storage' --exclude='./.env' --exclude='./prisma/dev.db' \
  --exclude='./prisma/dev.db-journal' --exclude='./tsconfig.tsbuildinfo' --exclude='./tmp-*' \
  . 2>/dev/null
# Cây file chuẩn để server đối chiếu — tar giải nén KHÔNG xoá file local đã xoá (bẫy 28/07)
find src prisma/migrations messages public -type f | LC_ALL=C sort > "$TMP/manifest.txt"
LOC_MIG=$(ls prisma/migrations | grep -c '^2')
SCPC "$TMP/code.tar.gz" "tcm@$HOST:/tmp/code.tar.gz" >/dev/null
SCPC "$TMP/manifest.txt" "tcm@$HOST:/tmp/manifest.txt" >/dev/null
SSHC bash -s -- "$LOC_MIG" <<'REMOTE'
set -euo pipefail
LOC_MIG="$1"; cd ~/tcm-crm
ENV_MD5=$(md5sum .env | cut -d' ' -f1)
ST_SIZE=$(du -sb storage 2>/dev/null | cut -f1 || echo 0)
LOCK_MD5=$(md5sum package-lock.json | cut -d' ' -f1)
tar xzf /tmp/code.tar.gz -C ~/tcm-crm && rm -f /tmp/code.tar.gz
[ "$(md5sum .env | cut -d' ' -f1)" = "$ENV_MD5" ] || { echo '!! .env bị đổi sau giải nén — DỪNG'; exit 1; }
[ "$(du -sb storage 2>/dev/null | cut -f1 || echo 0)" = "$ST_SIZE" ] || { echo '!! storage bị đổi sau giải nén — DỪNG'; exit 1; }
find src prisma/migrations messages public -type f | LC_ALL=C sort > /tmp/remote-manifest.txt
comm -13 /tmp/manifest.txt /tmp/remote-manifest.txt > /tmp/orphans.txt
if [ -s /tmp/orphans.txt ]; then
  echo '-- xoá file mồ côi (local đã xoá, server còn sót):'
  sed 's/^/     /' /tmp/orphans.txt
  xargs -d '\n' rm -f < /tmp/orphans.txt
  find src prisma/migrations messages public -type d -empty -delete 2>/dev/null || true
else
  echo '-- không có file mồ côi'
fi
[ "$(ls prisma/migrations | grep -c '^2')" = "$LOC_MIG" ] || { echo "!! số migration lệch local ($LOC_MIG) — DỪNG"; exit 1; }
if [ "$(md5sum package-lock.json | cut -d' ' -f1)" = "$LOCK_MD5" ]; then echo LOCK_SAME > /tmp/lockflag; else echo LOCK_CHANGED > /tmp/lockflag; fi
echo "-- lockfile: $(cat /tmp/lockflag) · migration trên đĩa: $(ls prisma/migrations | grep -c '^2')"
REMOTE

# ── B4. Build khi app cũ còn chạy ────────────────────────
STAGE=build
log "B4 — Build trên server (app cũ vẫn phục vụ; hỏng thì không có gì đổi)"
SSHC bash -s <<REMOTE
set -euo pipefail
$NVM
cd ~/tcm-crm
if [ "\$(cat /tmp/lockflag)" = "LOCK_CHANGED" ]; then echo '-- lockfile đổi → npm ci'; npm ci; fi
npx prisma generate >/dev/null
rm -rf .next-prev; [ -d .next ] && cp -a .next .next-prev
npx next build 2>&1 | tail -12
REMOTE

# ── B5. Chuyển đổi: dừng → migrate → seed → chạy ─────────
STAGE=chuyendoi
log "B5 — pm2 stop → migrate deploy → db:seed → pm2 start"
SSHC bash -s -- "$COMMIT_FULL" "$TS" <<REMOTE
set -euo pipefail
$NVM
COMMIT="\$1"; DTS="\$2"; cd ~/tcm-crm
pm2 stop $PM2_APP >/dev/null
npx prisma migrate deploy 2>&1 | tail -4
npm run db:seed 2>&1 | { grep -E 'Seed|Error|error' || true; } | tail -3
printf '%s\ndeploy: %s\n' "\$COMMIT" "\$DTS" > .deployed-commit
pm2 start $PM2_APP >/dev/null && pm2 save >/dev/null
echo "-- đã chạy lại, commit ghi ở ~/tcm-crm/.deployed-commit"
REMOTE

# ── B6. Health check ─────────────────────────────────────
STAGE=health
log "B6 — Health check"
sleep 5
SSHC bash -s <<REMOTE
set -euo pipefail
$NVM
cd ~/tcm-crm
CODE=\$(node -e "fetch('http://localhost:3000/login').then(r=>{console.log(r.status);process.exit(r.status<500?0:1)}).catch(()=>{console.log('KHÔNG KẾT NỐI ĐƯỢC');process.exit(1)})")
echo "-- HTTP /login: \$CODE"
# (pm2 logs || true) để grep đóng ống sớm không thành SIGPIPE dưới pipefail
{ pm2 logs $PM2_APP --lines 100 --nostream 2>/dev/null || true; } | grep -m1 'scheduler bật' \
  || { echo '!! chưa thấy dòng [jobs] scheduler bật — kiểm pm2 logs'; exit 1; }
# giữ .next-prev làm bản rollback thường trực tới lần deploy sau
REMOTE

log "✓ DEPLOY XONG"
echo "  commit : $COMMIT"
echo "  đường  : $HOST:$PORT"
echo "  backup : $BACKUP_ROOT/backup-prod-$TS/ (máy dev) + ~/backup/ (server)"

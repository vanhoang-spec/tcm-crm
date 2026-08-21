#!/usr/bin/env bash
# Khai MỘT biến vào .env của production, chạy TRÊN SERVER bằng self-hosted runner.
#
# Sinh ra vì đường SSH cổng 2222 thi thoảng không thông từ ngoài công ty (HANDOVER §11: đã gặp
# 04/08 và 16/08), trong khi web vẫn chạy — lúc đó chủ dự án không có cách nào khai khoá API mới.
# Runner nằm SẴN trên server và tự gọi RA GitHub qua HTTPS nên không phụ thuộc NAT.
#
# ⚠ GIÁ TRỊ ĐI QUA BIẾN MÔI TRƯỜNG, KHÔNG QUA THAM SỐ DÒNG LỆNH: tham số dòng lệnh hiện trong
# `ps` cho mọi tiến trình khác trên máy đọc được.
# ⚠ KHÔNG BAO GIỜ `echo` giá trị. GitHub có che secret trong log, nhưng đó là lưới thứ hai —
# không in ra mới là chốt.
# ⚠ Chỉ dùng `node` (server KHÔNG có curl, không chắc có python3 — xem HANDOVER §11).
#
# Dùng:  KEY_NAME=ANTHROPIC_API_KEY KEY_VALUE=... bash scripts/set-env-key.sh
set -euo pipefail

APP_DIR="$HOME/tcm-crm"
ENV_FILE="$APP_DIR/.env"

[ -n "${KEY_NAME:-}" ]  || { echo "❌ Thiếu KEY_NAME"; exit 1; }
[ -n "${KEY_VALUE:-}" ] || { echo "❌ Thiếu KEY_VALUE — khai secret trên GitHub trước (xem workflow)"; exit 1; }
[ -f "$ENV_FILE" ]      || { echo "❌ Không thấy $ENV_FILE"; exit 1; }

# Chỉ cho phép tên biến dạng chuẩn — chặn việc nhét thêm dòng/lệnh vào .env qua tên biến.
# ⚠ Mẫu PHẢI viết kiểu loại-trừ. Bản đầu dùng `[A-Z_][A-Z0-9_]*)` và KHÔNG chặn được gì:
# trong glob, `*` là "mọi ký tự", không phải "lặp lại lớp ký tự đứng trước" như regex — nên
# `FOO"; rm -rf /` vẫn khớp và bị ghi thẳng vào .env (test bắt được).
case "$KEY_NAME" in
  ""|*[!A-Z0-9_]*|[0-9]*) echo "❌ KEY_NAME không hợp lệ: chỉ chữ HOA, số, gạch dưới, không bắt đầu bằng số"; exit 1 ;;
esac
# Giá trị có xuống dòng thì .env vỡ (dòng sau bị đọc thành biến khác) — chặn sớm, đừng ghi rồi mới biết.
case "$KEY_VALUE" in
  *$'\n'*|*$'\r'*) echo "❌ Giá trị chứa ký tự xuống dòng — kiểm lại lúc dán vào GitHub Secret"; exit 1 ;;
esac

BACKUP="$ENV_FILE.bak-$(date +%Y%m%d-%H%M%S)"
cp "$ENV_FILE" "$BACKUP"
echo "📦 Đã sao lưu .env → $(basename "$BACKUP")"

# Gỡ dòng cũ của ĐÚNG biến này (nếu có) rồi ghi lại — chạy nhiều lần không đẻ dòng trùng.
# Mọi biến khác trong .env giữ nguyên tuyệt đối.
ENV_FILE="$ENV_FILE" node -e '
const fs = require("fs");
const file = process.env.ENV_FILE, name = process.env.KEY_NAME, value = process.env.KEY_VALUE;
const keep = fs.readFileSync(file, "utf8").split(/\r?\n/).filter((l) => !new RegExp("^\\s*" + name + "\\s*=").test(l));
while (keep.length && keep[keep.length - 1] === "") keep.pop();
keep.push(name + "=" + JSON.stringify(value), "");
fs.writeFileSync(file, keep.join("\n"));
'

# Kiểm bằng SỐ DÒNG, không in giá trị.
COUNT=$(grep -c "^${KEY_NAME}=" "$ENV_FILE" || true)
[ "$COUNT" = "1" ] || { echo "❌ Sau khi ghi có $COUNT dòng $KEY_NAME (phải đúng 1) — khôi phục .env cũ"; cp "$BACKUP" "$ENV_FILE"; exit 1; }
echo "✅ $KEY_NAME: đã ghi (1 dòng, độ dài ${#KEY_VALUE} ký tự)"

# Biến .env chỉ được đọc lúc tiến trình khởi động → phải restart mới có tác dụng.
cd "$APP_DIR"
pm2 restart tcm-crm --update-env >/dev/null
echo "🔄 Đã khởi động lại CRM"

for i in $(seq 1 20); do
  CODE=$(node -e '
    fetch("http://127.0.0.1:3000/login", { redirect: "manual" })
      .then((r) => process.stdout.write(String(r.status)))
      .catch(() => process.stdout.write("000"));
  ' || true)
  if [ "$CODE" = "200" ]; then echo "🌐 Health check: /login → 200"; exit 0; fi
  sleep 3
done

echo "❌ App không trả 200 sau khi khởi động lại — xem: pm2 logs tcm-crm --lines 50"
echo "   Khôi phục: cp $BACKUP $ENV_FILE && pm2 restart tcm-crm --update-env"
exit 1

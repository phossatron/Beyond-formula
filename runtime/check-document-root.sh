#!/usr/bin/env bash
# ตรวจว่าไม่มีข้อมูลลับวางอยู่ใต้โฟลเดอร์ที่ runtime เสิร์ฟผ่าน HTTP
#
# `com.beyond-formula.runtime.plist` ใช้ `python3 -m http.server --directory <repo root>`
# ซึ่งเสิร์ฟ *ทุกไฟล์* ใต้โฟลเดอร์นั้น · `.gitignore` กันแค่ Git ไม่ได้กัน HTTP
# ไฟล์ที่ถูก ignore ไว้เพราะเป็นความลับ จึงยังโหลดผ่าน URL ได้อยู่ดี
#
# ใช้: ./runtime/check-document-root.sh   (exit 1 เมื่อเจอ)

set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plist="$root/runtime/com.beyond-formula.runtime.plist"

served="$(awk '/--directory/{getline; gsub(/.*<string>|<\/string>.*/,""); print; exit}' "$plist" 2>/dev/null)"
if [ -z "$served" ]; then
  echo "SKIP ไม่พบ --directory ใน $plist"
  exit 0
fi
echo "document root: $served"

# คำที่บอกว่าโฟลเดอร์นั้นตั้งใจไม่ให้หลุดออกไป
pattern='confidential|ความลับ|ห้ามเผยแพร่|ห้ามนำออก|supplier price|local evidence'
found=0

while IFS= read -r ignorefile; do
  dir="$(dirname "$ignorefile")"
  # อ่านเฉพาะบรรทัดแรก ๆ ที่คนมักเขียนเหตุผลไว้ แล้วดูว่ามันประกาศความลับหรือไม่
  if head -5 "$ignorefile" | grep -qiE "$pattern"; then
    while IFS= read -r entry; do
      case "$entry" in ''|'#'*) continue;; esac
      target="$dir/${entry%/}"
      [ -e "$target" ] || continue
      rel="${target#$served/}"
      count="$(find "$target" -type f 2>/dev/null | wc -l | tr -d ' ')"
      echo "FAIL ข้อมูลลับอยู่ใต้ document root: $rel ($count ไฟล์)"
      echo "     เสิร์ฟได้ที่ /$(echo "$rel" | sed 's/ /%20/g')/"
      found=1
    done < "$ignorefile"
  fi
done < <(find "$served" -name .gitignore -not -path '*/.git/*' 2>/dev/null)

if [ "$found" -eq 0 ]; then
  echo "PASS ไม่มีข้อมูลที่ประกาศตัวว่าลับอยู่ใต้ document root"
  exit 0
fi

cat <<'MSG'

วิธีแก้: ย้ายโฟลเดอร์นั้นออกไปนอก document root แล้วตั้งสิทธิ์ 700
ห้ามแก้หรือ restart runtime เพื่อหลบการตรวจนี้ และห้ามใช้ symlink แทนการย้าย
(http.server เดิน symlink ตาม ช่องจึงยังเปิดอยู่เหมือนเดิม)
MSG
exit 1

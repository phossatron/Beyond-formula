#!/usr/bin/env bash
# ตรวจว่าไม่มีข้อมูลลับวางอยู่ใต้โฟลเดอร์ที่ runtime เสิร์ฟผ่าน HTTP
#
# runtime ต้องเสิร์ฟเฉพาะสำเนาที่สร้างใน `runtime/site` เท่านั้น ไม่ใช่ repo root
# เพราะ `.gitignore` กันแค่ Git ไม่ได้กัน HTTP และ repo อาจมีหลักฐานภายในเครื่อง
#
# ใช้: ./runtime/check-document-root.sh   (exit 1 เมื่อเจอ)

set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
plist="$root/runtime/.runtime/com.beyond-formula.runtime.plist"
template="$root/runtime/com.beyond-formula.runtime.plist"

if [ -f "$plist" ]; then
  served="$(awk '/--directory/{getline; gsub(/.*<string>|<\/string>.*/,""); print; exit}' "$plist" 2>/dev/null)"
else
  served="$root/runtime/site"
fi
# อ่าน plist ไม่ออก = ตรวจไม่ได้ ไม่ใช่ "ไม่มีปัญหา" · การตอบ PASS ตรงนี้จะทำให้
# การจัดรูปแบบ plist ใหม่กลายเป็นวิธีปิดการตรวจแบบเงียบ ๆ จึงต้องล้มให้ดัง
if [ -z "$served" ]; then
  echo "FAIL อ่าน --directory จาก $plist ไม่ได้ — ตรวจไม่ได้ ไม่ใช่ว่าปลอดภัย"
  exit 1
fi
if [ ! -d "$served" ]; then
  echo "FAIL document root ที่ plist ระบุไม่มีอยู่จริง: $served"
  exit 1
fi
case "$served" in
  "$root/runtime/site") ;;
  *) echo "FAIL document root ไม่ใช่ runtime/site: $served"; exit 1 ;;
esac
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

#!/usr/bin/env bash
# 词书 · 数据下载脚本（一次性构建）
# 主源：ECDICT ecdict.csv（按考试标签覆盖中考/高考/四六级/考研，自带音标+中文释义）
# 备用：KyleBing/english-vocabulary（经 jsdelivr，国内可达）
set -e
cd "$(dirname "$0")/.."
mkdir -p tools/tmp data

ECDICT_URL="${ECDICT_URL:-https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv}"

echo "== 下载 ECDICT 词典数据（约 63MB，一次性）=="
for u in \
  "$ECDICT_URL" \
  "https://ghproxy.net/https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv" \
  "https://mirror.ghproxy.com/https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv"; do
  echo "尝试: $u"
  if curl -L --fail --max-time 1200 -o tools/tmp/ecdict.csv "$u" 2>/dev/null; then
    if [ -s tools/tmp/ecdict.csv ]; then
      echo "成功: $(ls -lh tools/tmp/ecdict.csv | awk '{print $5}')"
      exit 0
    fi
  fi
  echo "  失败，换下一个源"
done

echo "== 所有 ECDICT 源均失败 =="
echo "方案 A：通过环境变量指定镜像后重试，例如："
echo "  ECDICT_URL=https://gitee.com/xxx/ECDICT/raw/master/ecdict.csv bash tools/download.sh"
echo "方案 B：改用备用词书源（KyleBing，体积小，含音标）："
echo "  node tools/build.mjs --source kylebing"
exit 1

#!/usr/bin/env sh
set -eu

root_dir="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
app_dir="${T3CODE_RUNTIME_APP_DIR:-${root_dir}/packaging/runtime/app}"
t3code_web_dist="${T3CODE_WEB_DIST:-}"

rm -rf "${app_dir}"
mkdir -p \
  "${app_dir}/packages/server" \
  "${app_dir}/packages/web"

cp "${root_dir}/package.json" "${app_dir}/package.json"

cp "${root_dir}/packages/server/package.json" "${app_dir}/packages/server/package.json"
cp "${root_dir}/packages/web/package.json" "${app_dir}/packages/web/package.json"

cp -R "${root_dir}/packages/server/dist" "${app_dir}/packages/server/dist"
cp -R "${root_dir}/packages/server/drizzle" "${app_dir}/packages/server/drizzle"
cp -R "${root_dir}/packages/web/dist" "${app_dir}/packages/web/dist"

if [ -n "${t3code_web_dist}" ]; then
  test -f "${t3code_web_dist}/index.html"
  cp -R "${t3code_web_dist}" "${app_dir}/t3code-web-dist"
fi

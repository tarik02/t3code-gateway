#!/usr/bin/env sh
set -eu

root_dir="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
app_dir="${root_dir}/packaging/runtime/app"
t3code_web_dist="${T3CODE_WEB_DIST:-}"

rm -rf "${app_dir}"
mkdir -p \
  "${app_dir}/packages/contracts" \
  "${app_dir}/packages/server" \
  "${app_dir}/packages/web"

cp "${root_dir}/package.json" "${app_dir}/package.json"
cp "${root_dir}/pnpm-lock.yaml" "${app_dir}/pnpm-lock.yaml"
cp "${root_dir}/pnpm-workspace.yaml" "${app_dir}/pnpm-workspace.yaml"
cp "${root_dir}/tsconfig.json" "${app_dir}/tsconfig.json"
cp "${root_dir}/tsconfig.base.json" "${app_dir}/tsconfig.base.json"

cp -R "${root_dir}/node_modules" "${app_dir}/node_modules"

cp "${root_dir}/packages/contracts/package.json" "${app_dir}/packages/contracts/package.json"
cp "${root_dir}/packages/server/package.json" "${app_dir}/packages/server/package.json"
cp "${root_dir}/packages/web/package.json" "${app_dir}/packages/web/package.json"

cp -R "${root_dir}/packages/contracts/src" "${app_dir}/packages/contracts/src"
cp -R "${root_dir}/packages/server/src" "${app_dir}/packages/server/src"
cp -R "${root_dir}/packages/server/drizzle" "${app_dir}/packages/server/drizzle"
cp -R "${root_dir}/packages/web/dist" "${app_dir}/packages/web/dist"

if [ -n "${t3code_web_dist}" ]; then
  test -f "${t3code_web_dist}/index.html"
  cp -R "${t3code_web_dist}" "${app_dir}/t3code-web-dist"
fi

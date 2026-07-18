Container builds expect a prepared runtime app at `packaging/runtime/app`. Set
`T3CODE_RUNTIME_APP_DIR` to prepare another runtime directory for an image variant.

Required layout:

- `packages/server/dist/src/main.js`
- `packages/web/dist/client/index.html`

Optional layout:

- `t3code-web-dist/index.html`

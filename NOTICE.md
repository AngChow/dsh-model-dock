# NOTICE

`dsh-model-dock` is a derivative work. Its WorkBuddy host layer (`lib/auth.js`,
`lib/atrest.js`, `lib/catalog.js`, `lib/shim.js`, `lib/upstream.js`,
`lib/adapter.js`, `lib/identity.js`, `lib/variants.js`, `lib/paths.js`,
`lib/updates.js`, `lib/index.js`) and the WorkBuddy settings card in `client.js`
are adapted from:

- **dsh-workbuddy-connect** by sunzhengnan — <https://github.com/sixzjd/dsh-workbuddy-connect>
  - Licensed under the MIT License (see `LICENSE`).
  - Changes in this repository: package and route rename, automatic desktop
    session adoption on host start, Qoder detection in the status document, and
    a new left-rail "Secure Model Dock" panel in `client.js`.

The upstream wire behavior was in turn informed by the MIT-licensed
`Sliverkiss/workbuddy2api` project.

The QwenWork lane is assembled from two MIT projects:

- **pi-provider-qwenwork** by xiao-hans — <https://github.com/xiao-hans/pi-provider-qwenwork>
  - Source of `qwenwork-direct/lib/` and `qwenwork-direct/research/` (the
    stateless `agent_chat_generation` translation and the COSY WASM signer).
  - Changes: mounted as the dock's `qwenwork` lane, credential provider wired
    to the dock's desktop credential reader, loopback server and status routes
    owned by the dock, and no ACP conversation creation.
- **dsh-connect-qwenwork** by tang-bugu — <https://github.com/tang-bugu/dsh-connect-qwenwork>
  - Source of `qwenwork/desktop-auth.js` (desktop credential discovery).
  - Changes: macOS Keychain support added (the upstream build only read Windows
    DPAPI), and the ACP session code is not used.

The Qoder CN lane (`cn/`) is adapted from:

- **dsh-qoder-connect** by marsma-101 — <https://github.com/marsma-101/dsh-qoder-connect>
  - Licensed under the MIT License (see `cn/LICENSE`).
  - Changes: provider id `qoder-cn`, free-only catalog, bounded to the dock's
    own status/refresh routes, and macOS data-directory/keychain support in
    `cn/credentials.js` (the upstream store is Windows-first).

The Qoder global transport (`lib/qoder-proxy.js`) is adapted from `qoder-proxy` in:

- **wb-proxy** by Doone-skser — <https://github.com/Doone-skser/wb-proxy>
  - Licensed under the MIT License.
  - Changes in this repository: configurable credential path, a catalog that
    merges Qoder's `chat` / `assistant` / `app` surfaces (so QoDuck `lmodel` is
    visible), free flags from the upstream row, and a programmatic `serve()`
    that returns a loopback handle on an ephemeral port.

The dock icon (`assets/icon.svg`) is original artwork created for this plugin.

No WorkBuddy, CodeBuddy or Qoder trademark is claimed. The plugin only uses the
signed-in session of the desktop application installed by the user on the same
machine.

---

## Changes in this fork (AngChow/dsh-model-dock)

This repository is derived from `dsh-model-dock@0.8.3` by Sun Zhengnan.

Modified in `0.8.4`: the optional error-reporting feature was removed in full —
the compile-time default collector URL and token, the `POST
/plugins/dsh-model-dock/report` route, its handler, the report sanitizer and the
`report` route key — so no code path uploads diagnostics off the machine. The
local "copy diagnostics" action was kept; it only writes to the clipboard.
All upstream attribution above still applies.

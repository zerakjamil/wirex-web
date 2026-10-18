# macOS distribution and code signing, 2026-10-18

The desktop edition packs as an Electron app around the Next.js standalone server (`electron/main.js` forks `.next/standalone/server.js` on a free port starting at 38888 and loads it in a window). This document records what the packaging pipeline does without Apple credentials, exactly what was verified on this machine, and what changes when a Developer ID certificate exists.

## What ships

| Command | Output |
| --- | --- |
| `npm run electron:icon` | Regenerates `build/icon.icns` from `public/icon.svg` (rsvg-convert → sips → iconutil). Re-run when the SVG changes. |
| `npm run electron:pack` | `dist-electron/mac-arm64/wireX Network Simulator.app` (unpacked, signed) |
| `npm run electron:dist` | Same app plus `wireX Network Simulator-0.1.0-arm64.dmg` (with an Applications symlink) and `-arm64-mac.zip`, each with blockmaps |
| `npm run electron:verify [path]` | Signature integrity, hardening and entitlements plus a cold launch that must serve the embedded API |

Build settings (`package.json` → `build.mac`): `identity: "-"` (explicit **ad-hoc** signing), `hardenedRuntime: true`, `gatekeeperAssess: false` (Gatekeeper assessment is disabled because `spctl` cannot accept an ad-hoc signature), and both entitlements files point at `electron/entitlements.mac.plist`:

- `com.apple.security.cs.allow-jit` and `allow-unsigned-executable-memory` — V8 requires writable-executable memory under the hardened runtime.
- `com.apple.security.cs.disable-library-validation` — required while the app is ad-hoc signed, because the pre-signed Electron frameworks carry a different Team ID that library validation would reject. electron-builder prints an advisory about this on every ad-hoc build; it is expected and already handled.

`files` also excludes `!.next/standalone/dist-electron/**`: a stray nested app copy in the standalone output (left by an earlier ohand build run from that directory) was being packaged into the bundle, which produced a 337 MB recursive copy and broke signing on a nested, malformed `Electron Framework.framework`. With the exclusion, the build is immune to that stray directory reappearing.

## Verified evidence (Apple silicon, 2026-10-18)

`npm run electron:dist` completed end to end: the app was signed with `identityName=-` (ad-hoc) and notarization was skipped with the explicit reason `` `notarize` options were unable to be generated `` (no credentials in the environment — expected).

`npm run electron:verify` on the packed app, on the app extracted from the ZIP, and on the app inside the mounted DMG all pass:

- `codesign --verify --deep --strict` — passes; signature authority `ad-hoc`, code directory flags `adhoc,runtime`.
- Entitlements present: `com.apple.security.cs.allow-jit`, `com.apple.security.cs.disable-library-validation`.
- Cold launch: the embedded server answered `http://127.0.0.1:38888/api/sqlite?action=list-cram-cards` with HTTP 200 within the 45 s window, with no crash markers in the app output.
- The bundle carries `icon.icns` (sha256-identical to `build/icon.icns`) and `CFBundleIconFile = icon.icns`; the builder's "default Electron icon" warning is gone.
- `spctl -a -t exec -vv` — **rejected** (exit 3). This is correct for an ad-hoc, un-notarized bundle and is the reason Gatekeeper prompting must be documented for users until real signing lands.

## What users see today (un-notarized ad-hoc build)

- Moving the app **locally** (same Mac, no quarantine) and launching it works; the cold-launch check above is exactly this path.
- A **downloaded** copy carries `com.apple.quarantine`, so macOS shows the "Apple could not verify … is free of malware" prompt on first open. Users can still run it via right-click → Open, or by removing the attribute: `xattr -dr com.apple.quarantine "/Applications/wireX Network Simulator.app"`.
- A locally built app is not quarantined; only transferred files are.

## Credentials required for real distribution

True frictionless distribution needs an Apple Developer Program membership (USD 99/yr) and one-time setup:

1. **Signing certificate** — create a *Developer ID Application* certificate in the Apple Developer portal and install it in the login keychain. Then either:
   - set `build.mac.identity` to `"Developer ID Application: Your Name (TEAMID)"` in `package.json` (note: a configured `identity` wins over `CSC_NAME`, so remove `"-"`), or
   - remove `identity` entirely and export `CSC_LINK=/path/to/cert.p12` + `CSC_KEY_PASSWORD=…` for CI.
2. **Notarization credentials** — electron-builder 26 notarizes automatically when any credential set is present in the environment (recommended first option, an App Store Connect API key):
   - `APPLE_API_KEY=/path/AuthKey_XXXXXXXXXX.p8`, `APPLE_API_KEY_ID=XXXXXXXXXX`, `APPLE_API_ISSUER=<issuer uuid>`, or
   - `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, or
   - `APPLE_KEYCHAIN` + `APPLE_KEYCHAIN_PROFILE` (a `notarytool` keychain profile).
3. Re-run `npm run electron:dist`. When signing succeeds the build log replaces `signing … identityName=-` with the Developer ID identity and replaces the skip message with notarization progress.
4. Post-signing acceptance: `codesign --verify --deep --strict` and `spctl -a -t exec -vv "dist-electron/mac-arm64/wireX Network Simulator.app"` must report `accepted` with `source=Notarized Developer ID`, then `xcrun stapler validate` on the artifacts. The `electron:verify` cold-launch step stays applicable unchanged.

No secret material belongs in the repository; all credentials arrive through environment variables or the keychain.

## Other platforms

`build.win.target` is `portable` and `build.linux.target` is `AppImage`; neither is signed — Windows SmartScreen will warn until an EV/OV certificate is configured (`WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`), and Linux AppImages are unsigned by convention. Neither target has been built or verified on this machine; the Windows/Linux gates stay open.

## Remaining boundaries

- Ad-hoc signing is not a substitute for Developer ID + notarization; Gatekeeper rejects the current artifacts on machines that did not build them.
- The DMG is unsigned and unstapled (stapling requires a successful notarization first).
- No auto-update mechanism (`electron-updater`) is configured; updates are manual downloads.
- The `.app` is ~230 MB packed (`asar` is disabled because the standalone server reads files at runtime); an asar-copy scheme is future work, not a signing concern.

# Historical Bug Log: WireForge Network Simulator

Current wireX launch findings and fixes are recorded in `../docs/LAUNCH_READINESS.md`. The historical zero-open-bugs summary below does not certify launch readiness. Public shared-vault ownership, protocol scope, manual acceptance and distribution validation remain outstanding.

Build: 0.1.0  Date: 2026-10-07  Env: local dev, Web & Electron

### Summary
- Total bugs logged: 4
- Open S1 (blocker/data loss): 0
- Open S2 (major): 0
- Open S3 (moderate): 0
- Open S4 (cosmetic): 0
- Fixed so far: 4

---

### BUG-001: do show vlan and forgiving VLAN naming rejected in (config-vlan)#

- Severity: S2
- Flow / case: F02 / F02-E2
- Screen: S03 (Device Modal: CLI Tab)
- Build: 0.1.0  Browser / device: Chrome 140 / macOS

Steps:
1. Open Router (e.g. 2911) or Switch (2960) CLI tab.
2. Enter privileged mode: `enable` -> `configure terminal`.
3. Enter VLAN mode: `vlan 10`.
4. Run: `name Sales` or multi-token `name name Sales`.
5. Run: `do show vlan` or `do show vlan brief`.

Expected:
VLAN 10 name is recorded as "Sales", and `do show vlan` outputs the VLAN table showing ID 10 with name Sales and status active.

Actual:
Command returned `% Invalid input detected at '^' marker.` because `do` delegation and `name` variations were unhandled in `config-vlan` mode.

Evidence:
User screenshot showing `% Invalid input detected at '^' marker.` on `Office-Router (2911)` CLI. Unit test `router supports vlan creation, forgiving naming, and do show vlan variants` now verifies this.

Suspected cause:
`ciscoParser.ts` lacked `handleDoCommand` dispatch inside `config-vlan` submode and only parsed strict single-argument tokens.

Status: fixed in `src/simulator/ios/ciscoParser.ts`

---

### BUG-002: Browser default cyan focus outline renders around transparent terminal input

- Severity: S4
- Flow / case: F02
- Screen: S03 (Device Modal: CLI Tab)
- Build: 0.1.0  Browser / device: Chromium / WebKit 1440px

Steps:
1. Open any device CLI modal.
2. Click into the terminal prompt to focus the cursor.
3. Observe rectangular outline box rendered around the input element.

Expected:
Terminal prompt input blends smoothly with the black terminal background without a cyan border.

Actual:
A bright cyan outline box rendered around the input element when focused in WebKit/Chromium browsers.

Evidence:
User screenshot showing cyan box around `Office-Router(config-vlan)# do show vlan`.

Suspected cause:
Browser user-agent styles applying default `:focus-visible` outline to transparent `<input>` elements.

Status: fixed in `src/components/modals/DeviceModal.tsx` (`outline: none`, `border: none`, `boxShadow: none`)

---

### BUG-003: Quick CLI helper buttons in terminal toolbar omit "do" prefix in config submodes

- Severity: S3
- Flow / case: F02 / F02-E3
- Screen: S03 (Device Modal: CLI Tab)
- Build: 0.1.0  Browser / device: Chrome 140 / macOS

Steps:
1. Open device CLI and enter `configure terminal` or `vlan 10`.
2. Click Quick CLI button `sh vlan` or `sh ip int br` from the modal toolbar.

Expected:
The command automatically executes as `do show vlan brief` or `do show ip interface brief`.

Actual:
The raw EXEC command was sent without `do `, resulting in a Cisco syntax rejection error.

Evidence:
Console history in DeviceModal showing raw `show vlan brief` dispatched in `config-vlan` mode.

Suspected cause:
DeviceModal toolbar buttons sent static command strings without inspecting `device.currentCliMode`.

Status: fixed in `src/components/modals/DeviceModal.tsx` (`runQuickCiscoCommand` helper)

---

### BUG-004: Type error in terminal autocomplete keywords spread during production build

- Severity: S2
- Flow / case: F02
- Screen: S03
- Build: 0.1.0  Browser / device: TypeScript 5.x / Next.js build

Steps:
1. Run `npm run build`.

Expected:
Build succeeds with 0 type errors.

Actual:
Build failed with `error TS2488: Type 'string[] | undefined' must have a '[Symbol.iterator]()' method that returns an iterator.` at `terminalSuggestions.ts:152`.

Evidence:
Next.js compiler log: `src/components/modals/terminalSuggestions.ts(152,29): error TS2488`.

Suspected cause:
`c.keywords` in `CommandSuggestion` is optional (`keywords?: string[]`), and was spread directly without default fallback.

Status: fixed in `src/components/modals/terminalSuggestions.ts` (`(c.keywords || [])`)

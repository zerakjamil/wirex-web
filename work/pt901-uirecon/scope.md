# Case Scope

## meta
- case_id: pt901-uirecon
- created: 2026-10-16T21:00:12+03:00
- operator: local
- project_root: /Users/zerakjamil/.gemini/antigravity/scratch/cisco-packet-tracer-web
- primary_skill: macos-reverse/SKILL.md
- primary_id: R31
- lead_role: lead
- specialist_roles: []
- hint: Cisco Packet Tracer 9.0.1 macOS app bundle static recon for UI and feature parity into free web simulator wireX
- preset: offline-sample

## auth
- status: granted
- basis: own_system
- evidence_of_auth: preset:offline-sample (owner-operated local file)
- MUST NOT proceed if status != granted

## in_scope
- assets:
  - /Applications/Cisco Packet Tracer 9.0.1/Cisco Packet Tracer 9.0.1.app/Contents/MacOS/PacketTracer
- surfaces: []
- activities: []

## out_of_scope
- assets: []
- activities: [dos, phishing_real_users, unrestricted_exfil]

## network_profile
- mode: offline
- notes: |
    offline | lab_only | authorized_target_only | unrestricted_lab
    Change mode only after auth.status = granted.
    Presets: offline-sample | ctf-public | own-system

## deliverables
- report: true
- field_journal: true
- diagrams: true
- timeline: true

## constraints
- timebox: {}
- stealth: low
- data_handling: anonymize

## signoff
- ready_for_act: true
- checklist:
  - [x] auth.status = granted
  - [x] in_scope.assets non-empty OR offline sample path set
  - [x] network_profile.mode chosen
  - [ ] out_of_scope reviewed
  - [ ] roles assigned (see skills/ops/role-map.md)

## ops_refs
- skills/ops/scope-contract.md
- skills/ops/evidence-finding-path.md
- skills/ops/role-map.md
- skills/ops/timeline-workitem.md
- skills/ops/IDENTITY.md

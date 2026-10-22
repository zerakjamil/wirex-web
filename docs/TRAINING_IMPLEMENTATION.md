# Campus training implementation

Open **Training** in the title bar to choose TCP/IP, Ethernet, VLANs, spanning tree, EtherChannel, or the three-department campus exercise. Guided, recall, troubleshooting, and free-practice modes use the existing network store and IOS execution path. Returning from training restores the original imported network; the exercise and progress also survive browser reloads.

Every lesson now carries a **full configuration walkthrough** alongside the goal. It lists the topology, prerequisites, one step per device, the complete command block for that device, verification commands, expected-output excerpts, and common mistakes. Each step can copy its complete command block with one click. Guided and free-practice modes show the commands; recall, troubleshoot, and exam modes hide them so the learner has to retrieve or diagnose the configuration. The EtherChannel guide configures both Distribution-A and Distribution-B, not just one side, and the exam walkthrough covers both switches plus the router while remaining hidden during the exam. At the final hint level, the command reveal is filtered to the selected device, so a two-switch lesson shows the current switch's block rather than mixing both ends. The unit suite executes every guide and hint-sheet command block through the same command engine as the CLI, so a broken verification command fails the build instead of reaching a learner.

The lesson panel assesses real configuration. The CLI dock shows bounded before/after observations from executed commands. An explicit traffic test sends ARP and ICMP; a previous successful test stops counting when relevant configuration changes. Hints are progressive, and recall mode initially hides commands. The campus exercise includes Sales, Management, Admin, interface ranges, trunks, and management SVIs. A management SVI does not enable inter-VLAN routing.

**Diagnose connection** is available in ordinary workspaces and training. Findings identify the device and interface, observed value, expected condition, and suggested checks or commands. Checks cover missing or duplicate addressing, masks and gateways, DHCP leases and pools, shutdown or disconnected interfaces, access VLANs, trunk allow-lists and native VLANs, and missing routes. A healthy redundant forwarding path avoids blaming an unused alternate link. A clean configuration report is not proof of delivery; students must run the traffic test.

## Implemented simulation behavior

- Trunk allow-list and native-VLAN commands update port configuration.
- Steady-state per-VLAN STP derives root election, costs, port roles, forwarding, show output, and blocked-link indicators from topology state.
- Compatible LACP, PAgP, and static EtherChannel settings determine operational bundles; labels alone do not establish a channel.
- SVIs require a configured VLAN, administrative enablement, and an operational eligible physical member. Virtual interfaces cannot accept cables.
- DHCP allocates unused local addresses from matching pools, respects exclusions, and updates the client's address, gateway, and DNS. Renew actions use the same allocator.
- Unsupported speed, duplex, and DHCP relay commands report their limitation instead of silently succeeding.

## Languages and layout

English, Arabic, and Central Kurdish are selectable and remembered. Authored lessons, tasks, hints, command-feedback labels, diagnostic explanations, and core workspace controls have translations. Arabic and Kurdish use RTL layout while CLI commands, addresses, and network geometry remain LTR. Smaller training viewports offer Lesson, Network, and CLI views.

Native proofreading has not been performed. Some older device windows and help content still contain English; localization should not yet be advertised as exhaustive or professionally reviewed.

The cursor drags devices and pans empty workspace space. Shift-drag or the separate area tool selects overlapping nodes. Selected devices move together, and group movement has an undo checkpoint.

## Validation and limits

725 automated tests pass, including three training-guide and verification tests. TypeScript and the production build pass. ESLint has zero errors and 28 existing warnings. The full production-browser suite passes 87/87; the unchanged simulation-scale bound measured 137 ms in the full 87-test run after setup rendering was excluded from the realtime window. Browser checks verified language switching, RTL/LTR separation, a 390-pixel training viewport without horizontal page overflow, cursor panning, individual movement, overlapping area selection, and group movement. Test device positions were restored. A saved dark-mode toggle covers workspace chrome, cables and labels, training, dialogs, and device-window surfaces; browser checks verified reload persistence and switching back to light.

STP models BPDU exchange, per-VLAN forwarding states, and steady-state root/role selection; it is not a full 802.1D interop or external-output model. DHCP does not animate DORA, expire leases, or implement relay. HTTP models bounded TCP timeout retries; full TCP windows/congestion, raw packet timing, collisions, and electrical/FCS behavior are not implemented. Diagnostics cover modeled configuration faults and are not a complete Cisco protocol analyzer. Instructor accounts, cloud class management, adaptive recall scheduling, and further campus buildings remain future work.

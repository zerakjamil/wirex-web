# Campus training plan

Status: initial training release implemented. See [implementation details](TRAINING_IMPLEMENTATION.md) for delivered features, validation, and simulation limits. The design below also contains longer-term curriculum goals.

## Purpose

Help college students understand, practice, remember, and troubleshoot the commands in their course. Every exercise connects an IOS command to its actual configuration change and, when relevant, a visible change in packet forwarding. Preserve the intuitive workspace so practice transfers to real network engineering labs.

## Material reviewed

- CCNA 200-301 Chapter 1, Introduction to TCP/IP Networking: TCP/IP and OSI models, HTTP, TCP recovery, routing, encapsulation, and protocol data units.
- CCNA 200-301 Chapter 2, Fundamentals of Ethernet LANs: SOHO and enterprise LANs, copper and fiber, cable pinouts, frames, MAC addressing, hub behavior, and duplex.
- CCNA2-Lab 1, 18 slides: VLAN types; VLAN creation and naming; individual and range access-port assignment; VLAN interface IP addresses; trunk configuration; verification and troubleshooting. Command screenshots inspected directly, including slides 9-18.
- CCNA2-Lab 3, 15 slides: root election; port states and roles; per-VLAN primary/secondary roots; PortFast; EtherChannel; PAgP/LACP modes; verification. Embedded topology and CLI screenshots inspected directly.

Source PDFs and decks remain unchanged. Lesson text should explain the material in our own words and link back to the relevant source page or slide.

## Campus and screen design

One logical campus grows across lessons. Start with a teaching building containing two access switches and PCs. Add Sales (VLAN 10), Management (VLAN 20), and Admin (VLAN 30), reflecting Lab 1's examples. Later add a redundant distribution block, a server room, and an optional voice building. Use the actual small topologies from each lab as focused views within this campus, rather than starting students with a large preconfigured enterprise network.

The campus is a navigable network map, not a new 3D graphics engine. Buildings group devices; students enter a building or open a focused exercise. A campus overview shows the connections between buildings. Only the active exercise runs demonstration traffic.

Keep the existing menus, device shelf, cable tools, and device windows. Add a Training entry that opens:

- A collapsible lesson panel with the objective, selected device, current task, and optional hints. Keep the device navigator reachable through a Devices tab.
- The topology in the center, highlighting only the relevant devices, ports, VLANs, or path.
- A docked CLI for the selected device, with independent device windows still available.
- A bounded observation panel showing the last command's before/after state and an explicit Test traffic action.

An ordinary command does not automatically launch a continuous ping or animate every link. Layer and VLAN overlays are optional and include text labels so color is not the only explanation.

## Learning modes

1. Guided: task, short explanation, required IOS mode, progressive hints, optional command reveal.
2. Recall: show the task without its command; let students reconstruct it using IOS help and their memory.
3. Troubleshoot: load a deliberately broken configuration and ask students to diagnose and repair it. Hints reveal evidence before revealing the fix.
4. Free practice: explore a copy of the campus without assessment pressure.

Save attempts, hints used, completed objectives, and the student's configuration locally. Offer export/import. Revisit objectives the student struggled with in short recall exercises. Instructor accounts, class dashboards, grades, and cloud sync are later work, not prerequisites for the first useful release.

## Course sections

| Section | Exercises | Visible evidence |
| --- | --- | --- |
| TCP/IP foundations | Send a message; identify layers; follow encapsulation; trace a routed packet | Header views, source/destination addresses, next hop, and encapsulation changes |
| Ethernet foundations | Choose cables; inspect frames; learn MAC addresses; compare unicast and broadcast | Link compatibility, MAC-table learning, bounded frame paths, and broadcast recipients |
| Lab 1: VLANs | Create/name VLANs; assign one port and a range; configure trunks; configure/inspect an SVI | VLAN table, port membership, trunk-carried VLANs, SVI state, and test connectivity |
| Lab 3: STP | Find the root; explain blocked ports; change roots for VLAN 10/20; disconnect an uplink | Bridge priorities, root path costs, port roles/states, and reconvergence timeline |
| Lab 3: EtherChannel | Configure members on both ends; compare negotiation modes; troubleshoot incompatible members | Operational bundle membership, negotiation result, STP treatment, and failover |
| Campus challenges | Repair wrong VLANs, missing trunks, shutdown ports, unsuitable roots, or mismatched channels | The smallest failing path, relevant table entries, and a verified repaired outcome |

Physical cable distances, electrical collisions, FCS errors, and full protocol timers must not be represented as simulated until their models exist. HTTP now has a bounded TCP timeout retry model; lessons should describe that scope accurately. Early foundation lessons can use clearly identified conceptual demonstrations alongside real supported packet behavior.

## First complete exercise: connect Sales across two switches

Use the classroom switch model and interface names, two switches, an inter-switch link, and Sales PCs on both sides. PCs have explicit same-subnet addressing. Additional department PCs illustrate isolation.

1. Enter privileged and configuration modes. Show the changed CLI prompt; no network animation.
2. Create VLAN 10 and name it Sales. Show the new VLAN row. Explain that creating a VLAN alone does not reassign ports.
3. Select the correct access interface and assign VLAN 10. Highlight the interface and its changed membership. Keep PC IP addressing unchanged.
4. Assign a range of department ports. Highlight exactly the affected ports.
5. Configure the inter-switch trunk on both ends. Show operational trunk state and which VLANs it carries.
6. Verify with the course's show commands. Populate output from real state.
7. Send one test between Sales PCs. Follow ARP and ICMP through the appropriate VLAN and show the result.
8. Attempt a test into another department without routing. Explain the actual failure instead of implying VLAN creation enables routing.
9. Save the configuration, then repeat the objective in recall mode.

Example command feedback:

| Command | Feedback |
| --- | --- |
| `interface fastEthernet 0/1` | Select Fa0/1; configuration context changes, forwarding does not |
| `switchport access vlan 10` | Fa0/1 membership changes from its previous VLAN to 10; future eligible traffic uses that broadcast domain |
| `no shutdown` | Administrative state changes; operational state still depends on power, peer, cable, and protocol state |
| `show vlan` | Show current membership without changing the network |
| Invalid command or wrong IOS mode | Preserve IOS error output; explain the relevant context without inventing a successful change |

## Training architecture

Use the existing network store and IOS execution path as the single source of truth. Do not build a separate training simulator or fabricate visual changes by matching command strings.

After command execution, emit a structured event containing device, input, parsed command/context, result, and actual state changes. Classify configuration changes, context-only commands, observations, errors, and unsupported commands separately. UI overlays and explanations consume those events after the state commits.

Each lesson defines its source reference, prerequisite skills, starter topology, tasks, allowed hints, completion predicates, traffic tests, and troubleshooting variants. Assess real configuration and behavior, not exact spelling or a prescribed command order. Accept valid IOS abbreviations and equivalent solutions. Show the required privilege/interface mode when giving command help.

Store lesson progress separately from ordinary imported files. Entering Training opens an isolated exercise session; returning to the normal workspace restores the user's network. Save the exercise topology, selected lesson/step, hint history, and progress across reload. Provide Retry step and Reset exercise without overwriting the user's imported PKT workspace.

Keep recent command observations bounded. Snapshot only at meaningful exercise edits/checkpoints. Reuse packet queue bounds and avoid recomputing the whole campus on animation frames. Use a deterministic, controllable simulation clock for protocol lessons; provide pause, step, and accelerated time with clear labels.

## Accuracy work required before teaching

The current code already has useful VLAN membership, interface range, basic IP configuration, MAC/ARP learning, and bounded ICMP forwarding behavior. These must be verified against the precise classroom scenarios before marking any lesson ready.

Gaps observed before implementation (the implementation report records which are resolved):

- Global and interface `spanning-tree` commands currently return success without applying configuration.
- `show spanning-tree` currently contains fixed root/bridge values rather than topology-derived results.
- Current forwarding uses a simplified loop-free graph, not Cisco per-VLAN root election or BPDU state/timer behavior.
- Trunk native/allowed VLAN CLI branches currently accept commands without updating their settings.
- Speed/duplex commands are accepted without behavioral changes.
- EtherChannel CLI negotiation and operational membership need implementation and validation; imported bundle labels alone do not prove a channel formed.
- SVI creation, operational state, supported switch-model limitations, and show-command variants need validation. A VLAN interface IP must not imply inter-VLAN forwarding is enabled.
- Full HTTP/TCP and physical Ethernet demonstrations need an explicit capability audit before presenting their animation as real simulation.

First remove silent success for unsupported lesson commands or implement the underlying behavior. For STP, use one topology-derived model for forwarding, LEDs, root/port overlays, and show output. The same requirement applies to operational trunks and EtherChannel. Preserve course examples, but flag an example's prerequisites or limitations instead of reproducing misleading behavior.

## Implementation sequence

1. Verify course command coverage and fix relevant CLI/forwarding gaps. Capture tests for each example topology and expected command effect.
2. Build Training session isolation, the lesson panel, command observation events, and state-based assessment. Deliver the complete VLAN exercise above with guided and recall modes.
3. Add TCP/IP and Ethernet visual lessons, explicit frame inspection, and small troubleshooting exercises.
4. Implement accurate per-VLAN STP and compatible EtherChannel negotiation; deliver Lab 3 exercises.
5. Expand the campus and add saved recall practice, additional instructor-authored lessons, and optional voice exercises. Add class management only if later requested.

## Acceptance criteria

- Course commands, valid abbreviations, incorrect modes, and common mistakes produce the expected CLI and actual state result.
- A command that changes no state produces no invented network effect.
- Configuration, forwarding, LEDs, inspector values, assessment, and show output agree.
- Tests prove same-VLAN forwarding, VLAN isolation, trunk behavior, root election changes, blocked ports, and bundle negotiation for lessons that claim them.
- Hints teach progressive reasoning; recall mode does not expose the answer automatically.
- Progress and exercise state survive reload without replacing imported workspace data.
- Only active demonstration traffic runs; packets and observation history remain bounded on larger campus topologies.
- Desktop and smaller viewports keep the CLI, current task, and relevant topology usable.
- No lesson is marked ready solely because a command is accepted or a port icon turns green.

## Recommendation

The first release supports practicing, observing, verifying, retrying, and returning to the original network. Extend the remaining protocol models and obtain native-language review before describing the entire course or localization as complete.

# CCNA Academy pilot instruments

Version 1.0 · 2026-10-21

This file contains participant-facing instruments, a scorer-only answer key, the transfer task, the rubric, and the survey. **Do not give participants the answer-key sections.** Copy only the participant sections into the handout.

## Part A — Pre/post concept test (participant form)

**Instructions:** 12 questions, 15 minutes, closed book. Choose the single best answer. There is no penalty for guessing. Record your anonymous ID, not your name.

1. A web browser sends an HTTP request. Which order best describes encapsulation as the data moves down the stack?
   - A. Frame → packet → segment → bits
   - B. Segment → packet → frame → bits
   - C. Packet → segment → frame → bits
   - D. Segment → frame → packet → bits

2. A PC at `10.0.10.5/24` sends a packet to `10.0.20.8`. The PC has no ARP entry for the destination. What destination MAC address goes in the frame?
   - A. The broadcast address
   - B. The destination host's MAC address
   - C. The default gateway's MAC address
   - D. The switch's management MAC address

3. Which OSI layer is most associated with encryption, compression, and data-format translation?
   - A. Application
   - B. Presentation
   - C. Session
   - D. Transport

4. How many twisted pairs does 1000BASE-T use?
   - A. One
   - B. Two
   - C. Four
   - D. Eight

5. Which cable connects a PC's Ethernet NIC to a switch access port?
   - A. Straight-through
   - B. Crossover
   - C. Rollover
   - D. Serial

6. A switch receives a frame for a unicast MAC address that is not in its MAC table. What does it do?
   - A. Drops the frame
   - B. Sends the frame back out the ingress port
   - C. Floods the frame out the other ports in the same VLAN
   - D. Sends the frame to the default gateway

7. Which command stores a hashed privileged EXEC password?
   - A. `enable password`
   - B. `enable secret`
   - C. `service password-encryption`
   - D. `login local`

8. Which command creates a local user named `admin` with a hashed password for SSH login?
   - A. `username admin password cisco`
   - B. `username admin secret cisco`
   - C. `enable secret admin`
   - D. `line vty 0 4` followed by `password admin`

9. Before generating RSA keys for SSH on a Cisco IOS switch, which two items must be set?
   - A. Hostname and domain name
   - B. Enable secret and banner
   - C. NTP server and DNS server
   - D. VLAN 1 and a default gateway

10. A VLAN is best described as:
    - A. A physical cable segment
    - B. A logical broadcast domain
    - C. A routing protocol
    - D. A WAN encapsulation

11. Which command assigns an access port to VLAN 10?
    - A. `switchport mode access`
    - B. `switchport access vlan 10`
    - C. `switchport trunk allowed vlan 10`
    - D. `vlan 10` under the interface

12. An 802.1Q tag is inserted:
    - A. Before the destination MAC address
    - B. Between the source MAC address and the EtherType field
    - C. After the frame check sequence
    - D. Inside the IP header

---

## Part B — Scorer-only answer key and rationale

**Do not distribute this section.** One point per item.

| Item | Answer | Rationale | Academy section |
| --- | --- | --- | --- |
| 1 | B | Data becomes a segment at transport, a packet at network, a frame at data link, then bits at physical. | 1.8 |
| 2 | C | The destination is off-subnet, so the PC resolves the default gateway's MAC and sends the frame to the router. | 1.7, 1.9 |
| 3 | B | The presentation layer handles formatting, compression, and encryption in the OSI model. | 1.4, 1.5 |
| 4 | C | 1000BASE-T uses all four pairs for simultaneous transmit and receive. | 2.4 |
| 5 | A | A straight-through cable connects unlike categories such as a PC NIC and a switch access port. | 2.4 |
| 6 | C | Unknown unicast frames are flooded within the VLAN, out every other port; the ingress port is excluded. | 2.12 |
| 7 | B | `enable secret` stores a hash; `enable password` stores clear text unless other protections are added. | 3.2 |
| 8 | B | `username admin secret cisco` creates a local user with a hashed secret usable by `login local`. | 3.4 |
| 9 | A | IOS needs a hostname and a domain name to generate the RSA key pair used by SSH. | 3.5 |
| 10 | B | A VLAN is a logical Layer 2 broadcast domain, not a physical segment or a routing protocol. | 4.1 |
| 11 | B | `switchport access vlan 10` assigns the VLAN; `switchport mode access` only sets the mode. | 4.5 |
| 12 | B | The 4-byte 802.1Q tag sits between the source MAC and the EtherType; the FCS is recalculated. | 4.3 |

If a participant selects two answers or leaves an item blank, score 0. Do not award partial credit on the concept test.

---

## Part C — Delayed test (participant form)

**Instructions:** 8 questions, 12 minutes, closed book. Choose the single best answer.

1. A PC at `172.16.1.10/24` sends a packet to `172.16.2.20`. What destination MAC address does the PC put in the frame?
   - A. The broadcast address
   - B. The destination host's MAC address
   - C. The default gateway's MAC address
   - D. The switch's MAC address

2. Which PDU is created at the transport layer?
   - A. Frame
   - B. Segment
   - C. Packet
   - D. Bit

3. Which pins does 100BASE-TX use on an MDI port?
   - A. 1, 2, 3, and 6
   - B. 1, 2, 4, and 5
   - C. 3, 6, 7, and 8
   - D. All eight pins

4. Which cable type is recommended between two switch access ports when auto-MDIX is not assumed?
   - A. Straight-through
   - B. Crossover
   - C. Rollover
   - D. Console

5. Which command encrypts plaintext passwords in the running configuration?
   - A. `enable secret`
   - B. `service password-encryption`
   - C. `login local`
   - D. `crypto key generate rsa`

6. Which command sets a switch's default gateway to `192.168.10.1`?
   - A. `ip route 0.0.0.0 0.0.0.0 192.168.10.1`
   - B. `ip default-gateway 192.168.10.1`
   - C. `default-router 192.168.10.1`
   - D. `gateway 192.168.10.1`

7. Which command displays VLAN membership and port assignments?
   - A. `show ip route`
   - B. `show vlan brief`
   - C. `show mac address-table`
   - D. `show interfaces status`

8. Two switch ports are both left in the default `dynamic auto` mode and connected. What happens?
   - A. They form a trunk
   - B. They stay in access mode
   - C. They form an EtherChannel
   - D. They elect a root bridge

### Delayed answer key (scorer only)

| Item | Answer | Rationale |
| --- | --- | --- |
| 1 | C | Off-subnet destination; the PC uses the gateway's MAC. |
| 2 | B | Transport layer data is a segment; network is a packet; data link is a frame. |
| 3 | A | 100BASE-TX uses pairs 1–2 and 3–6; on MDI, 1/2 transmit and 3/6 receive. |
| 4 | B | Like devices (switch-to-switch) use a crossover cable when auto-MDIX is absent. |
| 5 | B | `service password-encryption` weakly encrypts plaintext passwords in the config. |
| 6 | B | A Layer 2 switch uses `ip default-gateway` for management traffic. |
| 7 | B | `show vlan brief` lists VLANs and their access ports. |
| 8 | B | Two `dynamic auto` ports wait for the other side and never initiate, so they stay access. |

### Configuration-recall task (5 points, 5 minutes)

Ask the participant to write the commands, without the simulator, for:

1. Create VLAN 10 and name it `STUDENTS`.
2. Make `Fa0/1` an access port in VLAN 10.
3. Make `Fa0/24` an 802.1Q trunk.
4. Create router subinterface `G0/0.10` for VLAN 10 with `192.168.10.1/24`.
5. Bring that subinterface up.

Score one point per item; award 0.5 only when the command family is correct but one required subcommand is missing (`no shutdown`, `encapsulation dot1Q 10`, or `switchport mode access`). Record the written answer.

Example key (accept equivalent IOS syntax):

```cisco
vlan 10
 name STUDENTS

interface fa0/1
 switchport mode access
 switchport access vlan 10

interface fa0/24
 switchport mode trunk

interface g0/0.10
 encapsulation dot1Q 10
 ip address 192.168.10.1 255.255.255.0
 no shutdown
```

---

## Part D — Transfer task (participant handout)

**Scenario:** You are the junior network engineer for a small training room. Build the topology, configure VLANs and trunks, and make every PC reach the others according to the plan. You have 35 minutes. You may use the simulator's help, but not the Academy during the timed task.

### Topology

```
PC1 ── Fa0/1 ┐
PC2 ── Fa0/2 ┤ SW1 ── Fa0/23 ────── Fa0/24 ── SW2 ── Fa0/1 ── PC3
             │  │                              └── Fa0/2 ── PC4
             │  └── Fa0/24 ── G0/0 ── R1
```

- R1 `G0/0` connects to SW1 `Fa0/24`.
- SW1 `Fa0/23` connects to SW2 `Fa0/24`.
- PC1 and PC2 connect to SW1 `Fa0/1` and `Fa0/2`.
- PC3 and PC4 connect to SW2 `Fa0/1` and `Fa0/2`.
- Use the cable type the course recommends for each link.

### Addressing plan

| Device | Interface | VLAN | Address | Mask | Gateway |
| --- | --- | --- | --- | --- | --- |
| PC1 | NIC | 10 | 192.168.10.10 | 255.255.255.0 | 192.168.10.1 |
| PC2 | NIC | 10 | 192.168.10.11 | 255.255.255.0 | 192.168.10.1 |
| PC3 | NIC | 20 | 192.168.20.10 | 255.255.255.0 | 192.168.20.1 |
| PC4 | NIC | 20 | 192.168.20.11 | 255.255.255.0 | 192.168.20.1 |
| R1 | G0/0.10 | 10 | 192.168.10.1 | 255.255.255.0 | — |
| R1 | G0/0.20 | 20 | 192.168.20.1 | 255.255.255.0 | — |

### Requirements

1. Create VLAN 10 and VLAN 20 on both switches.
2. Assign the four access ports exactly as shown. Do not assign the trunk ports to an access VLAN.
3. Configure both inter-switch links as 802.1Q trunks. Allow only VLANs 10 and 20. Leave the native VLAN at its default.
4. Configure router-on-a-stick on R1 with one subinterface per VLAN.
5. Configure the PCs with the addresses in the table.
6. Verify with `show vlan brief`, `show interfaces trunk`, and `show ip interface brief`.
7. Prove connectivity with pings:
   - PC1 → PC2 (same VLAN)
   - PC1 → PC3 (inter-VLAN, across the trunk)
   - PC2 → PC4
   - each PC → its default gateway
8. When the instructor injects a fault, find the cause and restore all pings. You have 10 minutes for this part.

### Evidence to submit

- Workspace export named `P-XXXX-transfer.json`.
- CLI output for the three `show` commands on the relevant devices.
- A short note (3–5 sentences) explaining the fault you found and the command that fixed it.

The instructor will import the workspace and verify the configuration. Do not rely on screenshots alone.

---

## Part E — Instructor setup and fault injection (scorer only)

### Baseline

Before the participant starts, confirm the workspace is clean and the device palette is available. Do not pre-build the topology. If the participant cannot get a baseline link up, help only with simulator mechanics (placing a device, opening a CLI), not with the networking design. Record any baseline help; it is not part of the transfer score.

### After the participant reports all baseline pings passing

Inject exactly one fault:

```cisco
! On SW2
configure terminal
interface fa0/24
switchport trunk allowed vlan remove 20
end
```

This leaves the trunk up but removes VLAN 20 from it. PC3 and PC4 lose inter-VLAN and cross-switch connectivity. The expected fix is:

```cisco
configure terminal
interface fa0/24
switchport trunk allowed vlan add 20
end
```

If the simulator reports a different interface name, use the actual trunk interface and record the substitution. Do not inject a second fault. If the baseline does not work, fix the baseline with the participant and note it; do not score the injected fault as a participant failure.

### Verification after the fix

- All four PCs can ping their gateway.
- PC1 can ping PC2, PC3, and PC4.
- PC3 can ping PC4.
- `show interfaces trunk` shows VLANs 10 and 20 allowed on both trunks.
- The participant can explain that VLAN 20 was removed from the allowed list on SW2's trunk.

---

## Part F — Transfer rubric (20 points, scorer only)

Score each dimension independently. Use the workspace, not the participant's claims. Record evidence in the notes.

| Dimension | Points | Descriptor |
| --- | --- | --- |
| Topology and links | 3 | **3:** all five links present and up; correct cable categories; no extra links. **2:** all links up but one cable-category or placement issue. **1:** topology mostly present but one link missing/down. **0:** topology unusable. |
| VLANs and access ports | 5 | **5:** VLAN 10 and 20 exist on both switches; all four access ports correct; no access port misassigned. **3–4:** one access port or one switch missing a VLAN. **1–2:** multiple assignment errors. **0:** VLANs absent or all access ports wrong. |
| Trunks | 5 | **5:** both trunks up and 802.1Q; allowed VLANs 10 and 20; native VLAN consistent. **3–4:** one trunk issue (allowed list or native mismatch) but the design is otherwise correct. **1–2:** one trunk down or in the wrong mode. **0:** no working trunk. |
| Inter-VLAN routing | 4 | **4:** both subinterfaces up, correct 802.1Q encapsulation and IPs; all PCs use the correct gateways. **2–3:** one subinterface or one gateway wrong. **1:** subinterfaces exist but do not forward. **0:** no router-on-a-stick. |
| Verification and fault recovery | 3 | **3:** all pings pass after the fault; uses relevant show commands; correctly explains that VLAN 20 was removed from the trunk. **2:** fixes the fault but explanation or show evidence is incomplete. **1:** fixes with hints; weak explanation. **0:** does not restore connectivity. |
| **Total** | **20** | |

### Critical errors (record separately)

- No working trunk between the switches or to R1.
- All access ports assigned to the wrong VLAN.
- Duplicate IP address that breaks connectivity.
- Cannot restore connectivity after the injected fault.

Critical errors do not automatically zero the score; they are reported separately and count toward the pilot's transfer criterion ("no more than 25% commit a critical error").

### Rater sheet

| Participant ID | Rater | Topology /3 | VLANs /5 | Trunks /5 | Routing /4 | Verification /3 | Total /20 | Critical errors | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |  |

Raters must not see the participant's pre/post scores, survey, or the other rater's sheet. If two totals differ by more than 2 points, adjudicate with a third reviewer or a consensus meeting and keep both original sheets.

---

## Part G — Post-session survey (participant form)

Rate each statement from 1 (strongly disagree) to 5 (strongly agree).

1. I could find the section I needed without help.
2. The checks helped me notice something I had misunderstood.
3. The lab links helped me connect the reading to configuration.
4. The interface was visually clear and easy to scan.
5. I would use this again for CCNA study.
6. The amount of content felt manageable for the time I had.

Open questions:

1. What was the most useful part of the Academy?
2. Where did you get stuck, and what were you trying to do?
3. What is one thing you would change?
4. What is one thing you learned that you did not know before today?

Do not ask “did you like it?” as the only question. The open answers are the main qualitative data.

---

## Part H — Scoring checklist

- [ ] Anonymous ID on every page and workspace export.
- [ ] Pre-test scored from the key; 25% re-scored by a second person.
- [ ] Delayed test and config recall scored separately.
- [ ] Transfer workspace renamed to the anonymous ID; participant names removed from hostnames.
- [ ] Two independent rater sheets; no pre/post or survey leakage.
- [ ] Critical errors recorded separately.
- [ ] Survey and interview notes stored without names.
- [ ] All deviations from this protocol recorded.

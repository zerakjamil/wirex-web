# Physical workspace and logical clusters implementation

Scope: PT 9's **Physical** workspace (intercity → city → corporate office →
building → wiring closet → rack/table containers) and the **logical cluster**
grouping with its navigation strip — the PT 9 familiar-affordance item
selected after the Back stepping / event-filters increment. Target inventory:
Packet Tracer 9.0.1's physical and logical toolbars captured in
`work/pt901-uirecon/evidence/ui_strings.csv` (`Create New Rack`,
`Create New Building (Shift+B)`, `Create New Inventory Shelf`,
`Create New Cable Pegboard`, `Create New Cluster (Shift+U)`, `Cluster Name`,
the `Cluster Associations Dialog`, `%1 is not rack mountable.`, and the
breadcrumb `Intercity > Home City > Corporate Office > Main Wiring Closet`),
summarized in `PT_RECON.md`.

Status: physical containers, device placement, logical clusters, the shared
path strip and browser acceptance landed 2026-10-17.

## What was built

| Piece | Where | Notes |
| --- | --- | --- |
| Data model | `src/types/network.ts` | `PhysicalContainerKind = 'city' \| 'building' \| 'closet' \| 'rack' \| 'table'`, `PhysicalContainer {id, kind, name, parentId}`, flat `NetworkCluster {id, name, deviceIds}` and the bundled `PhysicalWorkspaceState {containers, assignment, clusters}` |
| Physical model | `src/simulator/physical.ts` | Pure helpers: the default seed (building "Corporate Office" → closet "Main Wiring Closet" → rack "Rack 1" = `DEFAULT_PHYSICAL_RACK_ID`), `allowedChildKinds` nesting rules (root → city/building; city → building; building → closet; closet → rack/table; rack/table → none), `canHoldDevices` (racks and tables only), `containerById`/`containersByParent`/`ancestorPath`/`containerLabelPath`, `nextContainerName` counters, add/rename/delete-tree helpers (`deleteContainerTree`, `containerSubtreeIds`), placement (`firstDeviceContainer`, `deviceContainer` with assignment → default rack → first rack/table → null fallback), `sanitizePhysical` and the cluster helpers (`addCluster`, `renameCluster`, `removeCluster`, `purgeDeviceFromClusters`) |
| Store state and actions | `src/store/networkStore.ts` | `physicalContainers`, `physicalAssignment`, `clusters` live next to `annotations` so they ride the existing snapshot/save/load plumbing; actions `addPhysicalContainer` (ids `phys-${kind}-${uuid}`), `renamePhysicalContainer` (trimmed, blank-ignored), `deletePhysicalContainer` (subtree + freed assignments), `moveDeviceToContainer` (racks/tables only), `createCluster` (unclustered members only), `renameClusterGroup`, `removeClusterGroup`; `deleteDevice` purges membership and assignment, empty clusters disband; `loadLab` gained an optional 4th `physical` parameter (sanitized, defaults to the seed); `resetTopology` resets all three |
| Workspace state | `src/store/workspaceStore.ts` | `Snapshot` now bundles `physical`, so undo/redo and `saveWorkspace` carry containers, assignments and clusters with no extra plumbing; new view state `physicalPath`, `activeClusterId`, `canvasSelectionIds`; actions `enterPhysicalContainer`, `setPhysicalPath`, `pathBack` (physical: pop one level; logical: exit the cluster), `enterCluster`/`exitCluster` (both clear the selection), `createPhysicalContainer` (checkpoint + auto-name + auto-enter for navigable kinds), `deleteActivePhysicalContainer`, `createClusterFromSelection` (≥2 unclustered selected devices, `Cluster N` pointer names), `renameActiveCluster`, `disbandActiveCluster`. Every container/cluster mutation checkpoints first, so Undo restores it |
| Workspace schema | `src/simulator/workspaceSchema.ts` | `parseWorkspace` returns optional `physical`; `validatePhysical` is strict — unique ids, known kinds, parent existence, nesting via `allowedChildKinds`, cycle detection, assignment targets an existing device **and** a rack/table, cluster members exist, are non-empty and unique, names ≤ 64 chars. Workspaces without a `physical` key stay loadable (defaults apply), matching the `.pkt` precedent |
| Persistence | `src/store/workspacePersistence.ts` | Workspace file open passes `validated.physical` to `loadLab`; the localStorage autosave, the SQLite save/restore and the share-link payload all carry `physical` and pass it back on restore; the autosave subscription watches the three new references. While a **training backup is active** the autosave writes the backup's devices, so the layout is deliberately omitted there to avoid dangling assignments; the layout is never written to `.pkt` files (same as annotations) |
| Physical scene | `src/components/canvas/PhysicalWorkspace.tsx` | Renders by current container: tile grids for city/building/closet children with subtree device counts, and a closet scene that shows every rack and table **side by side** so devices can be dragged between them. Rack/table panels have an inline rename input, a delete button, unit numbers and HTML5 drag-and-drop (`application/x-wirex-device`); a per-row **Move** popover (`pt-device-move-menu`, viewport-clamped) moves a device to any other rack/table via `containerLabelPath` labels — the cross-closet path. Empty states name the next action |
| Cluster zone | `src/components/canvas/ClusterNode.tsx`, `canvasNodes.ts` | Each cluster renders as a dashed boundary node (`pt-cluster-zone`, `pointerEvents:none` so it never blocks device interaction) with a clickable label chip (`nopan nodrag`, double-click or Enter enters the cluster). `createCanvasNodes` gained an optional trailing `clusters` parameter that derives the zone rectangle from member device positions and measured sizes; `sameNode` compares `data.cluster`/`data.width`/`data.height` |
| Canvas integration | `src/components/canvas/TopologyCanvas.tsx` | Physical view swaps the old hard-coded rack list for `<PhysicalWorkspace/>`; the logical canvas renders `clusterNode` zones outside the active cluster; entering a cluster filters nodes, links and annotations to its members and internal links; `Shift+U` creates a cluster from the selection, `Shift+B` creates a building; the canvas selection is now the `workspaceStore.canvasSelectionIds` array (single source of truth for the header button) |
| Path strip and header | `src/components/cisco/CiscoWorkspaceHeader.tsx` | A `pt-workspace-path` breadcrumb renders `[Root] › [Container] …` in physical view (segments click to jump) and `[Root] › [Cluster]` in logical view; **Back** pops one level and is disabled at the root; the header hosts create/rename/delete for the active container (child kinds driven by `allowedChildKinds`) and create/rename/disband for the active cluster. `CiscoIcon` gained `city`, `building` and `table` glyphs |
| Localization | `src/i18n/messages.ts` | 25 new strings as EN/AR/CKB triples (kind labels, empty states, move menu, path/actions). Container and cluster **names are user data** (English seed values, like device names) and are not translated; status messages stay plain English per the existing statusbar convention |

## Semantics

- Navigation is a path, not a tree widget: `[Root] › [Corporate Office] ›
  [Main Wiring Closet]` mirrors PT's breadcrumb. Only navigable kinds
  (city/building/closet) occupy the path; racks and tables are panels inside
  the closet scene, which is what makes dragging between them direct.
- Device placement is explicit-but-forgiving: `moveDeviceToContainer` records
  an assignment; `deviceContainer` falls back to the default rack, then the
  first rack/table, then nothing. Deleting a container frees the assignments
  inside its subtree instead of deleting devices, and deleting a device
  purges its assignment and cluster membership.
- Clusters are flat named device groups (PT 9 clusters are not nested): a
  boundary zone plus a label chip, creation from a canvas selection of at
  least two unclustered devices (`Shift+U` or the header button), rename and
  disband (both checkpoint; Undo restores). Double-clicking the label focuses
  the canvas on the members and announces the cluster in the path strip;
  Back returns to the full canvas. Members are exclusive — a device belongs
  to at most one cluster, and an emptied cluster disbands itself.
- Container edits are organization-only: they are saved with the workspace
  and undone normally, but they do not invalidate the simulation journal
  (which watches `devices`/`links`/`inFlightPackets`/`pingResults` only).
- Workspace artifacts: `.wf.json` files, the browser autosave and share
  links carry `physical`; `.pkt` files do not (matching annotations).

## Documented simplifications (no parity claim)

- Container set is the reduced five-kind model. PT's exotic containers
  (intercity, inventory shelf, cable pegboard, wall mount, patch panel) and
  the shelf connect rule ("`%1 is not rack mountable.`") are not built.
- No seeded city: the default lab starts at the corporate office building;
  cities are creatable but optional. Buildings sit at the root or inside a
  city; closets only inside buildings; racks/tables only inside closets.
- Devices are assignable to racks and tables only; there is no slot-level
  mounting model, unit occupancy, or shelf inventory.
- PT's **Cluster Associations dialog** (logical ↔ physical mapping,
  `Logical To Physical ->`, `<- Physical To Logical`, Move Devices, Create
  New Container, Copy Background Images, Copy Cluster Icons) is explicitly
  deferred — clusters and containers are independent grouping systems here.
- No cluster icons, per-cluster colors, background images, nested clusters,
  or container drag-to-reparent (devices move between racks/tables; the
  containers themselves are created inside the current path).
- Physical state is omitted from the autosave while a training backup is
  active (the saved devices are the pre-training backup's, so carrying the
  live layout would create dangling assignments); on restore the default
  seed applies and devices fall back to the default rack.
- No measured acceptance against real Packet Tracer physical output; the
  naming and layout follow the recon inventory only.

## Verification

- `src/store/physicalWorkspace.test.ts` (13 tests): kind nesting rules; the
  seeded Corporate Office → Main Wiring Closet → Rack 1 path and auto-name
  counters; placement fallback chain; subtree deletion; store creation,
  trimming renames, moves (racks/tables only), delete-frees-assignment;
  device deletion purging assignment and membership with empty-cluster
  disband; cluster member exclusivity, rename, disband; create-from-selection
  requiring two unclustered devices; Back popping one physical level and
  exiting a cluster; `loadLab` defaulting, restoring and sanitizing;
  undo/redo carrying container edits, assignments and renames.
- `src/simulator/workspaceSchema.test.ts` (+2 tests): physical round-trip
  through save/restore including memberships; rejection of wrong kind,
  invalid nesting, missing parent, duplicate ids, assignment to a non-holder
  or unknown device, unknown/empty/duplicate cluster members and overlong
  names; workspaces without `physical` stay loadable.
- `e2e/physical.spec.ts` (3 specs, production build): physical navigation
  root → building → closet with tile counts; create/rename a table; move a
  device through the Move menu and drag a second one across panels; Back
  stepping one level at a time to a disabled root; delete-then-Undo restoring
  the table with its devices; cluster create from a real node click + store
  selection, double-click focus (3 nodes → 2), header rename, Back, disband
  and Undo; a browser reload restoring a renamed rack from the autosave.
- Full gates on 2026-10-17: `npm test` passes 504/504; `npx tsc --noEmit`
  clean; lint zero errors / 28 pre-existing warnings; `npm run electron:prep`
  green; `npm audit --omit=dev` zero advisories; production-browser suite
  **43/43** including the realtime scale spec (p95 tick interval 88.3 ms, p95
  engine tick 7.5 ms, peak queue 2,132, drained with no warnings).

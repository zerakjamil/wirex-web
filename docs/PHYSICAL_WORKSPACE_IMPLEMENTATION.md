# Physical workspace and logical clusters implementation

Scope: PT 9's **Physical** workspace (intercity → city → corporate office →
building → wiring closet → rack/table/shelf/pegboard containers) and the
**logical cluster** grouping with its navigation strip and the **Cluster
Associations** mapping dialog. Target inventory: Packet Tracer 9.0.1's
physical and logical toolbars captured in `work/pt901-uirecon/evidence/ui_strings.csv`
(`Create New City (Shift+C)`, `Create New Building (Shift+B)`,
`Create New Closet (Shift+J)`, `Create New Generic Container (Shift+F)`,
`Create New Rack`, `Create New Table`, `Create New Inventory Shelf`,
`Create New Cable Pegboard`, `Create New Cluster (Shift+U)`, `Cluster Name`,
the `Cluster Associations Dialog` with `Logical To Physical ->`,
`<- Physical To Logical`, `Move Devices` and `Create New Container`,
`%1 is not rack mountable.`, and the breadcrumb
`Intercity > Home City > Corporate Office > Main Wiring Closet`), summarized
in `PT_RECON.md`.

Status: physical containers, device placement, logical clusters, the shared
path strip and browser acceptance landed 2026-10-17. The full container set
(intercity root label, city, building, closet, rack, table, inventory shelf,
cable pegboard, generic container), the shelf storage rule, the container
shortcuts and the Cluster Associations dialog landed 2026-10-18.

## What was built

| Piece | Where | Notes |
| --- | --- | --- |
| Data model | `src/types/network.ts` | `PhysicalContainerKind = 'city' \| 'building' \| 'closet' \| 'rack' \| 'table' \| 'shelf' \| 'pegboard' \| 'generic'`, `PhysicalContainer {id, kind, name, parentId}`, flat `NetworkCluster {id, name, deviceIds, physicalContainerId?}` and the bundled `PhysicalWorkspaceState {containers, assignment, clusters}` |
| Physical model | `src/simulator/physical.ts` | Pure helpers: the default seed (city "Home City" → building "Corporate Office" → closet "Main Wiring Closet" → rack "Rack 1" = `DEFAULT_PHYSICAL_RACK_ID`), `allowedChildKinds` nesting rules (root → city/building/generic; city → building/generic; building → closet/generic; closet → rack/table/shelf/pegboard; containers hold no children), `canHoldDevices` (rack/table/shelf/generic), `isStoredOnShelf`, `PHYSICAL_KIND_LABELS` (the PT term "Intercity" labels the root in the path strip; there is no intercity container), `containerById`/`containersByParent`/`ancestorPath`/`containerLabelPath`, `nextContainerName` counters, add/rename/delete-tree helpers, placement (`firstDeviceContainer`, `deviceContainer` with assignment → default rack → first rack/table → null fallback), `sanitizePhysical` (prunes stale assignments **and** stale cluster associations) and the cluster helpers |
| Store state and actions | `src/store/networkStore.ts` | `physicalContainers`, `physicalAssignment`, `clusters` ride the snapshot/save/load plumbing; actions `addPhysicalContainer`, `renamePhysicalContainer`, `deletePhysicalContainer` (subtree; devices stored on removed shelves are deleted and the count is returned; other assignments freed), `moveDeviceToContainer` (shelf guard: a powered or cabled device is refused with a plain-English status), `setClusterPhysicalContainer` (null clears; unknown ids ignored), `createCluster`/`renameClusterGroup`/`removeClusterGroup`; `toggleDevicePower` and `connectPorts` refuse devices stored on a shelf; `removeDeviceSlices` is shared by `deleteDevice` and shelf removal; `loadLab` takes the optional 4th `physical` parameter; `resetTopology` resets all three |
| Workspace state | `src/store/workspaceStore.ts` | `Snapshot` bundles `physical` so undo/redo and `saveWorkspace` carry containers, assignments, associations and clusters; view state `physicalPath`, `activeClusterId`, `canvasSelectionIds`; actions `enterPhysicalContainer`, `setPhysicalPath`, `pathBack`, `enterCluster`/`exitCluster`, `createPhysicalContainer` (checkpoint + auto-name + auto-enter for navigable kinds only: city/building/closet), `createPhysicalContainerFromShortcut` (PT's Shift+C/B/J/F rule: create in the current container when its kind accepts it, otherwise in the nearest accepting ancestor, otherwise at the Intercity root), `deleteActivePhysicalContainer` (mentions stored devices in the status), `createClusterFromSelection`, `renameActiveCluster`, `disbandActiveCluster`, `setStatus`, and the association flow `applyClusterAssociation` (optional Create New Container → generic child, optional Move Devices → first device-holding descendant; returns the error string or null) / `clearClusterAssociation` (requires the exact pair) |
| Workspace schema | `src/simulator/workspaceSchema.ts` | `validatePhysical` is strict on containers/assignments/members and lenient on the optional cluster association: a `physicalContainerId` that is not a known container id (or not a string) is dropped instead of rejecting the file, so workspaces saved before a container was deleted still open |
| Workspace dialog | `src/components/modals/ClusterAssociationsModal.tsx` | Self-gating modal on `ws.dialog === 'associations'`, opened from **Options → Cluster Associations...**. Two panes — Logical Clusters (member count and current association) and Physical Locations (indented tree incl. the Intercity root) — plus PT's helper options `Create New Container` and `Move Devices`, the `Logical to Physical →` / `← Physical to Logical` actions, inline error text (`Select a logical cluster and a physical container first.`, `A generic container cannot be created inside this container.`) and a helping sentence. Copy Background Images / Copy Cluster Icons are omitted on purpose (no container background/icon layer) |
| Physical scene | `src/components/canvas/PhysicalWorkspace.tsx` | Renders by current container: tile grids for navigable children (city/building/closet) with subtree device counts and associated-cluster chips, and a closet scene that shows every rack, shelf, table and pegboard **side by side** so devices can be dragged between them. Rack/table/shelf/generic panels have inline rename, delete and unit numbers; HTML5 drag-and-drop (`application/x-wirex-device`) is only enabled on device-holding containers; the Move popover lists the same holders and surfaces the shelf rule as a status message; pegboards show the `Cable pegboards store the wiring closet cables.` note; shelf panels warn once a device is stored |
| Cluster zone | `src/components/canvas/ClusterNode.tsx`, `canvasNodes.ts` | Each cluster renders as a dashed boundary node with a label chip; the chip title appends the association path (`Zone A → Home City > Corporate Office > Main Wiring Closet`) when one exists |
| Canvas integration | `src/components/canvas/TopologyCanvas.tsx` | Physical view swaps in `<PhysicalWorkspace/>`; the logical canvas renders cluster zones outside the active cluster; entering a cluster filters nodes, links and annotations to members; the selection is `workspaceStore.canvasSelectionIds`; physical shortcuts `Shift+C`/`Shift+B`/`Shift+J`/`Shift+F` create city/building/closet/generic through `createPhysicalContainerFromShortcut` (all no-op outside the Physical view), `Shift+U` creates a cluster |
| Path strip and header | `src/components/cisco/CiscoWorkspaceHeader.tsx`, `CiscoMenuBar.tsx` | `pt-workspace-path` renders `[Intercity] › [Home City] › …` in physical view (segments click to jump) and `[Root] › [Cluster]` in logical view; Back pops one level; the header hosts create/rename/delete for the active container (buttons driven by `allowedChildKinds`, titles append the PT shortcut); Options gains `Cluster Associations...` |
| Localization | `src/i18n/messages.ts` | EN/AR/CKB triples for every new label (kinds, dialog labels, shelf notes, hints). Container and cluster **names are user data** (English seed values, like device names); status messages stay plain English per the existing statusbar convention |

## Semantics

- Navigation is a path, not a tree widget: `[Intercity] › [Home City] ›
  [Corporate Office] › [Main Wiring Closet]` mirrors PT's breadcrumb.
  "Intercity" is PT's label for the physical **root**, not a creatable
  container, so it is the path strip's first segment. Only navigable kinds
  (city/building/closet) occupy the path; racks, shelves, tables, pegboards
  and generic containers are panels inside the level that contains them.
- Device placement is explicit-but-forgiving, except for shelves: shelf
  storage means *stored equipment*, so `moveDeviceToContainer` refuses a
  powered or cabled device (status: `power the device off and remove its
  cables before storing it on a shelf`), and a stored device cannot be
  powered on or cabled from the device view, the port dialogs or the store.
  This is the wireX analogue of PT's `%1 is not rack mountable.` rule.
  Deleting a shelf deletes the devices stored on it (with the count in the
  status, and Undo restores); deleting any other container frees assignments
  instead of deleting devices.
- Container shortcuts follow PT's move-to-parent rule: `Shift+C` city,
  `Shift+B` building, `Shift+J` closet, `Shift+F` generic container; the
  container lands in the current level when that kind accepts it, otherwise
  in the nearest accepting ancestor, otherwise at the Intercity root. Rack,
  table, shelf and pegboard have no PT shortcuts and none are invented.
- Clusters are flat named device groups (PT 9 clusters are not nested);
  Cluster Associations map a cluster to one physical container
  (`cluster.physicalContainerId`). `Logical to Physical →` associates with
  the selected container, or with a new generic child when **Create New
  Container** is checked; **Move Devices** also relocates the members into
  the first device-holding container below the target. `← Physical to
  Logical` removes the association for the selected pair. Deleting the
  container, or loading a file whose container no longer exists, drops the
  association instead of breaking the lab. Both actions checkpoint, so Undo
  restores them.
- Container edits and associations are organization-only: they are saved
  with the workspace and undone normally, but they do not invalidate the
  simulation journal (which watches `devices`/`links`/`inFlightPackets`/
  `pingResults` only).
- Workspace artifacts: `.wf.json` files, the browser autosave, SQLite and
  share links carry `physical` (containers, assignments, clusters and
  associations); `.pkt` files do not (matching annotations).

## Documented simplifications (no parity claim)

- Wall Mount stays a documented difference: in PT it is a device mounting
  property (rack vs wall), and the Patch Connections entry is a cable menu,
  not a container — wireX models neither (its racks have no unit occupancy
  model). Recorded from `ui_strings.csv`, not faked as containers.
- Devices are assignable to racks, tables, shelves and generic containers;
  there is still no slot-level mounting model, unit occupancy, or module
  inventory on shelves (shelf storage is all-or-nothing at device level).
- Copy Background Images and Copy Cluster Icons are not offered in the
  Cluster Associations dialog because wireX containers have no background
  image or icon layer at all — an intentional difference, disclosed in the
  dialog by omission and recorded here.
- PT's `%1 is not rack mountable.` string is paraphrased (authored English
  key, EN/AR/CKB triple); no PT string is copied verbatim.
- Physical state is omitted from the autosave while a training backup is
  active (the saved devices are the pre-training backup's, so carrying the
  live layout would create dangling assignments); on restore the default
  seed applies and devices fall back to the default rack.
- No measured acceptance against real Packet Tracer physical output; the
  naming, container set and shortcut keys follow the recon inventory only.

## Verification

- `src/store/physicalWorkspace.test.ts` (17 tests): kind nesting rules over
  all eight kinds; the seeded Home City → Corporate Office → Main Wiring
  Closet → Rack 1 path and auto-name counters; placement fallback chain;
  subtree deletion; store creation, trimming renames, moves,
  delete-frees-assignment; device deletion purging assignment and
  membership; cluster exclusivity, rename, disband; create-from-selection;
  Back stepping and cluster exit; `loadLab` defaulting/restoring/sanitizing;
  undo/redo; **new:** shelf storage refusing powered and cabled devices,
  blocking power-on and cabling while stored, and shelf deletion deleting
  its stored devices with an accurate count; cluster associations being set,
  ignored for unknown ids, and pruned when the container is deleted;
  the association flow creating a generic container, moving devices,
  clearing, restoring via Undo and refusing a non-accepting container;
  shortcuts landing at the nearest accepting ancestor and at the Intercity
  root, and being inert outside the Physical view.
- `src/simulator/workspaceSchema.test.ts` (+3 tests): physical round-trip
  through save/restore; rejection of wrong kind, invalid nesting, missing
  parent, duplicate ids, assignment to a non-holder or unknown device,
  unknown/empty/duplicate cluster members, overlong names; association
  parsing preserving valid targets and dropping stale or malformed ones;
  workspaces without `physical` stay loadable.
- `e2e/physical.spec.ts` (4 specs, production build): physical navigation
  `Intercity → Home City → Corporate Office → Main Wiring Closet` with tile
  counts and Back stepping to a disabled root; create/rename a table; move a
  device through the Move menu and drag a second one across panels;
  delete-then-Undo; cluster create/focus/rename/disband/Undo; autosave
  reload; **new:** creating an inventory shelf and a cable pegboard, the
  shelf refusing a powered cabled switch and accepting a powered-off
  unplugged PC with the storage note visible, the Options → Cluster
  Associations... dialog mapping a cluster onto the wiring closet (store
  assertion + cluster chip on the closet tile) and `Shift+C` creating a
  city at the Intercity root.
- Full gates on 2026-10-18: `npm test` passes **542/542**; `npx tsc --noEmit`
  clean; lint zero errors / 28 pre-existing warnings; `npm run electron:prep`
  green; full production-browser suite **48 of 49** — every functional flow
  passes, including the four physical specs; the single failure is the
  pre-existing machine-boundary `simulation-scale` case, whose functional
  assertions all pass (8/8 pings, queue peak 2,132, clean drain, no
  warnings) while its longest-task wall clock measured 501–519 ms against
  the unchanged 500 ms bound — A/B-verified in a same-host worktree where
  the previous commit `028090a` measured **520–528 ms** under identical
  load, and engine numbers are far inside budget in both builds (p95 engine
  tick 11.8–13.9 ms, longest engine tick ≤ 16.7 ms). The bound was not
  weakened.

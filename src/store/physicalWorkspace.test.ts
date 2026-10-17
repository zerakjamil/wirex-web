import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevice } from '../simulator/deviceFactory'
import {
  DEFAULT_PHYSICAL_RACK_ID,
  allowedChildKinds,
  ancestorPath,
  containerSubtreeIds,
  defaultPhysicalContainers,
  deleteContainerTree,
  deviceContainer,
  nextContainerName,
} from '../simulator/physical'
import { useNetworkStore } from './networkStore'
import { useWorkspaceStore } from './workspaceStore'

function labDevice(id: string) {
  const device = createDevice('pc', 10, 20)
  device.id = id
  return device
}

function resetLab(devices = [labDevice('pc-1')]) {
  useNetworkStore.setState({
    devices, links: [], annotations: [],
    physicalContainers: defaultPhysicalContainers(), physicalAssignment: {}, clusters: [],
    inFlightPackets: [], pingResults: [], selectedDeviceId: null, selectedLinkId: null,
  })
  useWorkspaceStore.setState({ activeClusterId: null, physicalPath: [], canvasSelectionIds: [], past: [], future: [] })
}

test('physical container kinds follow the reduced nesting rules', () => {
  assert.deepEqual(allowedChildKinds(null), ['city', 'building'])
  assert.deepEqual(allowedChildKinds('city'), ['building'])
  assert.deepEqual(allowedChildKinds('building'), ['closet'])
  assert.deepEqual(allowedChildKinds('closet'), ['rack', 'table'])
  assert.deepEqual(allowedChildKinds('rack'), [])
  assert.deepEqual(allowedChildKinds('table'), [])
})

test('the default physical tree seeds the corporate office and wiring closet path', () => {
  const containers = defaultPhysicalContainers()
  assert.deepEqual(ancestorPath(containers, DEFAULT_PHYSICAL_RACK_ID).map(container => container.name), ['Corporate Office', 'Main Wiring Closet', 'Rack 1'])
  assert.deepEqual(ancestorPath(containers, 'missing'), [])
  assert.equal(nextContainerName(containers, 'rack'), 'Rack 2')
  assert.equal(nextContainerName([], 'building'), 'Building 1')
})

test('device placement prefers the assignment, then the default rack, then the first rack or table', () => {
  const containers = defaultPhysicalContainers()
  const bench = { id: 'phys-table-1', kind: 'table' as const, name: 'Bench', parentId: 'phys-closet-main' }
  const withTable = [...containers, bench]
  assert.equal(deviceContainer(containers, {}, 'pc-1')?.id, DEFAULT_PHYSICAL_RACK_ID)
  assert.equal(deviceContainer(withTable, { 'pc-1': 'phys-table-1' }, 'pc-1')?.id, 'phys-table-1')
  assert.equal(deviceContainer(withTable, { 'pc-1': 'ghost' }, 'pc-1')?.id, DEFAULT_PHYSICAL_RACK_ID)
  const withoutDefaultRack = deleteContainerTree(withTable, DEFAULT_PHYSICAL_RACK_ID)
  assert.equal(deviceContainer(withoutDefaultRack, {}, 'pc-1')?.id, 'phys-table-1')
  assert.equal(deviceContainer(deleteContainerTree(withoutDefaultRack, 'phys-table-1'), {}, 'pc-1'), null)
})

test('deleting a container removes its whole subtree', () => {
  const containers = defaultPhysicalContainers()
  assert.deepEqual([...containerSubtreeIds(containers, 'phys-building-main')].sort(), ['phys-building-main', 'phys-closet-main', DEFAULT_PHYSICAL_RACK_ID].sort())
  assert.equal(deleteContainerTree(containers, 'phys-closet-main').length, 1)
})

test('store: created containers take a kind-based auto name under the requested parent', () => {
  resetLab()
  const tableId = useNetworkStore.getState().addPhysicalContainer('table', 'phys-closet-main')
  const table = useNetworkStore.getState().physicalContainers.find(container => container.id === tableId)
  assert.equal(table?.name, 'Table 1')
  assert.equal(table?.parentId, 'phys-closet-main')
})

test('store: renaming containers trims text and ignores blank names', () => {
  resetLab()
  useNetworkStore.getState().renamePhysicalContainer(DEFAULT_PHYSICAL_RACK_ID, '  Lab Rack  ')
  assert.equal(useNetworkStore.getState().physicalContainers.find(container => container.id === DEFAULT_PHYSICAL_RACK_ID)?.name, 'Lab Rack')
  useNetworkStore.getState().renamePhysicalContainer(DEFAULT_PHYSICAL_RACK_ID, '   ')
  assert.equal(useNetworkStore.getState().physicalContainers.find(container => container.id === DEFAULT_PHYSICAL_RACK_ID)?.name, 'Lab Rack')
})

test('store: moving devices only targets racks and tables and deleting containers frees assignments', () => {
  resetLab()
  const tableId = useNetworkStore.getState().addPhysicalContainer('table', 'phys-closet-main')
  useNetworkStore.getState().moveDeviceToContainer('pc-1', tableId)
  assert.equal(useNetworkStore.getState().physicalAssignment['pc-1'], tableId)
  useNetworkStore.getState().moveDeviceToContainer('pc-1', 'phys-building-main')
  assert.equal(useNetworkStore.getState().physicalAssignment['pc-1'], tableId)
  useNetworkStore.getState().moveDeviceToContainer('ghost', tableId)
  assert.equal(useNetworkStore.getState().physicalAssignment['ghost'], undefined)
  useNetworkStore.getState().deletePhysicalContainer(tableId)
  const state = useNetworkStore.getState()
  assert.equal(state.physicalAssignment['pc-1'], undefined)
  assert.equal(deviceContainer(state.physicalContainers, state.physicalAssignment, 'pc-1')?.id, DEFAULT_PHYSICAL_RACK_ID)
})

test('store: deleting a device purges its assignment and cluster membership; empty clusters disband', () => {
  resetLab([labDevice('pc-1'), labDevice('pc-2')])
  useNetworkStore.getState().createCluster('Cluster 1', ['pc-1', 'pc-2'])
  useNetworkStore.getState().moveDeviceToContainer('pc-1', DEFAULT_PHYSICAL_RACK_ID)
  useNetworkStore.getState().deleteDevice('pc-1')
  assert.equal(useNetworkStore.getState().physicalAssignment['pc-1'], undefined)
  assert.deepEqual(useNetworkStore.getState().clusters[0]?.deviceIds, ['pc-2'])
  useNetworkStore.getState().deleteDevice('pc-2')
  assert.equal(useNetworkStore.getState().clusters.length, 0)
})

test('store: clusters take unclustered members only, rename safely and disband on request', () => {
  resetLab([labDevice('pc-1'), labDevice('pc-2'), labDevice('pc-3')])
  const first = useNetworkStore.getState().createCluster('Lab A', ['pc-1', 'pc-2'])
  const second = useNetworkStore.getState().createCluster('', ['pc-2', 'pc-3'])
  const clusters = useNetworkStore.getState().clusters
  assert.deepEqual(clusters.find(cluster => cluster.id === first)?.deviceIds, ['pc-1', 'pc-2'])
  assert.deepEqual(clusters.find(cluster => cluster.id === second)?.deviceIds, ['pc-3'])
  assert.equal(clusters.find(cluster => cluster.id === second)?.name, 'Cluster 2')
  useNetworkStore.getState().renameClusterGroup(first, '  Renamed  ')
  assert.equal(useNetworkStore.getState().clusters.find(cluster => cluster.id === first)?.name, 'Renamed')
  useNetworkStore.getState().renameClusterGroup(first, '   ')
  assert.equal(useNetworkStore.getState().clusters.find(cluster => cluster.id === first)?.name, 'Renamed')
  useNetworkStore.getState().removeClusterGroup(second)
  assert.equal(useNetworkStore.getState().clusters.length, 1)
})

test('workspace: creating a cluster needs two unclustered selected devices and can be disbanded from inside', () => {
  resetLab([labDevice('pc-1'), labDevice('pc-2')])
  useWorkspaceStore.setState({ canvasSelectionIds: ['pc-1'] })
  useWorkspaceStore.getState().createClusterFromSelection()
  assert.equal(useNetworkStore.getState().clusters.length, 0)
  assert.match(useWorkspaceStore.getState().status, /Select at least two/)
  useWorkspaceStore.setState({ canvasSelectionIds: ['pc-1', 'pc-2'] })
  useWorkspaceStore.getState().createClusterFromSelection()
  const cluster = useNetworkStore.getState().clusters[0]
  assert.deepEqual(cluster?.deviceIds, ['pc-1', 'pc-2'])
  useWorkspaceStore.getState().enterCluster(cluster.id)
  assert.equal(useWorkspaceStore.getState().activeClusterId, cluster.id)
  useWorkspaceStore.getState().disbandActiveCluster()
  assert.equal(useNetworkStore.getState().clusters.length, 0)
  assert.equal(useWorkspaceStore.getState().activeClusterId, null)
  useWorkspaceStore.getState().undo()
  assert.equal(useNetworkStore.getState().clusters.length, 1, 'undo restores a disbanded cluster')
})

test('workspace: Back pops one physical container level and exits the active cluster in logical view', () => {
  resetLab()
  useWorkspaceStore.setState({ view: 'physical', physicalPath: ['phys-building-main', 'phys-closet-main'] })
  useWorkspaceStore.getState().pathBack()
  assert.deepEqual(useWorkspaceStore.getState().physicalPath, ['phys-building-main'])
  useWorkspaceStore.getState().pathBack()
  useWorkspaceStore.getState().pathBack()
  assert.deepEqual(useWorkspaceStore.getState().physicalPath, [])
  useWorkspaceStore.setState({ view: 'logical', activeClusterId: 'cluster-1' })
  useWorkspaceStore.getState().pathBack()
  assert.equal(useWorkspaceStore.getState().activeClusterId, null)
})

test('loading a lab without physical state resets the tree; provided state is restored and sanitized', () => {
  resetLab()
  const tableId = useNetworkStore.getState().addPhysicalContainer('table', 'phys-closet-main')
  useNetworkStore.getState().moveDeviceToContainer('pc-1', tableId)
  useNetworkStore.getState().createCluster('Cluster 1', ['pc-1'])
  useNetworkStore.getState().loadLab([labDevice('pc-9')], [])
  const reset = useNetworkStore.getState()
  assert.equal(reset.physicalContainers.length, 3)
  assert.deepEqual(reset.physicalAssignment, {})
  assert.deepEqual(reset.clusters, [])
  useNetworkStore.getState().loadLab([labDevice('pc-1'), labDevice('pc-2')], [], undefined, {
    containers: [{ id: 'phys-rack-1', kind: 'rack', name: 'Rack 1', parentId: null }],
    assignment: { 'pc-1': 'phys-rack-1', ghost: 'phys-rack-1' },
    clusters: [{ id: 'cluster-1', name: 'Cluster 1', deviceIds: ['pc-1', 'ghost'] }],
  })
  const restored = useNetworkStore.getState()
  assert.equal(restored.physicalAssignment['pc-1'], 'phys-rack-1')
  assert.equal(restored.physicalAssignment['ghost'], undefined)
  assert.deepEqual(restored.clusters[0]?.deviceIds, ['pc-1'])
})

test('undo and redo carry physical container edits', () => {
  resetLab()
  useWorkspaceStore.getState().checkpoint()
  const tableId = useNetworkStore.getState().addPhysicalContainer('table', 'phys-closet-main')
  useNetworkStore.getState().renamePhysicalContainer(tableId, 'Bench')
  useNetworkStore.getState().moveDeviceToContainer('pc-1', tableId)
  useWorkspaceStore.getState().undo()
  assert.equal(useNetworkStore.getState().physicalContainers.length, 3)
  assert.equal(useNetworkStore.getState().physicalAssignment['pc-1'], undefined)
  useWorkspaceStore.getState().redo()
  const redone = useNetworkStore.getState()
  assert.equal(redone.physicalContainers.find(container => container.id === tableId)?.name, 'Bench')
  assert.equal(redone.physicalAssignment['pc-1'], tableId)
})

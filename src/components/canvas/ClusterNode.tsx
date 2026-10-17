'use client'
import type { Node, NodeProps } from '@xyflow/react'
import type { NetworkCluster } from '@/types/network'
import { useWorkspaceStore } from '@/store/workspaceStore'

export type ClusterNodeType = Node<{ cluster: NetworkCluster; width: number; height: number }, 'clusterNode'>

export function ClusterNode({ data }: NodeProps<ClusterNodeType>) {
  const cluster = data.cluster
  const enter = () => useWorkspaceStore.getState().enterCluster(cluster.id)
  return <div className="pt-cluster-zone" style={{ width: data.width, height: data.height }} aria-label={`${cluster.name} (${cluster.deviceIds.length})`}>
    <button type="button" className="pt-cluster-label nopan nodrag" title={cluster.name}
      onDoubleClick={enter}
      onKeyDown={event => { if (event.key === 'Enter') enter() }}>
      {cluster.name} ({cluster.deviceIds.length})
    </button>
  </div>
}

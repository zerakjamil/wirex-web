'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useNetworkStore } from '@/store/networkStore'
import { useI18n } from '@/i18n/useI18n'
import { ancestorPath, containerLabelPath, PHYSICAL_KIND_LABELS } from '@/simulator/physical'

/**
 * Cluster Associations: map Logical workspace clusters to Physical workspace containers.
 * "Create New Container" drops a generic container into the selected container (when its
 * kind accepts one) and associates the cluster with it; "Move Devices" also relocates the
 * cluster members into the first device-holding container below the target.
 */
export function ClusterAssociationsModal() {
  const { t } = useI18n()
  const ws = useWorkspaceStore()
  const containers = useNetworkStore(state => state.physicalContainers)
  const clusters = useNetworkStore(state => state.clusters)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [clusterId, setClusterId] = useState('')
  const [containerId, setContainerId] = useState('')
  const [createContainer, setCreateContainer] = useState(false)
  const [moveDevices, setMoveDevices] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (ws.dialog === 'associations') {
      if (!dialogRef.current?.open) dialogRef.current?.showModal()
    } else if (dialogRef.current?.open) {
      dialogRef.current?.close()
    }
  }, [ws.dialog])

  const ordered = useMemo(() => [...containers]
    .map(container => ({ container, path: containerLabelPath(containers, container.id) || container.name, depth: ancestorPath(containers, container.id).length - 1 }))
    .sort((a, b) => a.path.localeCompare(b.path)), [containers])

  const associate = () => setError(ws.applyClusterAssociation(clusterId, containerId, { createContainer, moveDevices }) ?? '')
  const clear = () => setError(ws.clearClusterAssociation(clusterId, containerId) ?? '')

  return <dialog
    ref={dialogRef}
    className="pt-dialog pt-assoc-dialog"
    aria-label={t('Cluster Associations')}
    onCancel={() => ws.setDialog(null)}
    onClick={event => { if (event.target === event.currentTarget) ws.setDialog(null) }}>
    <header className="pt-dialog-title">
      <h2>{t('Cluster Associations')}</h2>
      <button type="button" aria-label={t('Close')} onClick={() => ws.setDialog(null)}>×</button>
    </header>
    <div className="pt-dialog-body">
      <p>{t('Map logical clusters to physical containers so both workspaces describe the same place.')}</p>
      {error && <p role="alert" className="pt-assoc-error">{error}</p>}
      <div className="pt-assoc-columns">
        <section className="pt-assoc-pane" aria-label={t('Logical Clusters')}>
          <h3>{t('Logical Clusters')}</h3>
          {clusters.length === 0 && <p className="pt-container-empty">{t('Create a cluster in the Logical workspace first.')}</p>}
          <ul>
            {clusters.map(cluster => <li key={cluster.id}>
              <button type="button" aria-pressed={clusterId === cluster.id} onClick={() => { setClusterId(cluster.id); setError('') }}>
                <span className="pt-assoc-name">{cluster.name} ({cluster.deviceIds.length})</span>
                <span className="pt-assoc-path">{cluster.physicalContainerId ? containerLabelPath(containers, cluster.physicalContainerId) : '—'}</span>
              </button>
            </li>)}
          </ul>
        </section>
        <div className="pt-assoc-actions">
          <fieldset>
            <legend>{t('Options')}</legend>
            <label><input type="checkbox" checked={createContainer} onChange={event => setCreateContainer(event.target.checked)} />{t('Create New Container')}</label>
            <label><input type="checkbox" checked={moveDevices} onChange={event => setMoveDevices(event.target.checked)} />{t('Move Devices')}</label>
          </fieldset>
          <button type="button" onClick={associate}>{t('Logical to Physical →')}</button>
          <button type="button" onClick={clear}>{t('← Physical to Logical')}</button>
        </div>
        <section className="pt-assoc-pane" aria-label={t('Physical Locations')}>
          <h3>{t('Physical Locations')}</h3>
          <ul>
            <li className="pt-assoc-root"><span>{t('Intercity')}</span></li>
            {ordered.map(({ container, path, depth }) => <li key={container.id}>
              <button type="button" aria-pressed={containerId === container.id} style={{ paddingInlineStart: 10 + depth * 14 }} title={path} onClick={() => { setContainerId(container.id); setError('') }}>
                <span className="pt-assoc-name">{container.name}</span>
                <span className="pt-assoc-kind">{t(PHYSICAL_KIND_LABELS[container.kind])}</span>
              </button>
            </li>)}
          </ul>
        </section>
      </div>
    </div>
    <footer className="pt-dialog-footer">
      <button type="button" onClick={() => ws.setDialog(null)}>{t('Close')}</button>
    </footer>
  </dialog>
}

'use client'
import { useWorkspaceStore, type WorkspaceTool } from '@/store/workspaceStore'
import { CiscoIcon, type IconName } from './CiscoIcon'
import {useI18n} from '@/i18n/useI18n'
export function CiscoRightPalette() {
  const {t:translate}=useI18n()
  const { tool, setTool } = useWorkspaceStore()
  const tools: {name: WorkspaceTool; icon: IconName; label: string}[] = [
    {name:'select',icon:'select',label:'Select'}, {name:'inspect',icon:'inspect',label:'Inspect'},
    {name:'delete',icon:'delete',label:'Delete'}, {name:'marquee',icon:'marquee',label:'Select area'},
    {name:'note',icon:'note',label:'Place Note'}, {name:'line',icon:'line',label:'Draw Line'},
    {name:'rect',icon:'rect',label:'Draw Rectangle'}, {name:'ellipse',icon:'ellipse',label:'Draw Ellipse'},
    {name:'freeform',icon:'freeform',label:'Draw Freeform'}, {name:'pdu',icon:'pdu',label:'Add Simple PDU'},
    {name:'complex-pdu',icon:'complex-pdu',label:'Add Complex PDU'},
  ]
  return <div className="pt-secondary-toolbar" role="toolbar" aria-label={translate('Common tools')}>{tools.map(t => <button key={t.name} className="pt-icon-button" title={translate(t.label)} aria-label={translate(t.label)} aria-pressed={tool === t.name} onClick={() => setTool(t.name)}><CiscoIcon name={t.icon}/></button>)}</div>
}

'use client'
import type { Node, NodeProps } from '@xyflow/react'
import type { NetworkAnnotation } from '@/types/network'
import { useWorkspaceStore } from '@/store/workspaceStore'

export type AnnotationNodeType = Node<{annotation:NetworkAnnotation},'annotationNode'>

export function AnnotationNode({data,selected}:NodeProps<AnnotationNodeType>) {
  const annotation=data.annotation
  const tool=useWorkspaceStore(state=>state.tool)
  const remove=()=>useWorkspaceStore.getState().requestDeletion({annotationIds:[annotation.id]})
  const edit=()=>useWorkspaceStore.getState().openNoteEditor({annotationId:annotation.id,x:annotation.x,y:annotation.y,text:annotation.text || ''})
  const click=(event:React.MouseEvent)=>{if(tool==='delete'){event.stopPropagation();remove()}}
  if(annotation.type==='note')return <div role="button" tabIndex={0} aria-label={`Note: ${annotation.text || ''}`} onClick={click} onDoubleClick={()=>{if(tool==='select')edit()}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(tool==='delete')remove();else edit()}}} className={`pt-canvas-note ${selected?'pt-annotation-selected':''}`} style={{background:annotation.color ? (annotation.color === '#ffffff' ? 'rgba(255, 255, 255, 0.82)' : annotation.color) : 'transparent',borderColor:annotation.borderColor || 'transparent',backdropFilter:'blur(2px)'}}>{annotation.title && <strong>{annotation.title}<br/></strong>}{annotation.text}</div>
  const width=annotation.width || 160,height=annotation.height || 100
  const points=(annotation.points || [{x:0,y:0},{x:width,y:height}]).map(p=>`${p.x},${p.y}`).join(' ')
  const shape=(hit:boolean)=>{
    const style={fill:hit?'none':annotation.color || 'transparent',fillOpacity:hit?undefined:(annotation.color && annotation.color !== 'transparent' ? 0.22 : undefined),stroke:hit?'transparent':annotation.borderColor || 'var(--cisco-cable, #404040)',strokeWidth:hit?14:selected?3:2,pointerEvents:hit?'stroke' as const:'none' as const}
    if(annotation.type==='rect')return <rect x={1} y={1} width={Math.max(1,width-2)} height={Math.max(1,height-2)} style={style}/>
    if(annotation.type==='ellipse')return <ellipse cx={width/2} cy={height/2} rx={Math.max(1,width/2-2)} ry={Math.max(1,height/2-2)} style={style}/>
    return <polyline points={points} style={{...style,fill:'none'}}/>
  }
  return <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="pt-canvas-drawing" aria-label={`${annotation.type} drawing`} onClick={click}>
    {shape(false)}{shape(true)}
    {(annotation.title || annotation.text) && <foreignObject x="8" y="8" width={Math.max(1,width-16)} height={Math.max(1,height-16)} style={{pointerEvents:'none'}}><div className="pt-zone-label">{annotation.title && <strong>{annotation.title}<br/></strong>}{annotation.text}</div></foreignObject>}
  </svg>
}

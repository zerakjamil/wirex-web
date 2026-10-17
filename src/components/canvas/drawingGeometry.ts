import type { NetworkAnnotation } from '@/types/network'

export function makeDrawing(type:'rect'|'ellipse'|'line'|'freeform',points:{x:number;y:number}[]):NetworkAnnotation|null {
  if(points.length<2 || points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y))
  const width=Math.max(...points.map(p=>p.x))-x,height=Math.max(...points.map(p=>p.y))-y
  if(width<2 && height<2)return null
  if((type==='rect'||type==='ellipse') && (width<2||height<2))return null
  return {id:`ann-${crypto.randomUUID()}`,type,x,y,width:Math.max(4,width),height:Math.max(4,height),points:points.map(p=>({x:p.x-x,y:p.y-y})),color:'transparent',borderColor:'#404040'}
}

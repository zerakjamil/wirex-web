type HardwarePosition = { x: number; y: number; width?: number }

export function getDeviceCableGeometry(source: HardwarePosition, target: HardwarePosition) {
  const a={x:source.x+(source.width ?? 80)/2,y:source.y+36}
  const b={x:target.x+(target.width ?? 80)/2,y:target.y+36}
  return {sourceX:a.x,sourceY:a.y,targetX:b.x,targetY:b.y}
}

import type {NetworkDevice} from '@/types/network'
export interface CommandEvent {id:string;deviceId:string;command:string;kind:'Configuration changed'|'CLI context changed'|'Read-only command'|'Command rejected'|'No configuration change';changes:Array<{field:string;before:string;after:string}>}
export function observeCommand(before:NetworkDevice,after:NetworkDevice,command:string,output:string):CommandEvent{
 const changes:CommandEvent['changes']=[]
 const compare=(field:string,a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))changes.push({field,before:a===undefined?'unset':JSON.stringify(a),after:b===undefined?'unset':JSON.stringify(b)})}
 for(const field of ['hostname','vlans','defaultGateway','stpPriorities','portfastDefault','dhcpPools','dhcpEnabled'] as const)compare(field,before.config[field],after.config[field])
 for(const p of after.ports){const old=before.ports.find(op=>op.id===p.id);for(const field of ['ipAddress','subnetMask','adminStatus','vlan','portMode','allowedVlans','nativeVlan','channelGroup','channelMode','portfast','stpCost'] as const)compare(`${p.shortName}.${field}`,old?.[field],p[field])}
 compare('routingTable',before.routingTable,after.routingTable)
 const context=before.currentCliMode!==after.currentCliMode||before.activeInterface!==after.activeInterface||before.activeVlan!==after.activeVlan
 const kind=changes.length?'Configuration changed':/^% (?:Invalid|Incomplete|Specify|This|DHCP|Speed|No active|.*unsupported)/i.test(output)?'Command rejected':context?'CLI context changed':/^(?:do\s+)?(?:show|sh|ping)\b/i.test(command)?'Read-only command':'No configuration change'
 if(context)compare('CLI context',`${before.currentCliMode} ${before.activeInterface||before.activeVlan||''}`,`${after.currentCliMode} ${after.activeInterface||after.activeVlan||''}`)
 return {id:crypto.randomUUID(),deviceId:before.id,command:/password|secret/i.test(command)?'[credential command]':command,kind,changes}
}

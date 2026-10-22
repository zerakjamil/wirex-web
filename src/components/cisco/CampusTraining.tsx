'use client'
import {useEffect,useRef,useState} from 'react'
import {useTrainingStore,evaluateLesson,hasValidTrainingReply} from '@/store/trainingStore'
import {useNetworkStore} from '@/store/networkStore'
import {useWorkspaceStore} from '@/store/workspaceStore'
import {useI18n} from '@/i18n/useI18n'
import {lessonIds,lessonReferences,lessonCommands,type LearningMode} from '@/simulator/trainingLabs'
import {diagnoseConnection} from '@/simulator/diagnostics'
import {getStpTopology} from '@/simulator/spanningTree'
import {CliTab} from '@/components/modals/DeviceModal'
import {DeviceNavigator} from './DeviceNavigator'
import {ccnaLessonSection} from '@/content/ccnaCourse'
import {useAcademyStore} from '@/store/academyStore'
import {AcademyIcon} from '@/components/academy/AcademyIcons'
import {TrainingGuide} from './TrainingGuide'
import {guideCommandsForDevice,trainingGuides} from '@/simulator/trainingGuides'

const modes:Record<LearningMode,string>={guided:'Guided',recall:'Recall',troubleshoot:'Troubleshoot',free:'Free practice',exam:'Exam'}

export function TrainingCatalog(){
 const open=useTrainingStore(s=>s.catalogOpen),progress=useTrainingStore(s=>s.progress),dialog=useRef<HTMLDialogElement>(null),[mode,setMode]=useState<LearningMode>('guided'),{t,dir}=useI18n()
 useEffect(()=>{if(open&&!dialog.current?.open)dialog.current?.showModal();else if(!open&&dialog.current?.open)dialog.current.close()},[open])
 return <dialog ref={dialog} className="pt-training-catalog" dir={dir} onCancel={()=>useTrainingStore.setState({catalogOpen:false})}>
  <header><h2>{t('Campus Training')}</h2><button aria-label={t('Close')} onClick={()=>useTrainingStore.setState({catalogOpen:false})}>×</button></header>
  <p>{t('Training does not replace your imported network.')}</p>
  <label>{t('Learning mode')}<select value={mode} onChange={e=>setMode(e.target.value as LearningMode)}>{Object.entries(modes).map(([id,key])=><option key={id} value={id}>{t(key)}</option>)}</select></label>
  <ol>{lessonIds.map(id=><li key={id}><h3>{t(`lesson.${id}`)} {progress[id]?.completed?'✓':''}</h3><p>{t(`lesson.${id}.goal`)}</p>{id!=='exam'&&<details className="pt-catalog-guide"><summary>{t('Lesson context')}</summary><p dir="ltr">{trainingGuides[id].summary}</p><ul dir="ltr">{trainingGuides[id].topology.map(line=><li key={line}>{line}</li>)}</ul></details>}<small dir="ltr">{lessonReferences[id]}</small>{ccnaLessonSection[id]&&<button className="pt-training-concept-link" title={t('Open the matching Academy section')} onClick={()=>{useTrainingStore.setState({catalogOpen:false});useAcademyStore.getState().openSection(ccnaLessonSection[id]!)}}><AcademyIcon name="book" size={12}/>{t('Read concept')}</button>}<button onClick={()=>useTrainingStore.getState().start(id,mode)}>{t('Start lesson')}</button></li>)}</ol>
  <small>{t('Saved in this browser')}</small>
 </dialog>
}

export function ConnectionDiagnostics({onClose}:{onClose?:()=>void}){
 const devices=useNetworkStore(s=>s.devices),links=useNetworkStore(s=>s.links),{t,dir}=useI18n()
 const hosts=devices.filter(d=>['pc','laptop','server','router'].includes(d.type))
 const [source,setSource]=useState(''),[target,setTarget]=useState('')
 const a=devices.some(d=>d.id===source)?source:hosts[0]?.id||'',b=devices.some(d=>d.id===target)?target:hosts.find(d=>d.id!==a)?.id||''
 const issues=diagnoseConnection(devices,links,a,b)
 return <section className="pt-diagnostics" dir={dir} aria-label={t('Diagnose connection')}>
  <header><h3>{t('Diagnose connection')}</h3>{onClose&&<button aria-label={t('Close')} onClick={onClose}>×</button>}</header>
  <div className="pt-diagnostic-selectors">{([[t('Source'),a,setSource],[t('Destination'),b,setTarget]] as const).map(([label,value,change])=><label key={label}>{label}<select dir="ltr" value={value} onChange={e=>change(e.target.value)}><option value="" disabled>...</option>{hosts.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>)}</div>
  {a&&b&&a!==b?<><p className={issues.length?'pt-fault-count':'pt-audit-clear'} role="status">{issues.length?`${t('Configuration audit')}: ${issues.length}`:t('No configuration fault detected. Verify delivery with a traffic test.')}</p>
  <ol className="pt-fault-list">{issues.map(issue=>{const d=devices.find(d=>d.id===issue.deviceId)!,p=d.ports.find(p=>p.id===issue.portId);return <li key={`${issue.code}-${issue.deviceId}-${issue.portId}`}>
   <strong dir="ltr">{d.name}{p?` · ${p.shortName}`:''}</strong><p>{t(`diag.${issue.code}`)}</p>
   <dl><dt>{t('Actual')}</dt><dd dir="ltr">{issue.actual}</dd>{issue.expected&&<><dt>{t('Expected')}</dt><dd dir="ltr">{issue.expected}</dd></>}</dl>
   <button onClick={()=>{useTrainingStore.setState({deviceId:d.id});useNetworkStore.getState().setActiveModal({type:'device',deviceId:d.id})}}>{t('Open this device')}</button>
   {issue.commands.length>0&&<details><summary>{t('Suggested fix')}</summary><pre dir="ltr">{issue.commands.join('\n')}</pre></details>}
  </li>})}</ol></>:<p>{t('Choose a device')}</p>}
 </section>
}

export function TrainingPanel(){
 const training=useTrainingStore(),devices=useNetworkStore(s=>s.devices),links=useNetworkStore(s=>s.links),results=useNetworkStore(s=>s.pingResults),{t,dir}=useI18n()
 const resetDialog=useRef<HTMLDialogElement>(null),test=results.find(r=>r.id===training.testId)
 const [tab,setTab]=useState<'lesson'|'devices'>('lesson')
 const tasks=evaluateLesson(training.lesson,devices,links).map(c=>(c.id==='traffic'||c.id==='exam-traffic')?{...c,complete:hasValidTrainingReply()}:c)
 const hint=training.lesson==='exam'?'hint.exam':training.lesson==='vlans'||training.lesson==='campus'?'hint.vlan':training.lesson==='stp'?'hint.stp':training.lesson==='channel'?'hint.channel':'hint.packet'
 const hintCommands=guideCommandsForDevice(training.lesson,training.deviceId)||lessonCommands[training.lesson]
 return <aside className="pt-training-panel" dir={dir} aria-label={t('Training')}>
  <header><strong>{t('Training')}</strong><button onClick={training.openCatalog}>{t('Lesson')}</button></header>
  <div className="pt-training-tabs" role="tablist"><button role="tab" aria-selected={tab==='lesson'} onClick={()=>setTab('lesson')}>{t('Lesson tab')}</button><button role="tab" aria-selected={tab==='devices'} onClick={()=>setTab('devices')}>{t('Devices tab')}</button></div>
  {tab==='devices'?<DeviceNavigator/>:<div className="pt-training-scroll"><h2>{t(`lesson.${training.lesson}`)}</h2><small>{t(modes[training.mode])}</small><p>{t(`lesson.${training.lesson}.goal`)}</p>
  {ccnaLessonSection[training.lesson]&&<button className="pt-training-concept-link" title={t('Open the matching Academy section')} onClick={()=>useAcademyStore.getState().openSection(ccnaLessonSection[training.lesson]!)}><AcademyIcon name="book" size={12}/>{t('Read concept')}</button>}
  <TrainingGuide lesson={training.lesson} mode={training.mode}/>
  {training.lesson==='campus'&&<p>{t('Switch management does not enable inter-VLAN routing.')}</p>}
  <ol className="pt-task-list">{tasks.map(task=><li key={task.id}><span aria-label={t(task.complete?'Completed':'Not yet complete')}>{task.complete?'✓':'○'}</span>{t(`task.${task.id}`)}</li>)}</ol>
  {training.lesson==='exam'&&<div className="pt-exam-score" role="status" data-testid="training-practical-score"><strong>{t('Practical score')}: {tasks.filter(task=>task.complete).length} / {tasks.length}</strong><small>{t('Theory is scored in the Academy.')}</small></div>}
  <div className="pt-training-actions"><button onClick={training.testTraffic} disabled={test?.status==='pending'}>{t('Test traffic')}</button><button onClick={training.check}>{t('Check my work')}</button></div>
  <p role="status">{t('Last test')}: {t(test?.status==='successful'?'Successful':test?.status==='pending'?'Pending':test?.status==='failed'?'Failed':'Not tested')}</p>
  {test?.status==='successful'&&!hasValidTrainingReply()&&<p role="status">{t('Configuration changed. Run another traffic test.')}</p>}
  {training.checked&&<p className={tasks.every(c=>c.complete)?'pt-audit-clear':'pt-fault-count'} role="status">{t(tasks.every(c=>c.complete)?'Completed':'Not yet complete')}</p>}
  {training.mode!=='free'&&training.mode!=='exam'&&<><button onClick={training.revealHint} disabled={training.hintLevel>=3}>{t(training.hintLevel>=2?'Reveal command':'Hint')}</button>{(training.mode==='guided'||training.hintLevel>=1)&&<p>{t(hint)}</p>}{training.hintLevel>=2&&<p>{t('hint.context')}</p>}{training.hintLevel>=3&&<pre data-testid="training-hint-commands" dir="ltr">{hintCommands}</pre>}</>}
  <ConnectionDiagnostics/>
  <p><small>{t('Course reference')}: <bdi>{lessonReferences[training.lesson]}</bdi></small></p>
  <button onClick={()=>resetDialog.current?.showModal()}>{t('Reset exercise')}</button><button onClick={training.exit}>{t('Return to my network')}</button>
  {training.lesson==='exam'&&<button onClick={()=>{training.exit();useAcademyStore.getState().openAcademy();useAcademyStore.getState().setView('practice')}} data-testid="training-exam-return">{t('Return to exam briefing')}</button>}
  <p><small>{t('Saved in this browser')}</small></p></div>}
  <dialog ref={resetDialog} className="pt-training-confirm"><h3>{t('Reset this exercise?')}</h3><p>{t('Only this training exercise will be reset.')}</p><button onClick={()=>resetDialog.current?.close()}>{t('Cancel')}</button><button onClick={()=>{training.reset();resetDialog.current?.close()}}>{t('Reset exercise')}</button></dialog>
 </aside>
}

export function TrainingDock(){
 const training=useTrainingStore(),devices=useNetworkStore(s=>s.devices),events=useNetworkStore(s=>s.commandEvents),links=useNetworkStore(s=>s.links),{t,dir}=useI18n()
 const device=devices.find(d=>d.id===training.deviceId)||devices[0],event=events.filter(e=>e.deviceId===device?.id).at(-1)
 const tree=training.lesson==='stp'?getStpTopology(devices,links,10):null
 return <aside className="pt-training-dock" dir={dir}>
  <label>{t('Choose a device')}<select dir="ltr" value={device?.id} onChange={e=>useTrainingStore.setState({deviceId:e.target.value})}>{devices.map(d=><option key={d.id} value={d.id}>{d.name} · {d.model}</option>)}</select></label>
  <div className="pt-training-terminal" dir="ltr">{device&&<CliTab deviceId={device.id}/>}</div>
  <div className="pt-command-feedback" aria-live="polite"><h3>{t('Command feedback')}</h3>{event?<><strong>{t(event.kind)}</strong><code dir="ltr">{event.command}</code>{event.changes.map(change=><div key={change.field}><bdi>{change.field}</bdi><dl><dt>{t('Before')}</dt><dd dir="ltr">{change.before}</dd><dt>{t('After')}</dt><dd dir="ltr">{change.after}</dd></dl></div>)}</>:<p>{t('No command yet')}</p>}</div>
  {device&&<button onClick={()=>useWorkspaceStore.setState({inspectedDeviceId:device.id})}>{t('Inspect tables')}</button>}
  {tree&&<div className="pt-stp-observation"><h3>{t('Root bridge')} · VLAN 10</h3><bdi>{devices.find(d=>d.id===tree.roots.get(device?.id))?.name}</bdi><table dir="ltr"><thead><tr><th>{t('Interface')}</th><th>Role</th><th>State</th></tr></thead><tbody>{device?.ports.flatMap(p=>{const s=tree.ports.get(`${device.id}|${p.id}`);return s?[<tr key={p.id}><td>{p.shortName}</td><td>{s.role}</td><td>{s.state}</td></tr>]:[]})}</tbody></table><small>{t('Steady-state STP; BPDU timers are not simulated.')}</small></div>}
  {training.lesson==='tcpip'&&<div className="pt-encapsulation"><h3>{t('Conceptual encapsulation view')}</h3><div>{t('Ethernet frame')}<div>{t('IP packet')}<div>TCP<div>{t('Application data')}</div></div></div></div><small>{t('TCP transport is illustrated here; the traffic test uses ICMP.')}</small></div>}
 </aside>
}

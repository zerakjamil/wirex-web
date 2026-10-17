import test from 'node:test'
import assert from 'node:assert/strict'
import { browserStudyRequest } from './browserStudyVault'
function storage(){const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)}}}
test('student browser vaults keep checkpoints private and persist across a new instance',()=>{
  const first=storage(),second=storage()
  const created=browserStudyRequest(first,'create-checkpoint',{labId:'one',title:'Before VLAN',snapshot:{devices:[],links:[]}})
  assert.equal(created.ok,true)
  assert.equal((browserStudyRequest(second,'list-checkpoints').checkpoints as unknown[]).length,0)
  const rows=browserStudyRequest(first,'list-checkpoints').checkpoints as {id:string;isStarred:boolean}[]
  assert.equal(rows.length,1)
  browserStudyRequest(first,'toggle-star',{id:rows[0].id})
  assert.equal((browserStudyRequest(first,'list-checkpoints').checkpoints as typeof rows)[0].isStarred,true)
  browserStudyRequest(first,'delete-checkpoint',{id:rows[0].id})
  assert.equal((browserStudyRequest(first,'list-checkpoints').checkpoints as unknown[]).length,0)
})
test('offline revision cards are available without server access',()=>{
  const cards=browserStudyRequest(storage(),'list-cram-cards').cards as unknown[]
  assert.ok(cards.length>=6)
})
test('failed browser writes do not report a saved checkpoint or destroy existing data',()=>{
  const s=storage();browserStudyRequest(s,'create-checkpoint',{labId:'one',title:'Original',snapshot:{}})
  const broken={...s,setItem:()=>{throw new Error('QuotaExceededError')}}
  assert.equal(browserStudyRequest(broken,'create-checkpoint',{labId:'one',title:'New',snapshot:{}}).ok,false)
  assert.equal((browserStudyRequest(s,'list-checkpoints').checkpoints as unknown[]).length,1)
})

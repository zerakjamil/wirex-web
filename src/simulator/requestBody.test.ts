import test from 'node:test'
import assert from 'node:assert/strict'
import { readBoundedJson } from './requestBody'
test('JSON API bodies reject oversized declared and streamed payloads',async()=>{
  await assert.rejects(readBoundedJson(new Request('http://localhost',{method:'POST',headers:{'content-length':'100'},body:'{}'}),10),/too large/i)
  await assert.rejects(readBoundedJson(new Request('http://localhost',{method:'POST',body:'{"text":"abcdefghij"}'}),10),/too large/i)
})
test('JSON API bodies accept bounded objects and reject non-object payloads',async()=>{
  assert.deepEqual(await readBoundedJson(new Request('http://localhost',{method:'POST',body:'{"devices":[]}'}),100),{devices:[]})
  await assert.rejects(readBoundedJson(new Request('http://localhost',{method:'POST',body:'null'}),100),/object/i)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { localApiError } from './localApiAccess'

test('machine APIs are disabled unless the operator explicitly enables them',()=>{
  assert.ok(localApiError(new Request('http://localhost:3001/api/sqlite'),false))
})
test('enabled machine APIs accept only loopback requests from their own origin',()=>{
  assert.equal(localApiError(new Request('http://localhost:3001/api/sqlite'),true),null)
  assert.ok(localApiError(new Request('https://college.example/api/sqlite'),true))
  assert.ok(localApiError(new Request('http://localhost:3001/api/sqlite',{headers:{origin:'https://attacker.example'}}),true))
  assert.ok(localApiError(new Request('http://localhost:3001/api/sqlite',{headers:{'sec-fetch-site':'cross-site'}}),true))
})
test('machine APIs reject Fetch Metadata that is not same-origin',()=>{
  for(const site of ['same-site','cross-site','none','unknown','']) {
    assert.ok(localApiError(new Request('http://localhost:3001/api/sqlite',{headers:{'sec-fetch-site':site}}),true),site)
  }
  assert.ok(localApiError(new Request('http://localhost:3001/api/sqlite',{headers:{origin:'http://localhost:3001','sec-fetch-site':'same-site'}}),true))
  assert.equal(localApiError(new Request('http://localhost:3001/api/sqlite',{headers:{'sec-fetch-site':'same-origin'}}),true),null)
})
test('machine mutations require a matching origin even when loopback access is enabled',()=>{
  assert.ok(localApiError(new Request('http://127.0.0.1:3001/api/sqlite',{method:'POST'}),true))
  assert.equal(localApiError(new Request('http://127.0.0.1:3001/api/sqlite',{method:'POST',headers:{origin:'http://127.0.0.1:3001'}}),true),null)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { messages,translate } from './messages'
test('every authored message has English, Arabic and Central Kurdish text',()=>{
  for(const [key,translations] of Object.entries(messages)){
    assert.equal(translations.length,3,key)
    for(const value of translations)assert.ok(value.trim(),key)
    assert.match(translations[1],/[\u0600-\u06ff]/,key)
    assert.match(translations[2],/[\u0600-\u06ff]/,key)
  }
  assert.equal(translate('ar','Save'),'حفظ')
  assert.equal(translate('ckb','Save'),'پاشەکەوتکردن')
  assert.equal(translate('ckb','interface fa0/1'),'interface fa0/1')
})

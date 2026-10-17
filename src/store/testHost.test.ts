import assert from 'node:assert/strict'
import test from 'node:test'
import { isLoopbackAutomationHost } from './testHost'

test('allows browser automation hooks only on loopback hostnames', () => {
  assert.equal(isLoopbackAutomationHost('localhost'), true)
  assert.equal(isLoopbackAutomationHost('127.0.0.1'), true)
  assert.equal(isLoopbackAutomationHost('[::1]'), true)
})

test('does not allow automation hooks on public or wildcard hosts', () => {
  assert.equal(isLoopbackAutomationHost('wirex.example.edu'), false)
  assert.equal(isLoopbackAutomationHost('localhost.example.edu'), false)
  assert.equal(isLoopbackAutomationHost('0.0.0.0'), false)
  assert.equal(isLoopbackAutomationHost('::'), false)
})

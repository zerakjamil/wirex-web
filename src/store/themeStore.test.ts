import {test} from 'node:test'
import assert from 'node:assert/strict'
import {initializeTheme,useThemeStore} from './themeStore'

test('theme choice updates the document and survives initialization',()=>{
  const attributes=new Map<string,string>(),storage=new Map<string,string>()
  Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:{setAttribute:(key:string,value:string)=>attributes.set(key,value)}}})
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)}})
  useThemeStore.getState().setTheme('dark')
  assert.equal(attributes.get('data-theme'),'dark')
  useThemeStore.setState({theme:'light'})
  initializeTheme()
  assert.equal(useThemeStore.getState().theme,'dark')
  useThemeStore.getState().setTheme('light')
  initializeTheme()
  assert.equal(attributes.get('data-theme'),'light')
})

test('invalid saved theme and unavailable storage fall back to light without throwing',()=>{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>'<invalid>',setItem:()=>{throw new Error('quota')}}})
  initializeTheme()
  assert.equal(useThemeStore.getState().theme,'light')
  assert.doesNotThrow(()=>useThemeStore.getState().setTheme('dark'))
  assert.equal(useThemeStore.getState().theme,'dark')
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>{throw new Error('blocked')},setItem:()=>{throw new Error('blocked')}}})
  assert.doesNotThrow(initializeTheme)
  assert.equal(useThemeStore.getState().theme,'light')
})

'use client'
import { create } from 'zustand'
import { translate,type Locale } from './messages'
export const useLocaleStore=create<{locale:Locale;setLocale:(locale:Locale)=>void}>(set=>({locale:'en',setLocale:locale=>{
  set({locale})
  document.documentElement.lang=locale
  document.documentElement.dir=locale==='en'?'ltr':'rtl'
  try{localStorage.setItem('wireforge-language',locale)}catch{}
}}))
export function initializeLocale(){
  let locale:Locale='en'
  try{const stored=localStorage.getItem('wireforge-language')||localStorage.getItem('wireforge_language');if(stored==='ar'||stored==='ckb')locale=stored}catch{}
  useLocaleStore.getState().setLocale(locale)
}
export function useI18n(){
  const locale=useLocaleStore(state=>state.locale)
  return {locale,dir:locale==='en'?'ltr' as const:'rtl' as const,t:(key:string)=>translate(locale,key)}
}

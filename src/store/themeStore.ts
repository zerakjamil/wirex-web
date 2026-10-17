'use client'
import {create} from 'zustand'

export type Theme='light'|'dark'
export const useThemeStore=create<{theme:Theme;setTheme:(theme:Theme)=>void}>(set=>({
  theme:'light',
  setTheme:theme=>{
    set({theme})
    if(typeof document!=='undefined')document.documentElement.setAttribute('data-theme',theme)
    try{localStorage.setItem('wireforge-theme',theme)}catch{}
  },
}))

export function initializeTheme(){
  let theme:Theme='light'
  try{if(localStorage.getItem('wireforge-theme')==='dark')theme='dark'}catch{}
  useThemeStore.getState().setTheme(theme)
}

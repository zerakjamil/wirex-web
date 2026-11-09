'use client'
import { CiscoIcon } from './CiscoIcon'
import { useWorkspaceStore } from '@/store/workspaceStore'
import {useI18n,useLocaleStore} from '@/i18n/useI18n'
import {useTrainingStore} from '@/store/trainingStore'
import type {Locale} from '@/i18n/messages'
import {useThemeStore} from '@/store/themeStore'
import {useAcademyStore} from '@/store/academyStore'
import {useMidtermQuestStore} from '@/store/midtermQuestStore'
import {AcademyIcon} from '@/components/academy/AcademyIcons'
import {BrandCredit} from '@/components/brand/BrandCredit'
export function CiscoTitleBar({onDiagnose}:{onDiagnose?:()=>void}) {
  const fileName=useWorkspaceStore(state=>state.fileName)
  const {t,locale}=useI18n()
  const theme=useThemeStore(state=>state.theme)
  return <div className="pt-titlebar"><CiscoIcon name="network" size={15}/><span dir="ltr">wireX{fileName?` | ${fileName}`:''}</span><div className="pt-titlebar-credit"><BrandCredit/></div><div className="pt-titlebar-actions"><button className="pt-titlebar-midterm" onClick={() => { useMidtermQuestStore.getState().startQuest('predicted-2026') }} title={t('Predict tomorrows Midterm Exam & Play Past Papers')}><AcademyIcon name="spark" size={12}/>{t('Midterm 2026 Arena')}</button><button className="pt-titlebar-academy" data-testid="academy-open" onClick={()=>useAcademyStore.getState().openAcademy()} title={t('CCNA course and checks')}><AcademyIcon name="book" size={12}/>{t('Academy')}</button><button onClick={()=>useWorkspaceStore.getState().setDialog('revision')} title={t('CCNA Study Notes, Cram Cards & Rollback Snapshots')}>{t('Revision & Rollbacks')}</button><button onClick={()=>useTrainingStore.getState().openCatalog()}>{t('Training')}</button>{onDiagnose&&<button onClick={onDiagnose}>{t('Diagnose connection')}</button>}<button aria-pressed={theme==='dark'} onClick={()=>useThemeStore.getState().setTheme(theme==='dark'?'light':'dark')}>{t('Dark mode')}</button><select aria-label={t('Language')} value={locale} onChange={e=>useLocaleStore.getState().setLocale(e.target.value as Locale)}><option value="en">English</option><option value="ar">العربية</option><option value="ckb">کوردیی ناوەندی</option></select></div></div>
}

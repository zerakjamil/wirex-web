'use client'

import { useEffect, useRef } from 'react'
import { useNetworkStore } from '@/store/networkStore'
import { newWorkspace } from '@/store/workspaceStore'
import { useI18n } from '@/i18n/useI18n'

type WelcomeModalProps = {
  onDismiss: () => void
}

export function WelcomeModal({ onDismiss }: WelcomeModalProps) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const setActiveModal = useNetworkStore(state => state.setActiveModal)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const startNewWorkspace = () => {
    newWorkspace()
    onDismiss()
  }

  const openProjectFile = () => {
    document.getElementById('pt-open-file')?.click()
  }

  const openPracticeLabs = () => {
    setActiveModal({ type: 'labs' })
  }

  return (
    <dialog
      ref={dialogRef}
      className="pt-welcome"
      aria-labelledby="welcome-title"
      aria-describedby="welcome-description"
      data-testid="welcome-dialog"
      onCancel={event => event.preventDefault()}
    >
      <div className="overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06),0_32px_80px_-24px_rgba(15,23,42,0.35)]">
        <header className="flex items-start gap-4 border-b border-slate-200 p-6 pb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-100">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="6" height="4" rx="1" />
              <rect x="15" y="4" width="6" height="4" rx="1" />
              <rect x="9" y="16" width="6" height="4" rx="1" />
              <path d="M6 8v4h12V8M12 12v4" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 id="welcome-title" className="text-lg font-semibold tracking-tight text-slate-900">
              {t('Welcome to wireX')}
            </h2>
            <p id="welcome-description" className="mt-1 text-sm leading-6 text-slate-500">
              {t('Create a new topology or open an existing project.')}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2">
          <section className="p-6 md:border-r md:border-slate-200" aria-labelledby="welcome-new-title">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 id="welcome-new-title" className="text-sm font-semibold text-slate-900">{t('New workspace')}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t('Start with a blank canvas and add devices from the device box.')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={startNewWorkspace}
              className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-sky-700 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 cursor-pointer"
            >
              {t('New')}
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </section>

          <section className="border-t border-slate-200 p-6 md:border-t-0" aria-labelledby="welcome-open-title">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 id="welcome-open-title" className="text-sm font-semibold text-slate-900">{t('Open existing project')}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {t('Open a saved network file or browse a pre-configured practice lab.')}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={openProjectFile}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 cursor-pointer"
              >
                {t('Open project file...')}
              </button>
              <button
                type="button"
                onClick={openPracticeLabs}
                className="inline-flex h-9 items-center gap-1 rounded-md px-1 text-xs font-semibold text-sky-700 transition-colors hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 cursor-pointer"
              >
                {t('Practice Labs')}
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </section>
        </div>

        <footer className="flex items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-6 py-3">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12 4 4L19 6" />
          </svg>
          <p className="text-[11px] leading-4 text-slate-500">{t('Your work autosaves in this browser.')}</p>
        </footer>
      </div>
    </dialog>
  )
}

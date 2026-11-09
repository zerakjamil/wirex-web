'use client'

import { useI18n } from '@/i18n/useI18n'
import { APP_CREATOR, APP_DEVELOPER } from '@/lib/appInfo'

export function BrandCredit({ className = '' }: { className?: string }) {
  const { t } = useI18n()

  return (
    <span className={`pt-credit ${className}`.trim()} data-testid="brand-credit">
      <span>{t('Created by')} <bdi dir="ltr">{APP_CREATOR}</bdi></span>
      <span className="pt-credit-sep" aria-hidden="true">·</span>
      <span>{t('Developed by')} <bdi dir="ltr">{APP_DEVELOPER}</bdi></span>
    </span>
  )
}

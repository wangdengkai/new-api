/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  formatQuota,
  parseQuotaFromDollars,
  quotaUnitsToEditableAmount,
} from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { getServerMessage } from '@/lib/server-error-message'

import { setMultiKeyQuotaLimits } from '../../api'
import type { KeyStatus, MultiKeyQuotaLimits } from '../../types'

type QuotaWindowKey = 'daily' | 'weekly' | 'monthly'

type MultiKeyQuotaLimitsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  channelId: number | null
  keyStatus: KeyStatus | null
  onSaved: () => void
}

const quotaAmountInput = (quota?: number) =>
  (quota ?? 0) > 0 ? String(quotaUnitsToEditableAmount(quota ?? 0)) : ''

export function MultiKeyQuotaLimitsDialog(
  props: MultiKeyQuotaLimitsDialogProps
) {
  const { t } = useTranslation()
  const [amounts, setAmounts] = useState<Record<QuotaWindowKey, string>>({
    daily: '',
    weekly: '',
    monthly: '',
  })
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (props.open && props.keyStatus) {
      setAmounts({
        daily: quotaAmountInput(props.keyStatus.daily_quota),
        weekly: quotaAmountInput(props.keyStatus.weekly_quota),
        monthly: quotaAmountInput(props.keyStatus.monthly_quota),
      })
    }
  }, [props.open, props.keyStatus])

  const save = async (limits: MultiKeyQuotaLimits) => {
    if (props.channelId === null || !props.keyStatus) return
    setIsSaving(true)
    try {
      const response = await setMultiKeyQuotaLimits(
        props.channelId,
        props.keyStatus.index,
        limits
      )
      if (response?.success) {
        toast.success(getServerMessage(response) || t('Operation successful'))
        props.onSaved()
        props.onOpenChange(false)
      } else {
        handleServerError(response, t('Operation failed'))
      }
    } catch (error: unknown) {
      handleServerError(error, t('Operation failed'))
    } finally {
      setIsSaving(false)
    }
  }

  const parseLimit = (value: string): number | null => {
    if (value.trim() === '') return 0
    const parsed = Number.parseFloat(value)
    if (!Number.isFinite(parsed) || parsed < 0) return null
    return parseQuotaFromDollars(parsed)
  }

  const handleSubmit = () => {
    const daily = parseLimit(amounts.daily)
    const weekly = parseLimit(amounts.weekly)
    const monthly = parseLimit(amounts.monthly)
    if (daily === null || weekly === null || monthly === null) {
      toast.error(t('Please enter a valid amount'))
      return
    }
    void save({ daily, weekly, monthly })
  }

  const hasLimit =
    (props.keyStatus?.daily_quota ?? 0) > 0 ||
    (props.keyStatus?.weekly_quota ?? 0) > 0 ||
    (props.keyStatus?.monthly_quota ?? 0) > 0

  const fields: Array<{
    key: QuotaWindowKey
    label: string
    usedLabel: string
  }> = [
    {
      key: 'daily',
      label: t('Daily limit'),
      usedLabel: t('Used today: {{amount}}', {
        amount: formatQuota(props.keyStatus?.daily_used ?? 0),
      }),
    },
    {
      key: 'weekly',
      label: t('Weekly limit'),
      usedLabel: t('Used this week: {{amount}}', {
        amount: formatQuota(props.keyStatus?.weekly_used ?? 0),
      }),
    },
    {
      key: 'monthly',
      label: t('Monthly limit'),
      usedLabel: t('Used this month: {{amount}}', {
        amount: formatQuota(props.keyStatus?.monthly_used ?? 0),
      }),
    },
  ]

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Quota Limits')}
      description={t(
        'Cap the amount this key may spend per day, week, or month. Once a cap is reached, the key is skipped until that window resets.'
      )}
      footer={
        <div className='flex justify-end gap-2'>
          <Button
            variant='outline'
            onClick={() => props.onOpenChange(false)}
            disabled={isSaving}
          >
            {t('Cancel')}
          </Button>
          {hasLimit && (
            <Button
              variant='outline'
              onClick={() =>
                void save({ daily: 0, weekly: 0, monthly: 0 })
              }
              disabled={isSaving}
            >
              {t('Remove Limits')}
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Save')}
          </Button>
        </div>
      }
    >
      <div className='space-y-4'>
        {props.keyStatus && (
          <div className='space-y-1'>
            <p className='font-mono text-sm'>
              #{props.keyStatus.index + 1}
              {props.keyStatus.key_preview
                ? ` · ${props.keyStatus.key_preview}`
                : ''}
            </p>
            <p className='text-muted-foreground text-xs'>
              {t('Last 7 days: {{amount}}', {
                amount: formatQuota(props.keyStatus.usage_7d ?? 0),
              })}
              {' · '}
              {t('Last 30 days: {{amount}}', {
                amount: formatQuota(props.keyStatus.usage_30d ?? 0),
              })}
            </p>
          </div>
        )}
        {fields.map((field) => (
          <div
            key={field.key}
            className='space-y-1'
            data-testid={`quota-window-${field.key}`}
          >
            <Label htmlFor={`multi-key-${field.key}-quota`}>
              {field.label}
            </Label>
            <Input
              id={`multi-key-${field.key}-quota`}
              type='number'
              min='0'
              step='any'
              value={amounts[field.key]}
              placeholder={t('Leave empty to remove the limit')}
              onChange={(e) =>
                setAmounts((current) => ({
                  ...current,
                  [field.key]: e.target.value,
                }))
              }
            />
            <p className='text-muted-foreground text-xs'>{field.usedLabel}</p>
          </div>
        ))}
        <p className='text-muted-foreground text-xs'>
          {t(
            'Weekly limits reset on Monday; monthly limits reset on the first day of the month (server local time).'
          )}
        </p>
      </div>
    </Dialog>
  )
}

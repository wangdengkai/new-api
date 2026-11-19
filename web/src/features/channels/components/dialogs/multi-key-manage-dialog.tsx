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
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw, Trash2, Power, PowerOff } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuota } from '@/lib/format'
import {
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from '@/lib/admin-permissions'
import { handleServerError } from '@/lib/handle-server-error'
import {
  getServerMessage,
  translateServerText,
} from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  getMultiKeyStatus,
  enableMultiKey,
  disableMultiKey,
  deleteMultiKey,
  enableAllMultiKeys,
  disableAllMultiKeys,
  deleteDisabledMultiKeys,
} from '../../api'
import {
  CHANNEL_TYPE_TASK_PLUGIN,
  MULTI_KEY_FILTER_OPTIONS,
} from '../../constants'
import {
  channelsQueryKeys,
  formatTimestamp,
  getMultiKeyStatusConfig,
  getMultiKeyConfirmMessage,
  isDestructiveAction,
} from '../../lib'
import { formatChannelBalanceSummary } from '../../lib/channel-balance'
import type { KeyStatus, MultiKeyConfirmAction } from '../../types'
import { ChannelBalanceDetails } from '../channel-balance-details'
import { useChannels } from '../channels-provider'
import { MultiKeyQuotaLimitsDialog } from './multi-key-daily-quota-dialog'
import { StatisticsCard } from './multi-key-statistics-card'
import { MultiKeyTableRowActions } from './multi-key-table-row-actions'

type MultiKeyManageDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MultiKeyManageDialog({
  open,
  onOpenChange,
}: MultiKeyManageDialogProps) {
  const { t, i18n } = useTranslation()
  const { currentRow } = useChannels()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  // A plugin channel queries the balance of each key.
  const keyBalances =
    currentRow?.type === CHANNEL_TYPE_TASK_PLUGIN
      ? currentRow.balance_detail?.keys
      : undefined
  const queryClient = useQueryClient()
  const currentUser = useAuthStore((s) => s.auth.user)
  const canEditSensitive = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.CHANNEL,
    ADMIN_PERMISSION_ACTIONS.SENSITIVE_WRITE
  )

  // Data state
  const [isLoading, setIsLoading] = useState(false)
  const [keys, setKeys] = useState<KeyStatus[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [enabledCount, setEnabledCount] = useState(0)
  const [manualDisabledCount, setManualDisabledCount] = useState(0)
  const [autoDisabledCount, setAutoDisabledCount] = useState(0)

  // UI state
  const [statusFilter, setStatusFilter] = useState<number | null>(null)
  const [quotaKey, setQuotaKey] = useState<KeyStatus | null>(null)
  const [confirmAction, setConfirmAction] =
    useState<MultiKeyConfirmAction | null>(null)
  const [isPerformingAction, setIsPerformingAction] = useState(false)
  // A confirmed action reloads the table, which can remove the button that
  // asked for it. Focus then comes back into this dialog rather than to
  // whatever opened the dialog, so the next Escape closes only this dialog.
  const confirmOpenerRef = useRef<HTMLElement | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const openConfirm = (action: MultiKeyConfirmAction) => {
    const opener = document.activeElement
    confirmOpenerRef.current = opener instanceof HTMLElement ? opener : null
    setConfirmAction(action)
  }

  const getConfirmFinalFocus = () => {
    const opener = confirmOpenerRef.current
    return opener && bodyRef.current?.contains(opener)
      ? opener
      : bodyRef.current
  }

  // Reset and load data when dialog opens
  useEffect(() => {
    if (open && currentRow) {
      setCurrentPage(1)
      setStatusFilter(null)
      loadKeyStatus(1, pageSize, null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentRow?.id])

  const loadKeyStatus = async (
    page: number = currentPage,
    size: number = pageSize,
    status: number | null = statusFilter
  ) => {
    if (!currentRow) return

    setIsLoading(true)
    try {
      const response = await getMultiKeyStatus(
        currentRow.id,
        page,
        size,
        status === null ? undefined : status
      )

      if (response.success && response.data) {
        setKeys(response.data.keys || [])
        setTotal(response.data.total || 0)
        setCurrentPage(response.data.page || 1)
        setPageSize(response.data.page_size || 10)
        setTotalPages(response.data.total_pages || 0)
        setEnabledCount(response.data.enabled_count || 0)
        setManualDisabledCount(response.data.manual_disabled_count || 0)
        setAutoDisabledCount(response.data.auto_disabled_count || 0)
      } else {
        handleServerError(response, t('Failed to load key status'))
      }
    } catch (error: unknown) {
      handleServerError(error, t('Failed to load key status'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleStatusFilterChange = (value: string) => {
    const newFilter = value === 'all' ? null : Number.parseInt(value)
    setStatusFilter(newFilter)
    setCurrentPage(1)
    loadKeyStatus(1, pageSize, newFilter)
  }

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage)
    loadKeyStatus(newPage, pageSize)
  }

  const performAction = async () => {
    if (!confirmAction || !currentRow) return
    if (
      !canEditSensitive &&
      (confirmAction.type === 'delete' ||
        confirmAction.type === 'delete-disabled')
    ) {
      setConfirmAction(null)
      return
    }

    setIsPerformingAction(true)
    try {
      const { type, keyIndex } = confirmAction
      let response

      // Execute the appropriate action
      if (type === 'enable' && keyIndex !== undefined) {
        response = await enableMultiKey(currentRow.id, keyIndex)
      } else if (type === 'disable' && keyIndex !== undefined) {
        response = await disableMultiKey(currentRow.id, keyIndex)
      } else if (type === 'delete' && keyIndex !== undefined) {
        response = await deleteMultiKey(currentRow.id, keyIndex)
      } else if (type === 'enable-all') {
        response = await enableAllMultiKeys(currentRow.id)
      } else if (type === 'disable-all') {
        response = await disableAllMultiKeys(currentRow.id)
      } else if (type === 'delete-disabled') {
        response = await deleteDisabledMultiKeys(currentRow.id)
      }

      if (response?.success) {
        toast.success(getServerMessage(response) || t('Operation successful'))
        queryClient.invalidateQueries({ queryKey: channelsQueryKeys.lists() })
        // A plugin channel's edit drawer lists the same lines beside this dialog.
        queryClient.invalidateQueries({
          queryKey: channelsQueryKeys.pluginCredentials(currentRow.id),
        })

        // Reload data - reset to page 1 for bulk actions
        const isBulkAction = type.includes('all') || type === 'delete-disabled'
        if (isBulkAction) {
          setCurrentPage(1)
          loadKeyStatus(1, pageSize)
        } else {
          loadKeyStatus(currentPage, pageSize)
        }
      } else {
        handleServerError(response, t('Operation failed'))
      }
    } catch (error: unknown) {
      handleServerError(error, t('Operation failed'))
    } finally {
      setIsPerformingAction(false)
      setConfirmAction(null)
    }
  }

  const confirmKey =
    confirmAction?.keyIndex !== undefined
      ? keys.find((key) => key.index === confirmAction.keyIndex)
      : undefined
  const confirmDesc = confirmKey
    ? `${t(getMultiKeyConfirmMessage(confirmAction))} (#${confirmKey.index + 1}${
        confirmKey.key_preview ? ` · ${confirmKey.key_preview}` : ''
      })`
    : t(getMultiKeyConfirmMessage(confirmAction))

  const maxUsage7d = keys.reduce(
    (max, key) => Math.max(max, key.usage_7d ?? 0),
    0
  )

  const renderStatusBadge = (status: number) => {
    const config = getMultiKeyStatusConfig(status)
    return (
      <StatusBadge
        label={t(config.label)}
        variant={config.variant}
        showDot
        copyable={false}
      />
    )
  }

  const formatKeyTimestamp = (timestamp?: number) => {
    if (!timestamp) return '-'
    return formatTimestamp(timestamp)
  }

  const renderQuotaLimits = (key: KeyStatus) => {
    const windows = [
      {
        label: t('Daily'),
        quota: key.daily_quota ?? 0,
        used: key.daily_used ?? 0,
      },
      {
        label: t('Weekly'),
        quota: key.weekly_quota ?? 0,
        used: key.weekly_used ?? 0,
      },
      {
        label: t('Monthly'),
        quota: key.monthly_quota ?? 0,
        used: key.monthly_used ?? 0,
      },
    ].filter((window) => window.quota > 0)
    if (windows.length === 0) {
      return <span className='text-muted-foreground'>{t('Unlimited')}</span>
    }
    return (
      <div className='space-y-0.5 whitespace-normal tabular-nums'>
        {windows.map((window) => (
          <div
            key={window.label}
            className={cn(window.used >= window.quota && 'text-destructive')}
          >
            {window.label}: {formatQuota(window.used)} /{' '}
            {formatQuota(window.quota)}
          </div>
        ))}
      </div>
    )
  }

  const renderRecentUsage = (key: KeyStatus) => {
    const week = key.usage_7d ?? 0
    const month = key.usage_30d ?? 0
    if (week <= 0 && month <= 0) {
      return <span className='text-muted-foreground'>-</span>
    }
    const percent = maxUsage7d > 0 ? Math.round((week / maxUsage7d) * 100) : 0
    return (
      <div className='space-y-1 whitespace-normal tabular-nums'>
        <div>
          {t('Last 7 days: {{amount}}', { amount: formatQuota(week) })}
        </div>
        <div className='text-muted-foreground'>
          {t('Last 30 days: {{amount}}', { amount: formatQuota(month) })}
        </div>
        <div className='bg-muted h-1 w-full rounded-full'>
          <div
            className='bg-primary h-1 rounded-full'
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    )
  }

  if (!currentRow) return null

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={
          <>
            {t('Multi-Key Management')}
            <StatusBadge
              label={currentRow.name}
              variant='neutral'
              copyable={false}
            />
            {currentRow.channel_info?.multi_key_mode && (
              <StatusBadge
                label={
                  currentRow.channel_info.multi_key_mode === 'random'
                    ? t('Random')
                    : t('Polling')
                }
                variant='neutral'
                copyable={false}
              />
            )}
          </>
        }
        description={t(
          'Manage multi-key status and configuration for this channel'
        )}
        // Key balances add a column, which needs the wider dialog.
        contentClassName={cn(
          'flex max-h-[min(90dvh,var(--dialog-available-height))] max-w-5xl flex-col',
          keyBalances && 'sm:max-w-5xl'
        )}
        titleClassName='flex items-center gap-2'
        contentHeight='min(72vh, 720px)'
        bodyClassName='space-y-4'
      >
        <div
          ref={bodyRef}
          className='flex min-h-0 flex-1 flex-col space-y-4 overflow-hidden'
        >
          {/* Statistics */}
          <div className='grid shrink-0 grid-cols-3 gap-3'>
            <StatisticsCard
              label={t('Enabled')}
              count={enabledCount}
              total={total}
            />
            <StatisticsCard
              label={t('Manual Disabled')}
              count={manualDisabledCount}
              total={total}
            />
            <StatisticsCard
              label={t('Auto Disabled')}
              count={autoDisabledCount}
              total={total}
            />
          </div>

          <Separator className='shrink-0' />

          {/* Toolbar */}
          <div className='flex shrink-0 items-center justify-between'>
            <Select
              items={MULTI_KEY_FILTER_OPTIONS.map((option) => ({
                value: option.value,
                label: t(option.label),
              }))}
              value={statusFilter === null ? 'all' : statusFilter.toString()}
              onValueChange={(v) => v !== null && handleStatusFilterChange(v)}
            >
              <SelectTrigger className='w-40'>
                <SelectValue placeholder={t('All Status')} />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {MULTI_KEY_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(option.label)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={() => loadKeyStatus()}
                disabled={isLoading}
              >
                <RefreshCw className='h-4 w-4' />
              </Button>

              {manualDisabledCount + autoDisabledCount > 0 && (
                <Button
                  variant='default'
                  size='sm'
                  onClick={() => openConfirm({ type: 'enable-all' })}
                >
                  <Power className='mr-2 h-4 w-4' />
                  {t('Enable All')}
                </Button>
              )}

              {enabledCount > 0 && (
                <Button
                  variant='destructive'
                  size='sm'
                  onClick={() => openConfirm({ type: 'disable-all' })}
                >
                  <PowerOff className='mr-2 h-4 w-4' />
                  {t('Disable All')}
                </Button>
              )}

              {autoDisabledCount > 0 && (
                <Button
                  variant='destructive'
                  size='sm'
                  onClick={() => {
                    if (!canEditSensitive) return
                    openConfirm({ type: 'delete-disabled' })
                  }}
                  disabled={!canEditSensitive}
                  title={
                    canEditSensitive
                      ? undefined
                      : t('No permission to perform this action')
                  }
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  {t('Delete Auto-Disabled')}
                </Button>
              )}
            </div>
          </div>
          {!canEditSensitive && (
            <p className='text-muted-foreground text-xs'>
              {t('No permission to perform this action')}
            </p>
          )}

          {/* Table */}
          <div className='min-h-0 flex-1 overflow-auto rounded-md border'>
            {isLoading && (
              <div className='flex items-center justify-center py-12'>
                <Loader2 className='text-muted-foreground h-8 w-8 animate-spin' />
              </div>
            )}
            {!isLoading && keys.length === 0 && (
              <div className='text-muted-foreground py-12 text-center'>
                {t('No keys found')}
              </div>
            )}
            {!isLoading && !(keys.length === 0) && (
              <StaticDataTable
                className='rounded-none border-0'
                tableClassName='min-w-[1120px]'
                data={keys}
                getRowKey={(key) => key.index}
                columns={[
                  {
                    id: 'index',
                    header: t('Index'),
                    className: 'w-20',
                    cellClassName: 'font-mono text-sm',
                    cell: (key) => `#${key.index + 1}`,
                  },
                  {
                    id: 'key',
                    header: t('Key'),
                    className: 'w-44',
                    cellClassName: 'font-mono text-sm',
                    cell: (key) => key.key_preview,
                  },
                  {
                    id: 'status',
                    header: t('Status'),
                    className: 'w-32',
                    cell: (key) => renderStatusBadge(key.status),
                  },
                  {
                    id: 'quota-limits',
                    header: t('Quota Limits'),
                    className: 'w-56',
                    cellClassName: 'text-sm',
                    cell: (key) => renderQuotaLimits(key),
                  },
                  {
                    id: 'recent-usage',
                    header: t('Recent Usage'),
                    className: 'w-48',
                    cellClassName: 'text-sm',
                    cell: (key) => renderRecentUsage(key),
                  },
                  ...(keyBalances
                    ? [
                        {
                          id: 'balance',
                          header: t('Balance'),
                          className: 'w-48',
                          cellClassName: 'text-sm',
                          cell: (key: KeyStatus) => {
                            const result = keyBalances[String(key.index)]
                            if (!result) return '-'
                            // Wraps, so the key actions stay in view.
                            return (
                              <div className='max-w-56 space-y-0.5 whitespace-normal'>
                                <div className='font-medium'>
                                  {/* A key has no USD balance of its own. */}
                                  {formatChannelBalanceSummary(
                                    result,
                                    Number.NaN,
                                    { locale }
                                  )}
                                </div>
                                <ChannelBalanceDetails
                                  result={result}
                                  className='text-muted-foreground'
                                />
                              </div>
                            )
                          },
                        },
                      ]
                    : []),
                  {
                    id: 'reason',
                    header: t('Disabled Reason'),
                    className: 'min-w-[200px]',
                    cellClassName: 'max-w-xs truncate text-sm',
                    cell: (key) =>
                      key.reason ? translateServerText(t, key.reason) : '-',
                  },
                  {
                    id: 'disabled-time',
                    header: t('Disabled Time'),
                    className: 'w-44',
                    cellClassName: 'text-muted-foreground text-sm',
                    cell: (key) => formatKeyTimestamp(key.disabled_time),
                  },
                  {
                    id: 'actions',
                    header: t('Actions'),
                    className: 'text-right',
                    cell: (key) => (
                      <MultiKeyTableRowActions
                        keyIndex={key.index}
                        status={key.status}
                        canDelete={canEditSensitive}
                        onAction={openConfirm}
                        onEditDailyQuota={() => setQuotaKey(key)}
                      />
                    ),
                  },
                ]}
              />
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className='flex shrink-0 items-center justify-between'>
              <div className='text-muted-foreground text-sm'>
                {t('Page {{current}} of {{total}}', {
                  current: currentPage,
                  total: totalPages,
                })}
              </div>
              <div className='flex gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || isLoading}
                >
                  {t('Previous')}
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || isLoading}
                >
                  {t('Next')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={t('Confirm Action')}
        desc={confirmDesc}
        destructive={isDestructiveAction(confirmAction)}
        isLoading={isPerformingAction}
        handleConfirm={performAction}
        finalFocus={getConfirmFinalFocus}
      />

      {/* Quota Limits Dialog */}
      <MultiKeyQuotaLimitsDialog
        open={quotaKey !== null}
        onOpenChange={(isOpen) => !isOpen && setQuotaKey(null)}
        channelId={currentRow.id}
        keyStatus={quotaKey}
        onSaved={() => loadKeyStatus(currentPage, pageSize)}
      />
    </>
  )
}

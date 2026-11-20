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
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { toast } from 'sonner'
import { afterEach, expect, test, vi } from 'vitest'

import { setMultiKeyQuotaLimits } from '../../../api'
import type { KeyStatus } from '../../../types'
import { MultiKeyQuotaLimitsDialog } from '../multi-key-daily-quota-dialog'

vi.mock('../../../api', () => ({ setMultiKeyQuotaLimits: vi.fn() }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      key.replaceAll(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(options?.[name] ?? '')
      ),
  }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/format', () => ({
  formatQuota: (value: number) => `$${value}`,
  parseQuotaFromDollars: (value: number) => Math.round(value * 500000),
  quotaUnitsToEditableAmount: (value: number) => value / 500000,
}))
vi.mock('@/lib/handle-server-error', () => ({ handleServerError: vi.fn() }))
vi.mock('@/lib/server-error-message', () => ({
  getServerMessage: () => '',
}))

const keyStatus: KeyStatus = { index: 0, status: 1 }

function renderDialog(
  props: Partial<ComponentProps<typeof MultiKeyQuotaLimitsDialog>> = {}
) {
  const onSaved = vi.fn()
  const onOpenChange = vi.fn()
  render(
    <MultiKeyQuotaLimitsDialog
      open
      onOpenChange={onOpenChange}
      channelId={7}
      keyStatus={keyStatus}
      onSaved={onSaved}
      {...props}
    />
  )
  return { onSaved, onOpenChange }
}

afterEach(() => {
  vi.mocked(setMultiKeyQuotaLimits).mockReset()
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
})

test('saves every window as quota units and closes the dialog', async () => {
  vi.mocked(setMultiKeyQuotaLimits).mockResolvedValue({ success: true })
  const user = userEvent.setup()
  const { onSaved, onOpenChange } = renderDialog()

  await user.type(screen.getByLabelText('Daily limit'), '2')
  await user.type(screen.getByLabelText('Weekly limit'), '10')
  await user.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() =>
    expect(setMultiKeyQuotaLimits).toHaveBeenCalledWith(7, 0, {
      daily: 1000000,
      weekly: 5000000,
      monthly: 0,
    })
  )
  expect(onSaved).toHaveBeenCalled()
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('removing existing limits sends zeros for every window', async () => {
  vi.mocked(setMultiKeyQuotaLimits).mockResolvedValue({ success: true })
  const user = userEvent.setup()
  renderDialog({
    keyStatus: {
      ...keyStatus,
      daily_quota: 100,
      daily_used: 40,
      weekly_quota: 200,
      weekly_used: 160,
      monthly_quota: 300,
      monthly_used: 10,
    },
  })

  expect(screen.getByText('Used today: $40')).toBeInTheDocument()
  expect(screen.getByText('Used this week: $160')).toBeInTheDocument()
  expect(screen.getByText('Used this month: $10')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Remove Limits' }))

  await waitFor(() =>
    expect(setMultiKeyQuotaLimits).toHaveBeenCalledWith(7, 0, {
      daily: 0,
      weekly: 0,
      monthly: 0,
    })
  )
})

test('a negative amount is rejected without calling the API', async () => {
  const user = userEvent.setup()
  renderDialog()

  await user.type(screen.getByLabelText('Monthly limit'), '-1')
  await user.click(screen.getByRole('button', { name: 'Save' }))

  expect(setMultiKeyQuotaLimits).not.toHaveBeenCalled()
  expect(toast.error).toHaveBeenCalledWith('Please enter a valid amount')
})

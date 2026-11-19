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
import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import { getMultiKeyStatus } from '../../../api'
import { ChannelQuotaLimitsDialog } from '../channel-quota-limits-dialog'

vi.mock('../../../api', () => ({
  getMultiKeyStatus: vi.fn(),
  setMultiKeyQuotaLimits: vi.fn(),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/format', () => ({
  formatQuota: (value: number) => `$${value}`,
  parseQuotaFromDollars: (value: number) => value,
  quotaUnitsToEditableAmount: (value: number) => value,
}))
vi.mock('@/lib/handle-server-error', () => ({ handleServerError: vi.fn() }))
vi.mock('@/lib/server-error-message', () => ({
  getServerMessage: () => '',
}))

afterEach(() => {
  vi.mocked(getMultiKeyStatus).mockReset()
})

test('a single-key channel opens the limits dialog with its only key', async () => {
  vi.mocked(getMultiKeyStatus).mockResolvedValue({
    success: true,
    data: {
      keys: [{ index: 0, status: 1, key_preview: 'sk-1234...abcd' }],
      total: 1,
      page: 1,
      page_size: 1,
      total_pages: 1,
      enabled_count: 1,
      manual_disabled_count: 0,
      auto_disabled_count: 0,
    },
  })

  render(
    <ChannelQuotaLimitsDialog open onOpenChange={() => {}} channelId={7} />
  )

  expect(await screen.findByText('Quota Limits')).toBeInTheDocument()
  expect(screen.getByText(/sk-1234\.\.\.abcd/)).toBeInTheDocument()
  expect(getMultiKeyStatus).toHaveBeenCalledWith(7, 1, 1)
})

test('a closed dialog loads nothing', () => {
  render(
    <ChannelQuotaLimitsDialog
      open={false}
      onOpenChange={() => {}}
      channelId={7}
    />
  )
  expect(getMultiKeyStatus).not.toHaveBeenCalled()
})

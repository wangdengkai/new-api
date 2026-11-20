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
import { useEffect, useState } from 'react'

import { getMultiKeyStatus } from '../../api'
import type { KeyStatus } from '../../types'
import { MultiKeyQuotaLimitsDialog } from './multi-key-daily-quota-dialog'

type ChannelQuotaLimitsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  channelId: number | null
  onSaved?: () => void
}

/**
 * Quota limits of a single-key channel. The key status API answers the one key
 * of the channel as index 0, which the limits dialog already understands.
 */
export function ChannelQuotaLimitsDialog(props: ChannelQuotaLimitsDialogProps) {
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null)

  useEffect(() => {
    if (!props.open || props.channelId === null) {
      setKeyStatus(null)
      return
    }
    let cancelled = false
    void getMultiKeyStatus(props.channelId, 1, 1)
      .then((response) => {
        if (cancelled) return
        if (response.success && response.data?.keys?.length) {
          setKeyStatus(response.data.keys[0] ?? null)
        }
      })
      .catch(() => {
        // The channel may have been deleted while the table is stale.
      })
    return () => {
      cancelled = true
    }
  }, [props.open, props.channelId])

  if (!props.open || props.channelId === null || !keyStatus) return null
  return (
    <MultiKeyQuotaLimitsDialog
      open
      onOpenChange={props.onOpenChange}
      channelId={props.channelId}
      keyStatus={keyStatus}
      onSaved={() => props.onSaved?.()}
    />
  )
}

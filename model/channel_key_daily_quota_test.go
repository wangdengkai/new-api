package model

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChannelKeyQuotaUsageTracksDayWeekAndMonthWindows(t *testing.T) {
	AddChannelKeyQuotaUsage(9001, 0, 100)
	AddChannelKeyQuotaUsage(9001, 0, 50)
	assert.Equal(t, map[int]ChannelKeyQuotaUsage{
		0: {Daily: 150, Weekly: 150, Monthly: 150},
	}, GetChannelKeyQuotaUsage(9001))

	// A window whose stored start differs has rolled over and reads zero,
	// while the other windows keep the usage.
	channelKeyQuotaUsageStore.Lock()
	channelKeyQuotaUsageStore.daily.start = "2000-01-01"
	channelKeyQuotaUsageStore.Unlock()
	assert.Equal(t, ChannelKeyQuotaUsage{Weekly: 150, Monthly: 150}, getChannelKeyQuotaUsage(9001, 0))

	AddChannelKeyQuotaUsage(9001, 0, 10)
	assert.Equal(t, int64(10), getChannelKeyQuotaUsage(9001, 0).Daily)
}

func TestGetNextEnabledKeyForRelaySkipsKeysOverAnyQuotaWindow(t *testing.T) {
	channel := &Channel{
		Id:  9002,
		Key: "key-a\nkey-b",
		ChannelInfo: ChannelInfo{
			IsMultiKey:   true,
			MultiKeySize: 2,
			MultiKeyMode: constant.MultiKeyModeRandom,
			QuotaLimits: map[int]ChannelKeyQuotaLimit{
				0: {Daily: 100},
			},
		},
	}
	AddChannelKeyQuotaUsage(channel.Id, 0, 100)

	for range 20 {
		key, index, err := channel.GetNextEnabledKeyForRelay()
		require.Nil(t, err)
		assert.Equal(t, "key-b", key)
		assert.Equal(t, 1, index)
	}

	// A weekly cap alone also excludes its key.
	weekly := &Channel{
		Id:  9003,
		Key: "key-a\nkey-b",
		ChannelInfo: ChannelInfo{
			IsMultiKey:   true,
			MultiKeySize: 2,
			MultiKeyMode: constant.MultiKeyModeRandom,
			QuotaLimits: map[int]ChannelKeyQuotaLimit{
				0: {Weekly: 100},
			},
		},
	}
	AddChannelKeyQuotaUsage(weekly.Id, 0, 100)
	for range 20 {
		_, index, err := weekly.GetNextEnabledKeyForRelay()
		require.Nil(t, err)
		assert.Equal(t, 1, index)
	}

	// The plain picker ignores the caps so admin and test paths still reach
	// every enabled key.
	seen := make(map[int]bool)
	for range 20 {
		_, index, err := channel.GetNextEnabledKey()
		require.Nil(t, err)
		seen[index] = true
	}
	assert.True(t, seen[0])
}

func TestGetNextEnabledKeyForRelayFailsWhenEveryEnabledKeyIsCapped(t *testing.T) {
	channel := &Channel{
		Id:  9004,
		Key: "key-a",
		ChannelInfo: ChannelInfo{
			IsMultiKey:   true,
			MultiKeySize: 1,
			MultiKeyMode: constant.MultiKeyModeRandom,
			QuotaLimits: map[int]ChannelKeyQuotaLimit{
				0: {Monthly: 100},
			},
		},
	}
	AddChannelKeyQuotaUsage(channel.Id, 0, 100)

	_, _, err := channel.GetNextEnabledKeyForRelay()
	require.NotNil(t, err)
	assert.Equal(t, types.ErrorCodeChannelNoAvailableKey, err.GetErrorCode())
	assert.False(t, channel.HasQuotaCapacity())
}

func TestHasQuotaCapacityKeepsChannelsWithAKeyUnderItsCaps(t *testing.T) {
	channel := &Channel{
		Id:  9005,
		Key: "key-a\nkey-b",
		ChannelInfo: ChannelInfo{
			IsMultiKey:   true,
			MultiKeySize: 2,
			QuotaLimits: map[int]ChannelKeyQuotaLimit{
				0: {Daily: 100},
			},
		},
	}
	AddChannelKeyQuotaUsage(channel.Id, 0, 100)
	assert.True(t, channel.HasQuotaCapacity())
}

func TestSingleKeyChannelEnforcesQuotaCapsAtIndexZero(t *testing.T) {
	channel := &Channel{
		Id:  9006,
		Key: "sk-solo",
		ChannelInfo: ChannelInfo{
			QuotaLimits: map[int]ChannelKeyQuotaLimit{
				0: {Daily: 100},
			},
		},
	}
	AddChannelKeyQuotaUsage(channel.Id, 0, 100)

	_, _, err := channel.GetNextEnabledKeyForRelay()
	require.NotNil(t, err)
	assert.Equal(t, types.ErrorCodeChannelNoAvailableKey, err.GetErrorCode())
	assert.False(t, channel.HasQuotaCapacity())

	// Admin and channel-test paths still resolve the key.
	key, index, err := channel.GetNextEnabledKey()
	require.Nil(t, err)
	assert.Equal(t, "sk-solo", key)
	assert.Equal(t, 0, index)
}

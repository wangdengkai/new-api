package model

import (
	"sync"
	"time"
)

// Per-key quota caps of multi-key channels are enforced from counters in
// process memory. Each counter belongs to the day, week (Monday first) or month
// window of the server's local time, so a new window starts with a zero counter
// and no reset job is needed. Usage is recorded when a request settles, which
// means concurrent in-flight requests can push a key slightly past a cap.
//
// The counters are not shared between nodes: with several gateway instances,
// each node counts only its own traffic.
type ChannelKeyQuotaUsage struct {
	Daily   int64
	Weekly  int64
	Monthly int64
}

type channelKeyQuotaWindow struct {
	start string
	used  map[int]map[int]int64 // channel id -> key index -> settled quota
}

var channelKeyQuotaUsageStore = struct {
	sync.RWMutex
	daily   channelKeyQuotaWindow
	weekly  channelKeyQuotaWindow
	monthly channelKeyQuotaWindow
}{}

// quotaWindowStarts returns the start keys of the day, week (Monday first) and
// month windows that contain now, in the server's local time zone.
func quotaWindowStarts(now time.Time) (day string, week string, month string) {
	day = now.Format("2006-01-02")
	daysSinceMonday := (int(now.Weekday()) + 6) % 7
	week = now.AddDate(0, 0, -daysSinceMonday).Format("2006-01-02")
	month = now.Format("2006-01")
	return day, week, month
}

func addToQuotaWindow(window *channelKeyQuotaWindow, start string, channelId int, keyIndex int, quota int64) {
	if window.start != start {
		window.start = start
		window.used = make(map[int]map[int]int64)
	}
	keys, ok := window.used[channelId]
	if !ok {
		keys = make(map[int]int64)
		window.used[channelId] = keys
	}
	keys[keyIndex] += quota
}

func quotaWindowUsage(window *channelKeyQuotaWindow, start string, channelId int, keyIndex int) int64 {
	if window.start != start {
		return 0
	}
	return window.used[channelId][keyIndex]
}

// AddChannelKeyQuotaUsage records settled quota for one key of a multi-key
// channel in the current day, week and month windows. Non-positive amounts and
// invalid indexes are ignored.
func AddChannelKeyQuotaUsage(channelId int, keyIndex int, quota int64) {
	if channelId <= 0 || keyIndex < 0 || quota <= 0 {
		return
	}
	day, week, month := quotaWindowStarts(time.Now())
	channelKeyQuotaUsageStore.Lock()
	defer channelKeyQuotaUsageStore.Unlock()
	addToQuotaWindow(&channelKeyQuotaUsageStore.daily, day, channelId, keyIndex, quota)
	addToQuotaWindow(&channelKeyQuotaUsageStore.weekly, week, channelId, keyIndex, quota)
	addToQuotaWindow(&channelKeyQuotaUsageStore.monthly, month, channelId, keyIndex, quota)
}

// GetChannelKeyQuotaUsage returns a copy of the current windows' settled quota
// for every key of the channel. It returns nil when the channel has no usage.
func GetChannelKeyQuotaUsage(channelId int) map[int]ChannelKeyQuotaUsage {
	day, week, month := quotaWindowStarts(time.Now())
	channelKeyQuotaUsageStore.RLock()
	defer channelKeyQuotaUsageStore.RUnlock()
	usage := make(map[int]ChannelKeyQuotaUsage)
	collect := func(window *channelKeyQuotaWindow, start string, assign func(usage *ChannelKeyQuotaUsage, used int64)) {
		if window.start != start {
			return
		}
		for keyIndex, used := range window.used[channelId] {
			keyUsage := usage[keyIndex]
			assign(&keyUsage, used)
			usage[keyIndex] = keyUsage
		}
	}
	collect(&channelKeyQuotaUsageStore.daily, day, func(keyUsage *ChannelKeyQuotaUsage, used int64) { keyUsage.Daily = used })
	collect(&channelKeyQuotaUsageStore.weekly, week, func(keyUsage *ChannelKeyQuotaUsage, used int64) { keyUsage.Weekly = used })
	collect(&channelKeyQuotaUsageStore.monthly, month, func(keyUsage *ChannelKeyQuotaUsage, used int64) { keyUsage.Monthly = used })
	if len(usage) == 0 {
		return nil
	}
	return usage
}

// getChannelKeyQuotaUsage returns the current windows' settled quota for one key.
func getChannelKeyQuotaUsage(channelId int, keyIndex int) ChannelKeyQuotaUsage {
	day, week, month := quotaWindowStarts(time.Now())
	channelKeyQuotaUsageStore.RLock()
	defer channelKeyQuotaUsageStore.RUnlock()
	return ChannelKeyQuotaUsage{
		Daily:   quotaWindowUsage(&channelKeyQuotaUsageStore.daily, day, channelId, keyIndex),
		Weekly:  quotaWindowUsage(&channelKeyQuotaUsageStore.weekly, week, channelId, keyIndex),
		Monthly: quotaWindowUsage(&channelKeyQuotaUsageStore.monthly, month, channelId, keyIndex),
	}
}

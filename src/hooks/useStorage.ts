import { useCallback, useState } from 'react'
import { StorageKeys, storage } from '@/lib/storage'
import type { PlayListItem, StorageData } from '@/types'

export function usePlaylist() {
  const [playlist, setPlaylist] = useState<PlayListItem[]>(() => storage.get<PlayListItem[]>(StorageKeys.playlist) || [])

  const updatePlaylist = (newPlaylist: PlayListItem[]) => {
    setPlaylist(newPlaylist)
    storage.set(StorageKeys.playlist, newPlaylist)
  }

  const clearPlaylist = () => {
    setPlaylist([])
    storage.set(StorageKeys.playlist, [])
  }

  return { playlist, setPlaylist: updatePlaylist, clearPlaylist }
}

export function useHistory() {
  const [history, setHistory] = useState<StorageData[]>(() => storage.get<StorageData[]>(StorageKeys.history) || [])

  const addHistory = useCallback((url: string, name?: string) => {
    if (!url) return
    setHistory((prev) => {
      const list = prev.filter((i) => i.url !== url).slice(0, 199)
      list.unshift({ url, time: Date.now(), name })
      storage.set(StorageKeys.history, list)
      return list
    })
  }, [])

  const removeHistory = useCallback((index: number) => {
    setHistory((prev) => {
      const newHistory = [...prev]
      newHistory.splice(index, 1)
      storage.set(StorageKeys.history, newHistory)
      return newHistory
    })
  }, [])

  const clearHistory = useCallback(() => {
    setHistory([])
    storage.remove(StorageKeys.history)
  }, [])

  const refreshHistory = useCallback(() => {
    setHistory(storage.get<StorageData[]>(StorageKeys.history) || [])
  }, [])

  const updateHistoryName = useCallback((index: number, name: string) => {
    setHistory((prev) => {
      const newHistory = [...prev]
      if (newHistory[index]) {
        newHistory[index] = { ...newHistory[index], name }
        storage.set(StorageKeys.history, newHistory)
      }
      return newHistory
    })
  }, [])

  return { history, addHistory, removeHistory, clearHistory, refreshHistory, updateHistoryName }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<StorageData[]>(() => storage.get<StorageData[]>(StorageKeys.fav) || [])

  const addFavorite = useCallback((url: string, name?: string) => {
    if (!url) return false
    let added = false
    setFavorites((prev) => {
      if (prev.find((i) => i.url === url)) {
        added = false
        return prev
      }
      const newFavorites = [{ url, time: Date.now(), name }, ...prev]
      storage.set(StorageKeys.fav, newFavorites)
      added = true
      return newFavorites
    })
    return added
  }, [])

  const removeFavorite = useCallback((index: number) => {
    setFavorites((prev) => {
      const newFavorites = [...prev]
      newFavorites.splice(index, 1)
      storage.set(StorageKeys.fav, newFavorites)
      return newFavorites
    })
  }, [])

  const clearFavorites = useCallback(() => {
    setFavorites([])
    storage.remove(StorageKeys.fav)
  }, [])

  const isFavorite = useCallback(
    (url: string) => {
      return favorites.some((i) => i.url === url)
    },
    [favorites],
  )

  const refreshFavorites = useCallback(() => {
    setFavorites(storage.get<StorageData[]>(StorageKeys.fav) || [])
  }, [])

  const updateFavoriteName = useCallback((index: number, name: string) => {
    setFavorites((prev) => {
      const newFavorites = [...prev]
      if (newFavorites[index]) {
        newFavorites[index] = { ...newFavorites[index], name }
        storage.set(StorageKeys.fav, newFavorites)
      }
      return newFavorites
    })
  }, [])

  return { favorites, addFavorite, removeFavorite, clearFavorites, isFavorite, refreshFavorites, updateFavoriteName }
}

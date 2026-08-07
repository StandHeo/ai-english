import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/** 系统返回键 / 侧滑返回：优先路由回退，首页再退出。 */
export function useAndroidBackNavigation() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let removed = false
    let handle: { remove: () => Promise<void> } | undefined

    void CapApp.addListener('backButton', () => {
      const path = location.pathname
      if (path === '/' || path === '') {
        void CapApp.exitApp()
        return
      }
      // 明确父子路由，避免 history 为空时直接退出
      if (path.startsWith('/family/studio/settings')) {
        navigate('/family/studio')
        return
      }
      if (path === '/family/studio') {
        navigate('/parent')
        return
      }
      if (/^\/family\/[^/]+\/play$/.test(path)) {
        navigate('/family')
        return
      }
      if (path === '/family') {
        navigate('/')
        return
      }
      if (path.startsWith('/level/')) {
        navigate(-1)
        return
      }
      if (path.startsWith('/map/')) {
        navigate('/')
        return
      }
      if (path === '/parent' || path === '/stickers') {
        navigate('/')
        return
      }
      if (window.history.length > 1) {
        navigate(-1)
      } else {
        navigate('/')
      }
    }).then((h) => {
      if (removed) {
        void h.remove()
      } else {
        handle = h
      }
    })

    return () => {
      removed = true
      void handle?.remove()
    }
  }, [location.pathname, navigate])
}

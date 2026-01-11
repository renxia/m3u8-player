import type { AlertOptions } from '@/types'

export const dialog = {
  toast(msg: string, options?: AlertOptions) {
    return window.h5Utils?.toast(msg, options)
  },
  alert(msg: string, options?: AlertOptions) {
    return window.h5Utils?.alert(msg, options)
  },
  confirm(msg: string, options?: AlertOptions) {
    options = {
      ...options,
      showConfirmButton: true,
      showCancelButton: true,
    }
    return window.h5Utils?.alert(msg, options)
  },
}

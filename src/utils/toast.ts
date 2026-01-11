import type { AlertOptions } from '@/types'

export function toast(msg: string, options?: AlertOptions) {
  return window.h5Utils?.toast(msg, options)
}

export function alert(msg: string, options?: AlertOptions) {
  return window.h5Utils?.alert(msg, options)
}

export function confirm(msg: string, options?: AlertOptions) {
  options = {
    ...options,
    showConfirmButton: true,
    showCancelButton: true,
  }
  return window.h5Utils?.alert(msg, options)
}

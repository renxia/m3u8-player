import { Logger } from '@lzwme/fe-utils/cjs/common/lib/Logger'

const IS_DEV = import.meta.env.DEV

export const logger = new Logger('[M3U8Player]', { levelType: IS_DEV ? 'debug' : 'warn' })

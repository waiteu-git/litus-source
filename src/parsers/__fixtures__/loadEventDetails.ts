import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (name: string) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf-8')

/** 実採取（2026-07-12・pi読取専用）した掲示詳細モーダル本文。休講&補講/補講/教室変更。 */
export const DETAIL_CANCEL_MAKEUP = read('bulletin-detail-cancel-makeup.html')
export const DETAIL_MAKEUP = read('bulletin-detail-makeup.html')
export const DETAIL_ROOMCHANGE = read('bulletin-detail-roomchange.html')

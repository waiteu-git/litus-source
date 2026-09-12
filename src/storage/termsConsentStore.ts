import { Storage } from './asyncStorage'
import { deserializeTermsConsent, serializeTermsConsent } from './termsConsentSerialize'

const KEY = 'terms.accepted.v1'

export async function saveTermsConsent(version: number): Promise<void> {
  await Storage.setItem(KEY, serializeTermsConsent(version))
}

/**
 * 同意済みの規約版。**読めない時は 0（未同意）を返す**＝規約画面を出す側に倒す（設計 PC）。
 * 投げると LoginGate の起動処理の catch が 'checking' へ進み、規約画面を飛ばして probe が立つ
 * （同意の前に CLASS と大学のログイン基盤へ通信する）。
 */
export async function loadAcceptedTermsVersion(): Promise<number> {
  try {
    return deserializeTermsConsent(await Storage.getItem(KEY))
  } catch {
    return 0
  }
}

import { Storage } from './asyncStorage'
import { deserializeTermsConsent, serializeTermsConsent } from './termsConsentSerialize'

const KEY = 'terms.accepted.v1'

export async function saveTermsConsent(version: number): Promise<void> {
  await Storage.setItem(KEY, serializeTermsConsent(version))
}

export async function loadAcceptedTermsVersion(): Promise<number> {
  return deserializeTermsConsent(await Storage.getItem(KEY))
}

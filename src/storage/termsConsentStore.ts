import AsyncStorage from '@react-native-async-storage/async-storage'
import { deserializeTermsConsent, serializeTermsConsent } from './termsConsentSerialize'

const KEY = 'terms.accepted.v1'

export async function saveTermsConsent(version: number): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeTermsConsent(version))
}

export async function loadAcceptedTermsVersion(): Promise<number> {
  return deserializeTermsConsent(await AsyncStorage.getItem(KEY))
}

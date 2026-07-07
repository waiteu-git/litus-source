import AsyncStorage from '@react-native-async-storage/async-storage'
import { deserializeOnboardingDone, serializeOnboardingDone } from './onboardingSerialize'

const KEY = 'onboarding.done.v1'

export async function saveOnboardingDone(): Promise<void> {
  await AsyncStorage.setItem(KEY, serializeOnboardingDone(true))
}

export async function loadOnboardingDone(): Promise<boolean> {
  return deserializeOnboardingDone(await AsyncStorage.getItem(KEY))
}

import { Storage } from './asyncStorage'
import { deserializeOnboardingDone, serializeOnboardingDone } from './onboardingSerialize'

const KEY = 'onboarding.done.v1'

export async function saveOnboardingDone(): Promise<void> {
  await Storage.setItem(KEY, serializeOnboardingDone(true))
}

export async function loadOnboardingDone(): Promise<boolean> {
  return deserializeOnboardingDone(await Storage.getItem(KEY))
}

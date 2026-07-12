/**
 * 課題アクティビティの「所有権」をURLから導出する純粋ヘルパー。
 * 収集器(AssignmentCollector)は isTargetActivityUrl(url,'standard') に該当するURLのみ
 * 訪問・上書きする。それ以外(resource/PDF・forum等)と manual:// はユーザーが締切・提出状態を
 * 手動所有し、収集は触れない。2集合は排他なのでマージ衝突が原理的に発生しない。
 */
import { isTargetActivityUrl } from '../parsers/letusLinks'
import { isManualUrl } from './manualAssignment'

/** 収集器が訪問し締切・提出状態を上書きするURLか。 */
export function isCollectedAssignmentUrl(url: string): boolean {
  if (isManualUrl(url)) return false
  return isTargetActivityUrl(url, 'standard')
}

/** 締切・提出状態をユーザーが手動所有するURLか（manual:// または収集対象外）。 */
export function isUserManagedUrl(url: string): boolean {
  return isManualUrl(url) || !isCollectedAssignmentUrl(url)
}

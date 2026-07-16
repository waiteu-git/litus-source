import { useCallback } from 'react'
import { Alert } from 'react-native'
import { useSync } from './SyncProvider'

/**
 * ホームからのフル同期（掲示→課題）を起動する。授業中・出席タブ非表示でCLASS（掲示）同期が
 * 保留された場合は確認ダイアログを出し、「同期する」でだけ override 実行する。
 * 課題(LETUS)は runFullSync 内で従来通り実行される（確認は掲示部だけに掛かる）。
 */
export function useClassSyncConfirm(): () => void {
  const sync = useSync()
  return useCallback(() => {
    const result = sync.runFullSync({ source: 'user' })
    if (result !== 'confirm-attending') return
    Alert.alert(
      '授業中です',
      '出席の自動確認が一時的に止まりますが、CLASSの同期をしますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '同期する',
          // 課題は既に走っているので、ここは掲示(CLASS)だけを override で回す（連鎖なし）。
          onPress: () => sync.runBulletinSync({ source: 'user', overrideAttending: true }),
        },
      ],
    )
  }, [sync])
}

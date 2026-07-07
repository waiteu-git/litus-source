import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ActionButton } from '../ui/screen'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import AssignmentCollector from '../collect/AssignmentCollector'
import type { AssignmentsStackParamList } from '../navigation/types'

/** 手動の課題収集画面。収集本体は AssignmentCollector（headless）に委譲し、ここは進捗表示のみ。 */
export default function CollectAssignmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AssignmentsStackParamList>>()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ checked: number; saved: number } | null>(null)
  const [aborted, setAborted] = useState(false)
  const done = result !== null || aborted

  return (
    <View style={styles.root}>
      {!done ? (
        <AssignmentCollector
          onProgress={(d, t) => setProgress({ done: d, total: t })}
          onFinished={setResult}
        />
      ) : null}
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.heading}>
          {result
            ? `完了（${result.checked}件確認・${result.saved}件保存）`
            : aborted
              ? '中断しました'
              : progress
                ? `収集中… ${progress.done}/${progress.total}`
                : '候補を読み込み中…'}
        </Text>
        {result && result.checked === 0 ? (
          <Text style={styles.info}>
            課題候補がありません。先に時間割タブで「コース収集」→「更新チェック」を実行してください。
          </Text>
        ) : null}
        {done ? <ActionButton label="課題一覧へ戻る" onPress={() => navigation.goBack()} /> : null}
      </ScrollView>
      {done ? null : <ActionButton label="中断" onPress={() => setAborted(true)} />}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16 },
  heading: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  info: { color: '#666', marginBottom: 12 },
})

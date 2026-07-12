import { useState } from 'react'
import { LinearGradient } from 'expo-linear-gradient'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ActionButton, StepList, useUi, type Step } from '../ui/screen'
import AssignmentCollector from '../collect/AssignmentCollector'
import type { AssignmentsStackParamList } from '../navigation/types'

/**
 * 手動の課題収集画面。収集本体は AssignmentCollector（headless）に委譲し、ここは進捗表示のみ。
 * Turn3で確定したステップ・タイムライン型（3b）で可視化する。
 */
export default function CollectAssignmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AssignmentsStackParamList>>()
  const ui = useUi()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ checked: number; saved: number } | null>(null)
  const [aborted, setAborted] = useState(false)
  const done = result !== null || aborted

  const steps: Step[] = [
    { label: '課題候補を読み込み中', state: progress || done ? 'done' : 'active' },
    {
      label: '各課題を確認',
      sub: aborted
        ? '中断しました'
        : progress && !done
          ? `${progress.done}/${progress.total} 件`
          : result
            ? `${result.checked} 件確認`
            : undefined,
      state: aborted ? 'error' : done ? 'done' : progress ? 'active' : 'pending',
    },
    {
      label: '保存',
      sub: result ? `${result.saved} 件保存` : undefined,
      state: aborted ? 'error' : result ? 'done' : 'pending',
    },
  ]

  return (
    <View style={styles.root}>
      {ui.colors.gradient ? (
        <LinearGradient colors={ui.colors.gradient} style={StyleSheet.absoluteFill} />
      ) : null}
      {!done ? <AssignmentCollector onProgress={(d, t) => setProgress({ done: d, total: t })} onFinished={setResult} /> : null}
      <ScrollView contentContainerStyle={styles.body}>
        <View style={[ui.card, styles.card]}>
          <StepList steps={steps} />
        </View>
        {result && result.checked === 0 ? (
          <View style={[ui.card, { marginTop: 12 }]}>
            <Text style={{ color: ui.valueColor, fontSize: 13, lineHeight: 20 }}>
              課題候補がありません。先に時間割タブで「コース収集」→「更新チェック」を実行してください。
            </Text>
          </View>
        ) : null}
        <View style={styles.actions}>
          {done ? (
            <ActionButton label="課題一覧へ戻る" onPress={() => navigation.goBack()} />
          ) : (
            <ActionButton label="中断" ghost onPress={() => setAborted(true)} />
          )}
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 16, flexGrow: 1 },
  card: { paddingVertical: 18 },
  actions: { marginTop: 16, gap: 9 },
})

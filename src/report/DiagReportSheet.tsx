import { useEffect, useMemo, useState } from 'react'
import { Alert, Clipboard, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text } from '../ui/Text'
import { useUi } from '../ui/screen'
import { COLORS } from '../theme'
import type { SubmitDiag } from '../attendance/submitDiag'
import { loadSubmitDiags } from '../storage/submitDiagStore'
import { collectDiagEnv } from './diagEnv'
import { DIAG_REPORT_TO, buildDiagReportBody, buildDiagReportSubject, buildMailtoUrl } from './diagReport'

/**
 * 不具合報告の下書きを**全画面で見せてから**送る。
 *
 * 設計の要点（2026-07-30確定）:
 * - **アプリからは送らない**。`mailto:` の下書きを開くだけで、送信はユーザーがメールアプリで行う。
 *   規約は通信先を限定列挙しており、直接送信は新しい送信先の追加＝規約改定になる。
 * - **PIIの基準は「見せてから送る」**＝送る本文をそのまま全画面で出す。だから
 *   **省略も折りたたみもしない**（`formatSubmitDiag` の出力には科目名や `okBy` の前後40字が残る）。
 *   マスク基準を議論で網羅するより、ユーザーが読めることの方が確実。
 * - **「メールで送る」と「本文をコピー」を必ず両方出す**。`mailto:` は本文が長いと端末側で
 *   黙って切られることがあり、切れたかどうかは誰にも見えない。コピーはその唯一の逃げ道。
 */
export default function DiagReportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const ui = useUi()
  const insets = useSafeAreaInsets()
  const [diags, setDiags] = useState<SubmitDiag[] | null>(null)

  // 開いた時に読む（設定画面の「出席送信の記録」と同じ扱い＝常時メモリに載せない）。
  useEffect(() => {
    if (!visible) return
    let alive = true
    loadSubmitDiags()
      .catch(() => [])
      .then((list) => {
        if (alive) setDiags(list)
      })
    return () => {
      alive = false
    }
  }, [visible])

  const draft = useMemo(() => {
    if (diags == null) return null
    const env = collectDiagEnv()
    const subject = buildDiagReportSubject(env)
    const body = buildDiagReportBody({ diags, env, nowIso: new Date().toISOString() })
    const url = buildMailtoUrl({ to: DIAG_REPORT_TO, subject, body })
    return { subject, body, url }
  }, [diags])

  const onCopy = () => {
    if (!draft) return
    // ⚠`Clipboard` は react-native の型で @deprecated（将来コアから外れる）。RN 0.86 時点では
    // iOS/Android どちらもネイティブ実装が既定で登録されているが、**型だけ残って実装が消える**
    // 事故（expo-constants の版取得API）を踏んでいるので、失敗しても黙って落とさない。
    // 実装の在処は `clipboardAvailability.test.ts` が機械的に見張る。
    try {
      Clipboard.setString(draft.body)
      Alert.alert('コピーしました', `メールやDMに貼り付けて ${DIAG_REPORT_TO} へお送りください。`)
    } catch {
      Alert.alert(
        'コピーできませんでした',
        `本文を長押しして選択し、手でコピーしてから ${DIAG_REPORT_TO} へお送りください。`,
      )
    }
  }

  const onMail = () => {
    if (!draft) return
    Linking.openURL(draft.url).catch(() => {
      // メールアプリが無い端末では openURL が失敗する。そこで詰ませず、コピーへ逃がす。
      Alert.alert(
        'メールアプリを開けませんでした',
        `「本文をコピー」で本文を写して、${DIAG_REPORT_TO} へお送りください。`,
      )
    })
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {/* 全画面（シートではない）。本文を最後まで読んでから送る導線なので、
          高さを削って本文を隠さない。 */}
      <View
        style={[
          styles.root,
          {
            backgroundColor: ui.colors.screenSolid,
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 12,
          },
        ]}
      >
        <View style={styles.headRow}>
          <Text style={[styles.headTitle, { color: ui.heading }]}>不具合を開発者に送る</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={[styles.close, { color: ui.labelColor }]}>閉じる</Text>
          </Pressable>
        </View>

        <Text style={[styles.lead, { color: ui.labelColor }]}>
          {`下の本文を ${DIAG_REPORT_TO} へお送りください。アプリが勝手に送ることはありません（送信はご自身のメールアプリなどで行います）。学籍番号・氏名・メールアドレスは含めていません。`}
        </Text>

        <View style={[styles.notice, { backgroundColor: ui.colors.softBoxBg }]}>
          <Ionicons name="information-circle-outline" size={16} color={ui.labelColor} />
          {/* ⚠常に出す。条件分岐にしていた頃の判定は実測で意味を失った＝**記録1件でも**
              mailto URL は 2,917 文字（日本語のパーセントエンコードで約3倍に膨らむ）で、
              10件なら 15,688 文字。「長い時だけ警告」は100%出るので警告として機能しない。
              ⇒ コピーを主動線にし、切れうることは常に書く。 */}
          <Text style={[styles.noticeText, { color: ui.labelColor }]}>
            {'「本文をコピー」→ メールやDMに貼り付けるのが確実です。「メールで送る」は宛先と件名が入りますが、本文が長いためメールアプリ側で途中までしか入らないことがあります。'}
          </Text>
        </View>

        <ScrollView
          style={[styles.bodyBox, { backgroundColor: ui.inputBg, borderColor: ui.inputBorder }]}
          contentContainerStyle={styles.bodyContent}
        >
          {/* selectable: 一部だけ消したい人が手で選べるようにする。表示は省略しない。 */}
          <Text selectable style={[styles.body, { color: ui.valueColor }]}>
            {draft ? draft.body : '読み込んでいます…'}
          </Text>
        </ScrollView>

        <Text style={[styles.meta, { color: ui.labelColor }]}>
          本文 {draft ? draft.body.length : 0} 文字 / 記録 {diags?.length ?? 0} 件
        </Text>

        {/* コピーが主動線。**コピーだけが長さで壊れない**（上の実測を参照）。 */}
        <Pressable
          style={[styles.cta, { backgroundColor: COLORS.cta }, !draft && styles.ctaBusy]}
          disabled={!draft}
          onPress={onCopy}
        >
          <Text style={styles.ctaText}>本文をコピー</Text>
        </Pressable>
        <Pressable
          style={[styles.ghost, { backgroundColor: ui.inputBg, borderColor: ui.inputBorder }, !draft && styles.ctaBusy]}
          disabled={!draft}
          onPress={onMail}
        >
          <Text style={[styles.ghostText, { color: ui.dark ? COLORS.emeraldLight : COLORS.emeraldDark }]}>
            メールで送る
          </Text>
        </Pressable>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headTitle: { fontSize: 17, fontWeight: '700' },
  close: { fontSize: 14, fontWeight: '600' },
  lead: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 12, padding: 10, marginBottom: 10 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  bodyBox: { flex: 1, borderWidth: 1, borderRadius: 14 },
  bodyContent: { padding: 12 },
  body: { fontSize: 11, lineHeight: 17 },
  meta: { fontSize: 11, marginTop: 8, marginBottom: 10, textAlign: 'right' },
  cta: { borderRadius: 16, paddingVertical: 13, alignItems: 'center' },
  ctaBusy: { opacity: 0.6 },
  ctaText: { color: COLORS.white, fontSize: 15, fontWeight: '600' },
  ghost: { borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, marginTop: 8 },
  ghostText: { fontSize: 14, fontWeight: '600' },
})

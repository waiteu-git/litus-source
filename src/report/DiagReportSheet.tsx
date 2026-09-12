import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Alert, Clipboard, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, TextInput } from '../ui/Text'
import { useUi } from '../ui/screen'
import { useKeyboardHeight } from '../ui/useKeyboardHeight'
import { COLORS } from '../theme'
import type { SubmitDiag } from '../attendance/submitDiag'
import { loadSubmitDiags } from '../storage/submitDiagStore'
import { collectDiagEnv } from './diagEnv'
import { collectNotifDiagLine } from './notifDiagLine'
import {
  DIAG_REPORT_TO,
  buildDiagReportBody,
  buildDiagReportSubject,
  buildMailtoUrl,
  diagNotePlaceholder,
  mailtoMayTruncate,
  type DiagReportSource,
} from './diagReport'

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
 *
 * 2026-08-10の変更:
 * - **状況を書く場所をここに置いた**。書く作業は前から求めていたが、それが起きる場所が
 *   メールアプリの中だった＝長い日本語本文の途中・スマホのキーボード・カーソル位置は
 *   メールアプリ任せ。入力欄をシートに置き、書いた内容を `buildDiagReportBody` へ渡す。
 * - **主動線は入口ではなくエンコード後の実長で決める**（`mailtoMayTruncate`）。
 *   長く書かれた本文は端末側で黙って切られるが、**警告は出さない**
 *   （100%出る警告は警告として機能しない＝2026-07-30の裁定）。代わりに、
 *   超えた時だけ「本文をコピー」を主動線へ入れ替える。ボタンは常に両方出す。
 */
export default function DiagReportSheet({
  visible,
  onClose,
  source = 'attendance',
}: {
  visible: boolean
  onClose: () => void
  /** 入口。`settings` は記録を載せず「メールで送る」を主動線にする。既定は安全側の `attendance`。 */
  source?: DiagReportSource
}) {
  const ui = useUi()
  const insets = useSafeAreaInsets()
  const kbHeight = useKeyboardHeight()
  const [diags, setDiags] = useState<SubmitDiag[] | null>(null)
  const [note, setNote] = useState('')
  // 通知の計器の1行（N1 §4.6）。開いた時に1回読む。送らなければ端末の外に出ない。
  const [notifLine, setNotifLine] = useState<string | null>(null)
  // 設定から開いた時は記録を本文に載せないので、そもそも読みに行かない。
  const withDiags = source !== 'settings'
  // 打鍵ごとに本文（記録10件なら約5,000字）を組み直して再描画すると入力が引っかかる。
  // 入力は即時・下の本文は少し遅れて追いつく。
  const deferredNote = useDeferredValue(note)

  // 開いた時に読む（設定画面の「出席送信の記録」と同じ扱い＝常時メモリに載せない）。
  useEffect(() => {
    if (!visible) return
    // ⚠開くたびに入力を空へ戻す。**前の報告に書いた文が次の報告に黙って同乗する**のを防ぐ
    // （閉じる時ではなく開く時に消すのは、閉じるアニメーション中に文字が消えて見えないため）。
    // 永続化はしない＝閉じたら消えてよい（ストレージ面を増やさない）。
    setNote('')
    if (!withDiags) {
      setDiags([])
      return
    }
    let alive = true
    loadSubmitDiags()
      .catch(() => [])
      .then((list) => {
        if (alive) setDiags(list)
      })
    return () => {
      alive = false
    }
  }, [visible, withDiags])

  useEffect(() => {
    if (!visible) return
    let alive = true
    setNotifLine(null)
    collectNotifDiagLine()
      .then((line) => {
        if (alive) setNotifLine(line)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [visible])

  const draft = useMemo(() => {
    if (diags == null) return null
    const env = collectDiagEnv()
    const subject = buildDiagReportSubject(env)
    const body = buildDiagReportBody({ diags, env, nowIso: new Date().toISOString(), source, note: deferredNote, notifLine })
    const url = buildMailtoUrl({ to: DIAG_REPORT_TO, subject, body })
    return { subject, body, url }
  }, [diags, deferredNote, source, notifLine])

  /**
   * **コピーを主動線にするか**。入口ではなく**エンコード後の実長**で決める。
   * 記録を載せる入口は1件でも目安を超える＝実質コピー固定。設定側は既定で収まるので
   * 「メールで送る」が主動線で、**長く書かれた時だけ**入れ替わる。
   * 読み込み中は入口の性質で仮置きし、下の案内文もこの1つの信号に従わせる
   * （案内とボタンの主従がズレると、案内が嘘になる）。
   */
  const copyPrimary = draft ? mailtoMayTruncate(draft.url) : withDiags

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
            // ⚠下の安全余白の要否はキーボード表示中だけプラットフォームで逆になる（実機で確認）。
            // iOS: キーボードがホームインジケータごと覆う＝余白を足すと**何も無い帯**が残る（不要）。
            // Android: `keyboardDidShow` の高さにナビゲーションバーが**入っていない**＝余白を外すと
            //          持ち上げ量が足りず、下のボタンがキーボードに数px食われる（必要）。
            paddingBottom: (kbHeight > 0 && Platform.OS === 'ios' ? 0 : insets.bottom) + 12,
            // Android の RN Modal は Dialog ウィンドウで activity の adjustResize が効かず、
            // iOS はそもそも window が縮まない＝どちらもキーボードが下のボタンに被さる。
            // 器ごと持ち上げて、入力中でもボタンが指の届く位置に残るようにする。
            marginBottom: kbHeight,
          },
        ]}
      >
        <View style={styles.headRow}>
          <Text style={[styles.headTitle, { color: ui.heading }]}>不具合を開発者に送る</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={[styles.close, { color: ui.labelColor }]}>閉じる</Text>
          </Pressable>
        </View>

        {/* 入力欄と本文を1つの器でスクロールさせる（入れ子スクロールを作らない）。
            キーボードが出ると器は `marginBottom` の分だけ縮むので、はみ出した分はここで送れる。
            - keyboardShouldPersistTaps: 表示中の最初のタップが dismiss に食われず1タップで押せる。
            - automaticallyAdjustKeyboardInsets: iOS 用（Android では無視される）。
            `src/ui/keyboardEscapeGuard.ts` のラチェットが3点そろっているかを機械的に見張る。 */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Text style={[styles.lead, { color: ui.labelColor }]}>
            {`下の本文を ${DIAG_REPORT_TO} へお送りください。アプリが勝手に送ることはありません（送信はご自身のメールアプリなどで行います）。学籍番号・氏名・メールアドレスは含めていません。`}
          </Text>

          <View style={[styles.notice, { backgroundColor: ui.colors.softBoxBg }]}>
            <Ionicons name="information-circle-outline" size={16} color={ui.labelColor} />
            {/* ⚠**警告ではなく事実**。「長い時だけ警告」は記録を載せる入口では100%出るので
                警告として機能しない（2026-07-30の裁定）。案内はボタンの主従と同じ信号で切り替え、
                いま主動線になっている方の押し方を書く。 */}
            <Text style={[styles.noticeText, { color: ui.labelColor }]}>
              {copyPrimary
                ? '「本文をコピー」→ メールやDMに貼り付けるのが確実です。「メールで送る」は宛先と件名が入りますが、本文が長いためメールアプリ側で途中までしか入らないことがあります。'
                : '「メールで送る」を押すと、宛先・件名・本文が入った状態でメールアプリが開きます。送信ボタンを押すだけです。'}
            </Text>
          </View>

          {/* **書く場所をここに置く**。ここに書いた文字がそのまま下の「■ 状況」に入る＝
              書いたものと送るものが同じ画面で並ぶ。 */}
          <Text style={[styles.label, { color: ui.labelColor }]}>何が起きましたか？</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: ui.inputBg, borderColor: ui.inputBorder, color: ui.valueColor },
            ]}
            value={note}
            onChangeText={setNote}
            placeholder={diagNotePlaceholder(source)}
            placeholderTextColor={ui.subMuted}
            multiline
            textAlignVertical="top"
          />
          {/* 添付はメールアプリ側の操作なので、**入力中に消えるプレースホルダには置かない**
              （書き終えた後に必要になる案内）。本文にも載せない＝mailto の尺を食わせない。 */}
          <Text style={[styles.hint, { color: ui.labelColor }]}>
            不具合の画面のスクリーンショットを添付していただけると、原因がすぐ分かります。
          </Text>

          <Text style={[styles.label, { color: ui.labelColor }]}>送る本文</Text>
          <View style={[styles.bodyBox, { backgroundColor: ui.inputBg, borderColor: ui.inputBorder }]}>
            {/* selectable: 一部だけ消したい人が手で選べるようにする。表示は省略しない。 */}
            <Text selectable style={[styles.body, { color: ui.valueColor }]}>
              {draft ? draft.body : '読み込んでいます…'}
            </Text>
          </View>

          <Text style={[styles.meta, { color: ui.labelColor }]}>
            {withDiags
              ? `本文 ${draft ? draft.body.length : 0} 文字 / 記録 ${diags?.length ?? 0} 件`
              : `本文 ${draft ? draft.body.length : 0} 文字`}
          </Text>
        </ScrollView>

        {/* 主動線は**エンコード後の実長**で変わる（`copyPrimary`）。目安を超えた本文は端末側で
            黙って切られうるのでコピーが主動線、収まるなら「メールで送る」＝タップ→メールアプリが
            宛先・件名・本文入りで開く→送信ボタンだけ、まで縮む。
            **どちらでも両方のボタンは必ず出す**（メールアプリが無い端末の逃げ道がコピー）。 */}
        {copyPrimary ? (
          <>
            <Pressable
              style={[styles.cta, { backgroundColor: COLORS.cta }, !draft && styles.ctaBusy]}
              disabled={!draft}
              onPress={onCopy}
            >
              <Text style={styles.ctaText}>本文をコピー</Text>
            </Pressable>
            <Pressable
              style={[
                styles.ghost,
                { backgroundColor: ui.inputBg, borderColor: ui.inputBorder },
                !draft && styles.ctaBusy,
              ]}
              disabled={!draft}
              onPress={onMail}
            >
              <Text style={[styles.ghostText, { color: ui.dark ? COLORS.emeraldLight : COLORS.emeraldDark }]}>
                メールで送る
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={[styles.cta, { backgroundColor: COLORS.cta }, !draft && styles.ctaBusy]}
              disabled={!draft}
              onPress={onMail}
            >
              <Text style={styles.ctaText}>メールで送る</Text>
            </Pressable>
            <Pressable
              style={[
                styles.ghost,
                { backgroundColor: ui.inputBg, borderColor: ui.inputBorder },
                !draft && styles.ctaBusy,
              ]}
              disabled={!draft}
              onPress={onCopy}
            >
              <Text style={[styles.ghostText, { color: ui.dark ? COLORS.emeraldLight : COLORS.emeraldDark }]}>
                本文をコピー
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headTitle: { fontSize: 17, fontWeight: '700' },
  close: { fontSize: 14, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 4 },
  lead: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 12, padding: 10, marginBottom: 12 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  // 4行ぶん。短すぎると「一言でいい」と読まれ、長すぎると空欄の圧が出る。
  input: { minHeight: 96, borderWidth: 1, borderRadius: 14, padding: 12, fontSize: 14, lineHeight: 21 },
  hint: { fontSize: 11, lineHeight: 17, marginTop: 6, marginBottom: 14 },
  bodyBox: { borderWidth: 1, borderRadius: 14, padding: 12 },
  body: { fontSize: 11, lineHeight: 17 },
  meta: { fontSize: 11, marginTop: 8, marginBottom: 10, textAlign: 'right' },
  cta: { borderRadius: 16, paddingVertical: 13, alignItems: 'center' },
  ctaBusy: { opacity: 0.6 },
  ctaText: { color: COLORS.white, fontSize: 15, fontWeight: '600' },
  ghost: { borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, marginTop: 8 },
  ghostText: { fontSize: 14, fontWeight: '600' },
})

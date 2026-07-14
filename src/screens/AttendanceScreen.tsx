import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Keyboard, Pressable, StyleSheet, View, type TextInput as RNTextInput } from 'react-native'
import { Text, TextInput } from '../ui/Text'
import { useIsFocused } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenBg, CountdownRing, IndeterminateBar, useUi, useTabBarClearance } from '../ui/screen'
import KillSwitchBanner from '../ui/KillSwitchBanner'
import { countdownClock, countdownFraction } from '../attendance/countdown'
import { normalizeAttendanceCode } from '../attendance/normalizeCode'
import { REACTION_MAX_LEN, canSubmitReaction, reactionDraftApplies, reactionLength } from '../attendance/reactionPaper'
import { todayKey } from '../attendance/attendedState'
import { loadReactionDraft, saveReactionDraft } from '../storage/reactionDraftStore'
import { useAttendanceEngine, useAttendanceNow } from '../attendance/AttendanceEngineProvider'
import { COLORS } from '../theme'

/**
 * 出席画面。CLASS WebView・受付判定エンジンは AttendanceEngineProvider（アプリ根で常時保持）に
 * あり、本画面はその状態を読むだけの薄いUI。フォーカス状態だけエンジンへ通知し、授業時間帯以外は
 * この画面を開いている間だけエンジンを起動させる。
 */
export default function AttendanceScreen() {
  const inputRef = useRef<RNTextInput>(null)
  const ui = useUi()
  const dark = ui.dark
  const clearance = useTabBarClearance()
  const isFocused = useIsFocused()
  const engine = useAttendanceEngine()
  const {
    phase,
    reception,
    result,
    attended,
    attendedNow,
    conflict,
    conflictExhausted,
    code,
    setCode,
    submit,
    retry,
    reactionSubmit,
    submitReaction,
    failCount,
    revealClass,
    setRevealClass,
    setAttendanceFocused,
  } = engine
  // カウントダウン描画用の秒精度クロック（この画面だけが毎秒購読する）。
  const now = useAttendanceNow()
  const closed = reception?.status === 'closed'
  // リアペ必須授業: 出席コードは受理済み・リアクションペーパー未提出（提出して初めて .attendSuc「出席」になる）
  const reactionPending = reception?.status === 'reaction_pending'
  const reactionCourse = reception?.courseName ?? null
  // リアペ本文（アプリ内提出用）。提出確定（出席済み検知）までAsyncStorageに下書き保全し、
  // 失敗・アプリ再起動でも本文を失わない。復元条件（同日＋科目照合）は純粋関数側。
  const [reactionText, setReactionText] = useState('')
  useEffect(() => {
    if (!reactionPending) return
    let alive = true
    loadReactionDraft()
      .then((d) => {
        if (!alive) return
        if (d && reactionDraftApplies(d, todayKey(new Date()), reactionCourse)) setReactionText(d.text)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [reactionPending, reactionCourse])
  const onChangeReactionText = (t: string) => {
    setReactionText(t)
    saveReactionDraft({ date: todayKey(new Date()), courseName: reactionCourse, text: t }).catch(() => undefined)
  }
  const reactionSending = reactionSubmit.status === 'sending'
  const reactionLen = reactionLength(reactionText)
  const reactionOver = reactionLen > REACTION_MAX_LEN
  const confirmReactionSubmit = () => {
    // CLASS側の「提出」に事前確認は無い（onclickが直接PrimeFaces.ab）ため、確認はアプリ側で行う。
    Keyboard.dismiss()
    Alert.alert(
      'リアクションペーパーを提出',
      `${reactionCourse ?? 'この授業'}にこの内容で提出します。よろしいですか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '提出する', onPress: () => submitReaction(reactionText) },
      ],
    )
  }

  // フォーカスをエンジンへ通知（起動ポリシー＋収集への優先権制御）。
  useEffect(() => {
    setAttendanceFocused(isFocused)
    return () => setAttendanceFocused(false)
  }, [isFocused, setAttendanceFocused])

  const c = COLORS

  const updating = phase === 'booting' && reception != null
  const statusLine =
    reception && reception.accepting
      ? `受付中: ${reception.courseName ?? ''}${updating ? '（更新中…）' : ''}`
      : phase === 'ready'
        ? '受付中の授業はありません'
        : phase === 'navFailed'
          ? '受付状況を取得できませんでした'
          : updating
            ? '受付状況を更新しています…'
            : '受付状況を確認しています…'

  // 送信結果の3状態: 成功(ok)/失敗(wrong|err)/検出未確定(送信はした)。未確定は赤ではなく
  // 「確認中」（送信後に .attendSuc を取り直して出席済みへ切り替わる）として中立表示にする。
  const submitFailed = !!result && (result.wrong || result.err)
  const verifying = !!result && !result.ok && !result.wrong && !result.err

  const digits = [0, 1, 2, 3].map((i) => code[i] ?? '')

  const cardStyle = { backgroundColor: ui.colors.cardBg, borderColor: ui.colors.cardBorder, borderWidth: 1 }
  const labelColor = ui.labelColor
  const valueColor = ui.valueColor
  const accepting = !!reception?.accepting

  return (
    <View style={styles.wrap}>
      <ScreenBg>
        <View style={styles.header}>
          <View style={styles.hLeft}>
            <Ionicons name="flash-outline" size={22} color={ui.heading} />
            <Text style={[styles.hTitle, { color: ui.heading }]}>出席</Text>
          </View>
          <Text style={[styles.pill, { backgroundColor: ui.colors.chipBg, color: ui.colors.chipText }]}>
            {conflict
              ? 'PC等で確認中'
              : attendedNow
                ? '出席済み'
                : phase === 'needsLogin'
                  ? 'ログインが必要'
                  : reception
                    ? 'ログイン済み'
                    : '確認中…'}
          </Text>
        </View>

        <KillSwitchBanner feature="attendance" />

        {conflict ? (
          <View style={[styles.card, cardStyle, styles.hero]}>
            <View style={[styles.preIconWrap, { backgroundColor: ui.colors.softBoxBg }]}>
              <Ionicons name="desktop-outline" size={30} color={ui.accent} />
            </View>
            <Text style={[styles.status, styles.statusCenter, { color: valueColor }]}>
              PCなど他の画面でCLASSを開いていると確認できません
            </Text>
            <Text style={[styles.conflictSub, { color: labelColor }]}>
              {conflictExhausted
                ? '他のCLASSを閉じてから「再確認」を押してください。'
                : '他のCLASSを閉じるとこの画面が自動で復帰します。すぐ試すには「再確認」。'}
            </Text>
            <Pressable style={[styles.cta, styles.conflictBtn, { backgroundColor: c.cta }]} onPress={retry}>
              <Text style={styles.ctaText}>再確認</Text>
            </Pressable>
          </View>
        ) : attendedNow ? (
          <View style={[styles.card, cardStyle, styles.hero]}>
            <View style={styles.liveBadgeRow}>
              <Ionicons name="checkmark-circle" size={16} color={ui.colors.success} />
              <Text style={[styles.liveBadgeText, { color: ui.colors.success }]}>出席済み</Text>
            </View>
            <Text style={[styles.heroCourse, { color: valueColor }]} numberOfLines={2}>
              {attended?.courseName || reception?.courseName || '（科目名不明）'}
            </Text>
            <View style={styles.ringWrap}>
              {/* 残り時間の代わりに、満円のリング中央へ「出席」を表示する。 */}
              <CountdownRing centerText="出席" size={176} progress={1} />
            </View>
            {attended?.code ? (
              <>
                <Text style={[styles.doneCodeLabel, styles.doneCodeCenter, { color: labelColor }]}>入力した出席コード</Text>
                <Text style={[styles.doneCode, { color: valueColor }]}>{attended.code}</Text>
              </>
            ) : (
              // コード未保持＝このアプリで送信していない（PC等の他端末で出席）。混乱しないよう明示する。
              <Text style={[styles.doneOther, { color: labelColor }]}>他の端末で出席登録済み</Text>
            )}
          </View>
        ) : reactionPending ? (
          // リアペ待ち: 出席コードは受理済み。本文をアプリ内で書いて提出できる（②フォームへ流し込み）。
          // 提出後は既存の .attendSuc 検知が attended に切り替える。CLASS画面での手動提出も常に併設
          // （actuatorスタブ環境・DOM変化時の逃げ道）。
          <>
            <View style={[styles.card, cardStyle, styles.hero]}>
              <View style={[styles.preIconWrap, { backgroundColor: ui.colors.softBoxBg }]}>
                <Ionicons name="create-outline" size={30} color={ui.accent} />
              </View>
              <Text style={[styles.status, styles.statusCenter, { color: valueColor }]}>
                出席コードは受理されました。リアクションペーパーを提出すると出席になります
              </Text>
              {reception?.courseName || reception?.confirmWindow ? (
                <Text style={[styles.conflictSub, { color: labelColor }]}>
                  {reception?.courseName ?? ''}
                  {reception?.confirmWindow ? `${reception?.courseName ? ' ・ ' : ''}${reception.confirmWindow}` : ''}
                </Text>
              ) : null}
            </View>

            <View style={[styles.card, cardStyle, { marginTop: 12 }]}>
              <Text style={[styles.inputLabel, { color: labelColor }]}>本文（600文字以内・全角は2文字換算）</Text>
              <TextInput
                style={[
                  styles.reactionInput,
                  { backgroundColor: ui.colors.inputBg, borderColor: ui.colors.inputBorder, color: valueColor },
                ]}
                value={reactionText}
                onChangeText={onChangeReactionText}
                editable={!reactionSending}
                multiline
                textAlignVertical="top"
                placeholder="ここに本文を入力（自動で下書き保存されます）"
                placeholderTextColor={labelColor}
              />
              <Text style={[styles.reactionCount, { color: reactionOver ? ui.colors.danger : labelColor }]}>
                {reactionLen}/{REACTION_MAX_LEN}
              </Text>
            </View>

            <Pressable
              style={[
                styles.cta,
                { backgroundColor: c.cta },
                (reactionSending || !canSubmitReaction(reactionText)) && styles.ctaBusy,
              ]}
              disabled={reactionSending || !canSubmitReaction(reactionText)}
              onPress={confirmReactionSubmit}
            >
              {reactionSending ? (
                <View style={styles.ctaBusyRow}>
                  <ActivityIndicator size="small" color={c.white} />
                  <Text style={styles.ctaText}>提出中…</Text>
                </View>
              ) : (
                <Text style={styles.ctaText}>リアクションペーパーを提出</Text>
              )}
            </Pressable>

            {reactionSending ? (
              <View style={[styles.card, cardStyle, styles.verifyCard]}>
                <View style={styles.verifyRow}>
                  <Text style={[styles.verifyText, { color: valueColor }]}>提出しています。出席への反映を確認中…</Text>
                </View>
                <IndeterminateBar
                  color={ui.accent}
                  trackColor={ui.colors.softBoxBg}
                />
              </View>
            ) : reactionSubmit.status === 'failed' ? (
              <View style={[styles.result, { backgroundColor: ui.colors.dangerBg }]}>
                <Text style={[styles.resultText, { color: ui.colors.danger }]}>{reactionSubmit.message}</Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.reactionGhost, { backgroundColor: ui.colors.inputBg, borderColor: ui.colors.inputBorder }]}
              disabled={reactionSending}
              onPress={() => setRevealClass(true)}
            >
              <Text style={[styles.reactionGhostText, { color: dark ? COLORS.emeraldLight : c.emeraldDark }]}>
                CLASSの画面で書く
              </Text>
            </Pressable>
          </>
        ) : closed ? (
          <View style={[styles.card, cardStyle, styles.hero]}>
            <View style={[styles.preIconWrap, { backgroundColor: ui.colors.softBoxBg }]}>
              <Ionicons name="time-outline" size={30} color={ui.accent} />
            </View>
            <Text style={[styles.status, styles.statusCenter, { color: valueColor }]}>この授業の受付は終了しました</Text>
            {reception?.courseName ? (
              <Text style={[styles.conflictSub, { color: labelColor }]}>
                {reception.courseName}
                {reception.confirmWindow ? ` ・ ${reception.confirmWindow}` : ''}
              </Text>
            ) : null}
          </View>
        ) : (
          <>
            <View style={[styles.card, cardStyle, styles.hero]}>
              {accepting ? (
                <>
                  <View style={styles.liveBadgeRow}>
                    <View style={[styles.liveDot, { backgroundColor: ui.pick(COLORS.cta, COLORS.cta, COLORS.emeraldLight) }]} />
                    <Text style={[styles.liveBadgeText, { color: ui.pick(COLORS.cta, COLORS.cta, COLORS.emeraldLight) }]}>受付中</Text>
                  </View>
                  <Text style={[styles.heroCourse, { color: valueColor }]} numberOfLines={2}>
                    {reception?.courseName ?? '（科目名不明）'}
                    {updating ? '（更新中…）' : ''}
                  </Text>
                  <View style={styles.ringWrap}>
                    <CountdownRing
                      centerText={countdownClock(reception?.confirmWindow ?? null, now) ?? reception?.remaining ?? '—'}
                      subText="残り時間"
                      size={176}
                      progress={countdownFraction(reception?.confirmWindow ?? null, now) ?? undefined}
                    />
                  </View>
                  <Text style={[styles.heroWindow, { color: labelColor }]}>
                    出席確認時間 {reception?.confirmWindow ?? '—'}
                  </Text>
                </>
              ) : (
                <>
                  <View style={[styles.preIconWrap, { backgroundColor: ui.colors.softBoxBg }]}>
                    <Ionicons name="time-outline" size={30} color={ui.accent} />
                  </View>
                  <Text style={[styles.status, styles.statusCenter, { color: valueColor }]}>{statusLine}</Text>
                  {phase === 'booting' ? (
                    <View style={styles.statusBarWrap}>
                      <IndeterminateBar
                        color={ui.accent}
                        trackColor={ui.colors.softBoxBg}
                      />
                    </View>
                  ) : null}
                </>
              )}
            </View>

            {phase === 'navFailed' && !revealClass ? (
              <View style={[styles.card, cardStyle, { marginTop: 12 }]}>
                <Text style={[styles.status, { color: valueColor, fontSize: 14, fontWeight: '500' }]}>
                  受付状況を取得できませんでした。「更新」で開き直します。
                </Text>
                <View style={styles.failRow}>
                  <Pressable style={[styles.failBtn, { backgroundColor: c.cta }]} onPress={retry}>
                    <Text style={styles.failBtnText}>更新</Text>
                  </Pressable>
                  {failCount >= 2 ? (
                    <Pressable
                      style={[
                        styles.failBtn,
                        styles.failBtnGhost,
                        { backgroundColor: ui.colors.inputBg, borderColor: ui.colors.inputBorder },
                      ]}
                      onPress={() => setRevealClass(true)}
                    >
                      <Text style={[styles.failBtnText, { color: dark ? COLORS.emeraldLight : c.emeraldDark }]}>CLASSの画面を表示</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={[styles.card, cardStyle, { marginTop: 12 }]}>
              <Text style={[styles.inputLabel, { color: labelColor }]}>認証コード（半角数字）</Text>
              <Pressable style={styles.segRow} onPress={() => inputRef.current?.focus()}>
                {digits.map((d, i) => (
                  <View key={i} style={[styles.seg, { backgroundColor: ui.colors.inputBg, borderColor: ui.colors.inputBorder }]}>
                    <Text style={[styles.segText, { color: valueColor }]}>{d}</Text>
                  </View>
                ))}
              </Pressable>
              <TextInput
                ref={inputRef}
                style={styles.hiddenInput}
                value={code}
                onChangeText={(t) => setCode(normalizeAttendanceCode(t).slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
                autoFocus={false}
              />
            </View>

            <Pressable
              style={[styles.cta, { backgroundColor: c.cta }, phase === 'submitting' && styles.ctaBusy]}
              disabled={phase === 'submitting'}
              onPress={() => {
                // 送信時にキーボードを閉じ、結果メッセージ（成功/失敗）がすぐ見えるようにする。
                Keyboard.dismiss()
                submit()
              }}
            >
              {phase === 'submitting' ? (
                <View style={styles.ctaBusyRow}>
                  <ActivityIndicator size="small" color={c.white} />
                  <Text style={styles.ctaText}>送信中…</Text>
                </View>
              ) : (
                <Text style={styles.ctaText}>出席する</Text>
              )}
            </Pressable>

            {result?.ok ? (
              <View style={[styles.card, cardStyle, styles.doneCard]}>
                <View style={styles.doneCheck}>
                  <Ionicons name="checkmark" size={38} color={c.white} />
                </View>
                <Text style={[styles.doneTitle, { color: valueColor }]}>出席を登録しました</Text>
              </View>
            ) : submitFailed ? (
              <View style={[styles.result, { backgroundColor: ui.colors.dangerBg }]}>
                <Text style={[styles.resultText, { color: ui.colors.danger }]}>{result?.result}</Text>
              </View>
            ) : phase === 'submitting' || verifying ? (
              // 送信タップ〜出席確定までの待機窓。スイープする不定進捗バーで「処理中」を明示する。
              <View style={[styles.card, cardStyle, styles.verifyCard]}>
                <View style={styles.verifyRow}>
                  <Text style={[styles.verifyText, { color: valueColor }]}>
                    {phase === 'submitting' ? '出席を送信しています…' : '送信しました。出席を確認しています…'}
                  </Text>
                </View>
                <IndeterminateBar
                  color={ui.accent}
                  trackColor={ui.colors.softBoxBg}
                />
              </View>
            ) : null}
          </>
        )}
        <View style={{ height: clearance }} />
      </ScreenBg>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  hLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  hTitle: { fontSize: 20, fontWeight: '600' },
  pill: { fontSize: 12, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  card: { borderRadius: 18, padding: 16 },
  hero: { alignItems: 'center', paddingVertical: 20 },
  liveBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.cta },
  liveBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.cta, letterSpacing: 0.5 },
  heroCourse: { fontSize: 17, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8 },
  ringWrap: { marginTop: 14 },
  heroWindow: { fontSize: 12, marginTop: 14, textAlign: 'center' },
  preIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.tint, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  status: { fontSize: 16, fontWeight: '600' },
  statusCenter: { textAlign: 'center' },
  conflictSub: { fontSize: 13, textAlign: 'center', marginTop: 8, paddingHorizontal: 8, lineHeight: 19 },
  statusBarWrap: { alignSelf: 'stretch', marginTop: 16, paddingHorizontal: 4 },
  conflictBtn: { alignSelf: 'stretch' },
  inputLabel: { fontSize: 13, marginBottom: 10 },
  segRow: { flexDirection: 'row', gap: 9 },
  seg: { flex: 1, height: 54, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 24, fontWeight: '600' },
  hiddenInput: { position: 'absolute', opacity: 0, height: 54, left: 16, right: 16, top: 40 },
  cta: { marginTop: 16, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaBusy: { opacity: 0.85 },
  ctaBusyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ctaText: { color: COLORS.white, fontSize: 17, fontWeight: '600' },
  result: { marginTop: 12, borderRadius: 14, padding: 11 },
  resultText: { fontSize: 15, fontWeight: '600' },
  verifyCard: { marginTop: 12, gap: 12 },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  verifyText: { fontSize: 14, fontWeight: '600', flex: 1 },
  doneHero: { alignItems: 'center', paddingVertical: 24 },
  doneCodeLabel: { fontSize: 12, marginTop: 16 },
  doneCode: { fontSize: 40, fontWeight: '700', letterSpacing: 8, marginTop: 4 },
  doneCodeCenter: { textAlign: 'center' },
  doneOther: { fontSize: 13, marginTop: 12 },
  doneCard: { marginTop: 12, alignItems: 'center', paddingVertical: 22 },
  doneCheck: { width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  doneTitle: { fontSize: 18, fontWeight: '700' },
  doneSub: { fontSize: 13, marginTop: 6, textAlign: 'center' },
  reactionInput: { minHeight: 120, borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, lineHeight: 22 },
  reactionCount: { fontSize: 12, textAlign: 'right', marginTop: 6 },
  reactionGhost: { marginTop: 12, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  reactionGhostText: { fontSize: 14, fontWeight: '600' },
  failRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  failBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  failBtnGhost: { borderWidth: 1 },
  failBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '600' },
})

import { useEffect, useRef, useState } from 'react'
import { Alert, Keyboard, Pressable, StyleSheet, View, type TextInput as RNTextInput } from 'react-native'
import { Text, TextInput } from '../ui/Text'
import { useIsFocused } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenBg, CountdownRing, IndeterminateBar, useUi, useTabBarClearance } from '../ui/screen'
import KillSwitchBanner from '../ui/KillSwitchBanner'
import { countdownClock, countdownFraction, countdownRemainingSec } from '../attendance/countdown'
import { normalizeAttendanceCode } from '../attendance/normalizeCode'
import { REACTION_MAX_LEN, canSubmitReaction, reactionDraftApplies, reactionLength } from '../attendance/reactionPaper'
import { todayKey } from '../attendance/attendedState'
import { loadReactionDraft, saveReactionDraft } from '../storage/reactionDraftStore'
import { useAttendanceEngine, useAttendanceNow } from '../attendance/AttendanceEngineProvider'
import { submitOutcome } from '../attendance/submitOutcome'
import ScreenHint from '../tutorial/ScreenHint'
import { PressableRow } from '../ui/Pressable'
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
    refreshAttendance,
    reactionSubmit,
    submitReaction,
    failCount,
    submitAt,
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
  // 学外ネットワーク警告の「再確認」進行状態。次の受付状態更新（reception差し替え）か
  // タイムアウト保険（10秒）で解除する。表示はバー内テキストの差し替えのみ。
  const [netChecking, setNetChecking] = useState(false)
  const netTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const receptionAtCheckRef = useRef(reception)
  function recheckNetwork() {
    // エンジン停止中は再取得できない（偽の「確認中…」を出さない）。競合中は conflict カードの
    // 「再確認」(retry) に委ねる（非出席ページへの検出注入で reception を壊さない）。
    if (netChecking || !engine.running || conflict) return
    setNetChecking(true)
    refreshAttendance()
    if (netTimerRef.current) clearTimeout(netTimerRef.current)
    netTimerRef.current = setTimeout(() => setNetChecking(false), 10000)
  }
  useEffect(() => {
    if (!netChecking) {
      receptionAtCheckRef.current = reception
      return
    }
    // 再確認中に reception が差し替わった＝再検出が届いた合図。確認中表示を解除する。
    if (reception !== receptionAtCheckRef.current) {
      setNetChecking(false)
      if (netTimerRef.current) clearTimeout(netTimerRef.current)
    }
  }, [reception, netChecking])
  useEffect(
    () => () => {
      if (netTimerRef.current) clearTimeout(netTimerRef.current)
    },
    [],
  )

  // 任意提出: リアペ必須でなくても、CLASSに提出ボタンが出ている＝書ける授業では書けるようにする
  // （ユーザー要望 2026-07-17「ボタンがあるなら常に書けるように」）。必須(reactionPending)は
  // 常にフォームを出す。任意はユーザーが「書く」で開いたときだけ出す（普段は邪魔しない）。
  // ※下書き復元effectが showReactionForm を依存に取るため、必ずその前に宣言する（TDZ回避）。
  const reactionAvailable = !!reception?.reactionAvailable
  // 提出済みか。CLASSは「リアクションペーパー確認」→「再提出」で編集を許すので、提出後も導線を残す
  // （ユーザー要望 2026-07-17「提出後もリアペのUIは出席画面に残せるように」）。文言だけ切り替える。
  const reactionSubmitted = !!reception?.reactionSubmitted
  const [reactionOpen, setReactionOpen] = useState(false)
  const showReactionForm = reactionPending || reactionOpen
  // 任意提出の導線は、書ける授業で・まだ開いておらず・提出処理中でないときだけ出す。
  const canOpenReaction = reactionAvailable && !reactionPending && !reactionOpen

  // リアペ本文（アプリ内提出用）。提出確定（出席済み検知）までAsyncStorageに下書き保全し、
  // 失敗・アプリ再起動でも本文を失わない。復元条件（同日＋科目照合）は純粋関数側。
  const [reactionText, setReactionText] = useState('')
  useEffect(() => {
    // 必須(reactionPending)だけでなく任意提出でフォームを開いた時も下書きを復元する。
    if (!showReactionForm) return
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
  }, [showReactionForm, reactionCourse])
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
      reactionSubmitted ? 'リアクションペーパーを再提出' : 'リアクションペーパーを提出',
      reactionSubmitted
        ? `${reactionCourse ?? 'この授業'}の提出済みの内容を、この内容で上書きします。よろしいですか？`
        : `${reactionCourse ?? 'この授業'}にこの内容で提出します。よろしいですか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: reactionSubmitted ? '再提出する' : '提出する', onPress: () => submitReaction(reactionText) },
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

  // 送信結果の判定は submitOutcome に集約（純粋・テスト済み）。
  // 旧実装は「ok/wrong/err のどれでもない＝送信はした」と決め打ちして無期限に「確認中」を出し、
  // 実際には送信できていない場合（ボタン未検出等）にユーザーを永久に待たせていた。
  const outcome = submitOutcome({
    result,
    attended: attendedNow || reception?.status === 'attended',
    elapsedMs: submitAt ? now.getTime() - submitAt : 0,
  })
  const submitFailed = outcome === 'failed'
  const verifying = outcome === 'verifying'

  const digits = [0, 1, 2, 3].map((i) => code[i] ?? '')

  const cardStyle = { backgroundColor: ui.colors.cardBg, borderColor: ui.colors.cardBorder, borderWidth: 1 }
  const labelColor = ui.labelColor
  const valueColor = ui.valueColor
  const accepting = !!reception?.accepting
  // 受付終了までの実カウントダウン（毎秒）。受付中のリングとリアペ必須の督促の両方で使う。
  // **「終了」と「受付時間が不明」を必ず区別する**: countdownClock は終了時も文字列（'受付終了'）を
  // 返すので、これを truthy 判定に使うと「提出の受付終了まで 受付終了」のような文になる。
  // 状態は countdownRemainingSec（null=不明／0以下=終了）で判定し、clock は「残っている時だけ」持つ。
  const remainSec = countdownRemainingSec(reception?.confirmWindow ?? null, now)
  const windowEnded = remainSec != null && remainSec <= 0
  const clock = remainSec != null && remainSec > 0 ? countdownClock(reception?.confirmWindow ?? null, now) : null

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
        <ScreenHint hintKey="attendance" />

        {/* 学外ネットワーク警告: 出席ページ自身の文言（学外ネットワークからのアクセス）を検知した時だけ出す。
            学内Wi-Fiへ切り替えてもWebView側の表示が自動では追随しないため「再確認」で再取得する。
            進行表示はバー内テキストの差し替えのみ（取得系と同じ・大きなアニメは出さない方針）。
            出席済み（案内が無意味）と競合中（conflictカードの再確認と衝突・非出席ページへの検出注入を防ぐ）
            では出さない。「再確認」はエンジン稼働中のみ提示する（停止中は取得できず偽の確認中になる）。 */}
        {!conflict && !attendedNow && reception?.network === 'off' ? (
          <View style={[styles.netWarn, { backgroundColor: ui.colors.warnBg }]}>
            <Ionicons name="wifi-outline" size={16} color={ui.colors.warn} />
            <Text style={[styles.netWarnText, { color: ui.colors.warn }]}>
              {netChecking
                ? 'ネットワーク状態を確認中…'
                : '学外ネットワークです。出席登録には学内Wi-Fiが必要な場合があります'}
            </Text>
            {!netChecking && engine.running ? (
              <PressableRow onPress={recheckNetwork} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.netWarnAction, { color: ui.colors.warn }]}>再確認</Text>
              </PressableRow>
            ) : null}
          </View>
        ) : null}

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
        ) : attendedNow && !reactionOpen ? (
          <>
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
          {/* 出席済みでも、リアペを出せる授業なら書ける（任意提出・ユーザー要望 2026-07-17）。 */}
          {canOpenReaction ? (
            <Pressable
              style={[styles.reactionGhost, { backgroundColor: ui.colors.inputBg, borderColor: ui.colors.inputBorder }]}
              onPress={() => setReactionOpen(true)}
            >
              <Text style={[styles.reactionGhostText, { color: dark ? COLORS.emeraldLight : c.emeraldDark }]}>
                {reactionSubmitted ? 'リアクションペーパーを編集（提出済み）' : 'リアクションペーパーを書く'}
              </Text>
            </Pressable>
          ) : null}
          </>
        ) : showReactionForm ? (
          // リアペ入力。2通り:
          //  ・必須(reactionPending): 出席コードは受理済みだが提出しないと出席にならない＝常に出す。
          //  ・任意(reactionOpen): CLASSに提出ボタンが出ている授業で、ユーザーが「書く」で開いたとき。
          // 提出後は既存の .attendSuc 検知が attended に切り替える。CLASS画面での手動提出も常に併設
          // （actuatorスタブ環境・DOM変化時の逃げ道）。
          <>
            <View style={[styles.card, cardStyle, styles.hero]}>
              <View style={[styles.preIconWrap, { backgroundColor: ui.colors.softBoxBg }]}>
                <Ionicons name="create-outline" size={30} color={ui.accent} />
              </View>
              <Text style={[styles.status, styles.statusCenter, { color: valueColor }]}>
                {reactionPending
                  ? '出席コードは受理されました。リアクションペーパーを提出すると出席になります'
                  : reactionSubmitted
                    ? '提出済みのリアクションペーパーです。編集して再提出できます'
                    : 'リアクションペーパーを提出できます（この授業では出席の条件ではありません）'}
              </Text>
              {reception?.courseName || reception?.confirmWindow ? (
                <Text style={[styles.conflictSub, { color: labelColor }]}>
                  {reception?.courseName ?? ''}
                  {reception?.confirmWindow ? `${reception?.courseName ? ' ・ ' : ''}${reception.confirmWindow}` : ''}
                </Text>
              ) : null}
              {/* 必須リアペは**受付が閉じると出席にならない**＝ここが最も時間に追われる局面なのに、
                  従来はカウントダウンが受付中(accepting)のリングにしか無く、この画面では静的な
                  受付時間しか見えなかった。締切までの実残りを出す。任意提出は出席と無関係なので出さない。
                  受付が閉じた後は残りではなく**閉じた事実**を出す（リアペ必須の status は受付終了後も
                  reaction_pending のまま居座るので、ここに来る）。 */}
              {reactionPending && clock ? (
                <Text style={[styles.conflictSub, { color: ui.colors.warn, fontWeight: '600' }]}>
                  提出の受付終了まで {clock}
                </Text>
              ) : reactionPending && windowEnded ? (
                <Text style={[styles.conflictSub, { color: ui.colors.danger, fontWeight: '600' }]}>
                  受付は終了しました。いま提出しても出席にならない可能性があります
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
                <Text style={styles.ctaText}>提出中…</Text>
              ) : (
                <Text style={styles.ctaText}>{reactionSubmitted ? 'リアクションペーパーを再提出' : 'リアクションペーパーを提出'}</Text>
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

            {/* 任意提出は閉じられる（必須は出席の条件なので閉じさせない）。下書きは保持したまま。 */}
            {!reactionPending ? (
              <Pressable
                style={[styles.reactionGhost, { backgroundColor: ui.colors.inputBg, borderColor: ui.colors.inputBorder }]}
                disabled={reactionSending}
                onPress={() => setReactionOpen(false)}
              >
                <Text style={[styles.reactionGhostText, { color: labelColor }]}>閉じる（下書きは残ります）</Text>
              </Pressable>
            ) : null}
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
                    {/* 受付時間から now で毎秒引いた実カウントダウン。**reception.remaining へは落とさない**:
                        あれは取得時点で固定された静止値で、「残り時間」の下に置くと減らない数字が居座る
                        （＝嘘をつく）。取得できないときは '—' と明示し、静止値は下に出典付きで添える。 */}
                    <CountdownRing
                      centerText={clock ?? '—'}
                      subText={clock ? '残り時間' : windowEnded ? '受付終了' : '受付時間 不明'}
                      size={176}
                      progress={countdownFraction(reception?.confirmWindow ?? null, now) ?? undefined}
                    />
                  </View>
                  <Text style={[styles.heroWindow, { color: labelColor }]}>
                    出席確認時間 {reception?.confirmWindow ?? '—'}
                  </Text>
                  {!clock && reception?.remaining ? (
                    // remaining はパーサ側で既に「あと〜」の形（attendanceMessage の extractRemaining /
                    // remainingFromSec）。「残り」を足すと「残り あと12分34秒」と二重表現になる。
                    <Text style={[styles.heroWindow, { color: labelColor }]}>
                      CLASSの表示（取得時点）: {reception.remaining}
                    </Text>
                  ) : null}
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
                <Text style={styles.ctaText}>送信中…</Text>
              ) : (
                <Text style={styles.ctaText}>出席する</Text>
              )}
            </Pressable>

            {outcome === 'ok' ? (
              <View style={[styles.card, cardStyle, styles.doneCard]}>
                <View style={styles.doneCheck}>
                  <Ionicons name="checkmark" size={38} color={c.white} />
                </View>
                <Text style={[styles.doneTitle, { color: valueColor }]}>出席を登録しました</Text>
                {/* 成功時も診断を出す: 自動送信は元々「未検証」の経路で、間欠的に登録されない事象を
                    追っている。どの経路(method)で通ったかが分かって初めて再発を潰せる。 */}
                <Text selectable style={[styles.diag, styles.diagCenter, { color: labelColor }]}>
                  診断: method={result?.method ?? '-'} / 入力={result?.filled ?? '-'}桁 / 送信応答=
                  {String(result?.ajaxDone)} / status={result?.ajaxStatus ?? '-'}
                  {result?.ok ? ' / 検出=応答テキスト' : ' / 検出=CLASS出席済み'}
                </Text>
              </View>
            ) : submitFailed ? (
              // 失敗時は actuator の理由をそのまま出し、CLASSの画面で手動登録できる逃げ道を必ず添える
              // （自動送信が効かない端末でも出席を落とさないため）。
              <View style={[styles.card, cardStyle, { marginTop: 12 }]}>
                <View style={[styles.result, { backgroundColor: ui.colors.dangerBg }]}>
                  <Text style={[styles.resultText, { color: ui.colors.danger }]}>{result?.result}</Text>
                </View>
                <Text style={[styles.status, { color: labelColor, fontSize: 13, fontWeight: '400', marginTop: 8 }]}>
                  出席は登録されていません。CLASSの画面を開いて「出席登録する」を押してください。
                </Text>
                {/* 送信診断: 「発火しているのに登録されない」原因（process範囲など）の特定に要る。
                    失敗時だけ・折りたたまず小さく出す（作者が実機で読める唯一の経路）。 */}
                <Text selectable style={[styles.diag, { color: labelColor }]}>
                  診断: btn={String(result?.btnFound)} / method={result?.method ?? '-'} / 入力={result?.filled ?? '-'}桁
                  {'\n'}送信: 発火={String(result?.ajaxFired)} / 応答={String(result?.ajaxDone)} / status=
                  {result?.ajaxStatus ?? '-'}
                  {result?.ajaxError ? ` / err=${result.ajaxError}` : ''}
                  {result?.hint ? `\nCLASSの応答: ${result.hint}` : ''}
                  {result?.onclick ? `\n${result.onclick}` : ''}
                </Text>
                <View style={styles.failRow}>
                  <Pressable style={[styles.failBtn, { backgroundColor: c.cta }]} onPress={() => setRevealClass(true)}>
                    <Text style={styles.failBtnText}>CLASSの画面を表示</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.failBtn,
                      styles.failBtnGhost,
                      { backgroundColor: ui.colors.inputBg, borderColor: ui.colors.inputBorder },
                    ]}
                    onPress={retry}
                  >
                    <Text style={[styles.failBtnText, { color: dark ? COLORS.emeraldLight : c.emeraldDark }]}>最初から</Text>
                  </Pressable>
                </View>
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

            {/* 受付中でも、リアペを出せる授業なら書ける（任意提出・ユーザー要望 2026-07-17）。
                必須(reaction_pending)ではないので、出席登録の邪魔をしないよう控えめな導線にする。 */}
            {canOpenReaction ? (
              <Pressable
                style={[styles.reactionGhost, { backgroundColor: ui.colors.inputBg, borderColor: ui.colors.inputBorder }]}
                onPress={() => setReactionOpen(true)}
              >
                <Text style={[styles.reactionGhostText, { color: dark ? COLORS.emeraldLight : c.emeraldDark }]}>
                  {reactionSubmitted ? 'リアクションペーパーを編集（提出済み）' : 'リアクションペーパーを書く'}
                </Text>
              </Pressable>
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
  netWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  netWarnText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  netWarnAction: { fontSize: 12, fontWeight: '700', padding: 2 },
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
  diag: { fontSize: 10, lineHeight: 14, marginTop: 8 },
  diagCenter: { textAlign: 'center' },
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

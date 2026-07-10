import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { ScreenBg, CountdownRing, useTabBarClearance } from '../ui/screen'
import { countdownClock, countdownFraction } from '../attendance/countdown'
import { normalizeAttendanceCode } from '../attendance/normalizeCode'
import { useAttendanceEngine } from '../attendance/AttendanceEngineProvider'
import { COLORS, useThemeVariant } from '../theme'

/**
 * 出席画面。CLASS WebView・受付判定エンジンは AttendanceEngineProvider（アプリ根で常時保持）に
 * あり、本画面はその状態を読むだけの薄いUI。フォーカス状態だけエンジンへ通知し、授業時間帯以外は
 * この画面を開いている間だけエンジンを起動させる。
 */
export default function AttendanceScreen() {
  const inputRef = useRef<TextInput>(null)
  const { variant } = useThemeVariant()
  const glass = variant === 'green'
  const clearance = useTabBarClearance()
  const isFocused = useIsFocused()
  const engine = useAttendanceEngine()
  const {
    phase,
    reception,
    result,
    attended,
    attendedNow,
    now,
    code,
    setCode,
    submit,
    retry,
    failCount,
    revealClass,
    setRevealClass,
    setAttendanceFocused,
  } = engine

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

  const resultBanner = result
    ? {
        text: result.result,
        bg: result.ok ? c.successBg : c.dangerBg,
        fg: result.ok ? c.success : c.danger,
      }
    : null

  const digits = [0, 1, 2, 3].map((i) => code[i] ?? '')

  const cardStyle = glass
    ? { backgroundColor: 'rgba(255,255,255,0.34)', borderColor: 'rgba(255,255,255,0.55)', borderWidth: 1 }
    : { backgroundColor: c.white, borderColor: '#e3ece8', borderWidth: 1 }
  const labelColor = glass ? c.labelOnGlass : c.emeraldDark
  const valueColor = glass ? c.inkOnGlass : c.ink
  const accepting = !!reception?.accepting

  return (
    <View style={styles.wrap}>
      <ScreenBg>
        <View style={styles.header}>
          <View style={styles.hLeft}>
            <Ionicons name="flash-outline" size={22} color={glass ? c.white : c.emeraldDark} />
            <Text style={[styles.hTitle, { color: glass ? c.white : c.emeraldDark }]}>出席</Text>
          </View>
          <Text style={[styles.pill, glass ? styles.pillGlass : styles.pillSolid]}>
            {attendedNow ? '出席済み' : phase === 'needsLogin' ? 'ログインが必要' : reception ? 'ログイン済み' : '確認中…'}
          </Text>
        </View>

        {attendedNow ? (
          <View style={[styles.card, cardStyle, styles.doneHero]}>
            <View style={styles.doneCheck}>
              <Ionicons name="checkmark" size={38} color="#ffffff" />
            </View>
            <Text style={[styles.doneTitle, { color: valueColor }]}>出席済み</Text>
            {attended?.courseName ? (
              <Text style={[styles.doneSub, { color: labelColor }]}>{attended.courseName}</Text>
            ) : null}
            <Text style={[styles.doneCodeLabel, { color: labelColor }]}>入力した出席コード</Text>
            <Text style={[styles.doneCode, { color: valueColor }]}>{attended?.code}</Text>
          </View>
        ) : (
          <>
            <View style={[styles.card, cardStyle, styles.hero]}>
              {accepting ? (
                <>
                  <View style={styles.liveBadgeRow}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveBadgeText}>受付中</Text>
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
                  <View style={[styles.preIconWrap, glass && styles.preIconWrapGlass]}>
                    <Ionicons name="time-outline" size={30} color={glass ? c.white : c.emerald} />
                  </View>
                  <Text style={[styles.status, styles.statusCenter, { color: valueColor }]}>{statusLine}</Text>
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
                    <Pressable style={[styles.failBtn, styles.failBtnGhost]} onPress={() => setRevealClass(true)}>
                      <Text style={[styles.failBtnText, { color: c.emeraldDark }]}>CLASSの画面を表示</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={[styles.card, cardStyle, { marginTop: 12 }]}>
              <Text style={[styles.inputLabel, { color: labelColor }]}>認証コード（半角数字）</Text>
              <Pressable style={styles.segRow} onPress={() => inputRef.current?.focus()}>
                {digits.map((d, i) => (
                  <View key={i} style={[styles.seg, glass && styles.segGlass]}>
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

            <Pressable style={[styles.cta, { backgroundColor: c.cta }]} onPress={submit}>
              <Text style={styles.ctaText}>{phase === 'submitting' ? '送信中…' : '出席する'}</Text>
            </Pressable>

            {resultBanner ? (
              result?.ok ? (
                <View style={[styles.card, cardStyle, styles.doneCard]}>
                  <View style={styles.doneCheck}>
                    <Ionicons name="checkmark" size={38} color="#ffffff" />
                  </View>
                  <Text style={[styles.doneTitle, { color: valueColor }]}>出席を登録しました</Text>
                  <Text style={[styles.doneSub, { color: labelColor }]}>{resultBanner.text}</Text>
                </View>
              ) : (
                <View style={[styles.result, { backgroundColor: resultBanner.bg }]}>
                  <Text style={[styles.resultText, { color: resultBanner.fg }]}>{resultBanner.text}</Text>
                </View>
              )
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
  pillGlass: { backgroundColor: 'rgba(255,255,255,0.42)', color: '#04322a' },
  pillSolid: { backgroundColor: '#d6efe4', color: '#0a6650' },
  card: { borderRadius: 18, padding: 16 },
  hero: { alignItems: 'center', paddingVertical: 20 },
  liveBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.cta },
  liveBadgeText: { fontSize: 12, fontWeight: '700', color: COLORS.cta, letterSpacing: 0.5 },
  heroCourse: { fontSize: 17, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8 },
  ringWrap: { marginTop: 14 },
  heroWindow: { fontSize: 12, marginTop: 14, textAlign: 'center' },
  preIconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eef5f2', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  preIconWrapGlass: { backgroundColor: 'rgba(255,255,255,0.2)' },
  status: { fontSize: 16, fontWeight: '600' },
  statusCenter: { textAlign: 'center' },
  inputLabel: { fontSize: 13, marginBottom: 10 },
  segRow: { flexDirection: 'row', gap: 9 },
  seg: { flex: 1, height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: '#b9ddcd', backgroundColor: '#f1f8f5', alignItems: 'center', justifyContent: 'center' },
  segGlass: { backgroundColor: 'rgba(255,255,255,0.42)', borderColor: 'rgba(255,255,255,0.7)' },
  segText: { fontSize: 24, fontWeight: '600' },
  hiddenInput: { position: 'absolute', opacity: 0, height: 54, left: 16, right: 16, top: 40 },
  cta: { marginTop: 16, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  result: { marginTop: 12, borderRadius: 14, padding: 11 },
  resultText: { fontSize: 15, fontWeight: '600' },
  doneHero: { alignItems: 'center', paddingVertical: 24 },
  doneCodeLabel: { fontSize: 12, marginTop: 16 },
  doneCode: { fontSize: 40, fontWeight: '700', letterSpacing: 8, marginTop: 4 },
  doneCard: { marginTop: 12, alignItems: 'center', paddingVertical: 22 },
  doneCheck: { width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  doneTitle: { fontSize: 18, fontWeight: '700' },
  doneSub: { fontSize: 13, marginTop: 6, textAlign: 'center' },
  failRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  failBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  failBtnGhost: { backgroundColor: 'rgba(255,255,255,0.6)', borderWidth: 1, borderColor: '#b9ddcd' },
  failBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
})

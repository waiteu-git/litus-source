import { useEffect, useMemo, useState } from 'react'
import { Alert, Clipboard, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Ionicons from '@expo/vector-icons/Ionicons'
import { Text, TextInput } from '../ui/Text'
import { Segmented, useUi } from '../ui/screen'
import { useKeyboardHeight } from '../ui/useKeyboardHeight'
import { COLORS, useThemeVariant } from '../theme'
import { resolveUiColors } from '../theme.tokens'
import type { SubmitDiag } from '../attendance/submitDiag'
import { loadSubmitDiags } from '../storage/submitDiagStore'
import { collectDiagEnv } from './diagEnv'
import { collectNotifDiagLine } from './notifDiagLine'
import { DIAG_REPORT_TO, buildMailtoUrl, mailtoMayTruncate } from './diagReport'
import {
  FEEDBACK_COMMENT_MAX_LENGTH,
  FEEDBACK_TARGET_LABEL,
  buildFeedbackPreviewText,
  buildFeedbackSubject,
  feedbackPlaceholder,
  filterDiagsForTarget,
  formatDiagsText,
  validateFeedbackDraft,
  type FeedbackDraft,
  type FeedbackEnvelope,
  type FeedbackKind,
  type FeedbackTarget,
} from './feedback'
import { submitFeedback } from './feedbackApi'

const KIND_OPTIONS: { key: FeedbackKind; label: string }[] = [
  { key: 'bug', label: '不具合' },
  { key: 'request', label: '要望' },
]

const TARGET_OPTIONS: { key: FeedbackTarget; label: string }[] = (
  ['attendance', 'reaction', 'timetable', 'bulletin', 'login', 'other'] as const
).map((key) => ({ key, label: FEEDBACK_TARGET_LABEL[key] }))

/**
 * 対象6択の折り返しチップ行。`Segmented`（等幅flex・折り返し無し）は2〜4択の短いラベル向けで、
 * 「リアクションペーパー」を含む6択を載せると390pt端末で1枠約52pt＝3行に折り返って全体が膨らむ。
 * `Segmented`本体は他の呼び出しが依存しているので変えず、ここだけローカルに持つ（配色トークン・読み上げは踏襲）。
 */
function TargetChips({
  options,
  value,
  onChange,
}: {
  options: { key: FeedbackTarget; label: string }[]
  value: FeedbackTarget
  onChange: (k: FeedbackTarget) => void
}) {
  const { variant } = useThemeVariant()
  const c = resolveUiColors(variant)
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const on = o.key === value
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            style={[
              styles.chip,
              { borderColor: c.segBorder },
              on ? { backgroundColor: c.segOnBg, borderColor: 'transparent' } : null,
            ]}
          >
            <Text style={{ fontSize: 13, fontWeight: on ? '600' : '400', color: on ? c.segOnText : c.segOffText }}>
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export default function FeedbackSheet({
  visible,
  onClose,
  initialKind = 'bug',
  initialTarget = 'other',
}: {
  visible: boolean
  onClose: () => void
  initialKind?: FeedbackKind
  initialTarget?: FeedbackTarget
}) {
  const ui = useUi()
  const insets = useSafeAreaInsets()
  const kbHeight = useKeyboardHeight()

  const [kind, setKind] = useState<FeedbackKind>(initialKind)
  // targetは常に具体的な値を持つ（Segmentedは「未選択」を表現できないため）。
  // kind==='request'の時は下のresolvedTargetでnullへ丸める。
  const [target, setTarget] = useState<FeedbackTarget>(initialTarget)
  const [comment, setComment] = useState('')
  const [email, setEmail] = useState('')
  const [stage, setStage] = useState<'form' | 'preview'>('form')
  const [diags, setDiags] = useState<SubmitDiag[] | null>(null)
  const [notifLine, setNotifLine] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitFailed, setSubmitFailed] = useState(false)

  // 開くたびに初期化する（前回の入力を持ち越さない）。
  useEffect(() => {
    if (!visible) return
    setKind(initialKind)
    setTarget(initialTarget)
    setComment('')
    setEmail('')
    setStage('form')
    setSubmitFailed(false)
    let alive = true
    loadSubmitDiags()
      .catch(() => [])
      .then((list) => {
        if (alive) setDiags(list)
      })
    setNotifLine(null)
    collectNotifDiagLine()
      .then((line) => {
        if (alive) setNotifLine(line)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [visible, initialKind, initialTarget])

  const resolvedTarget = kind === 'bug' ? target : null
  const draft: FeedbackDraft = { kind, target: resolvedTarget, comment, email }
  const validationError = validateFeedbackDraft(draft)

  const relevantDiags = useMemo(() => filterDiagsForTarget(diags ?? [], resolvedTarget), [diags, resolvedTarget])

  // 診断記録の整形は1回だけ（envelopeとフォームのプレビュー表示の両方がこれを使う）。
  const diagsText = useMemo(() => formatDiagsText(relevantDiags), [relevantDiags])

  const envelope: FeedbackEnvelope | null = useMemo(() => {
    if (diags === null) return null
    return {
      kind,
      target: resolvedTarget,
      comment: comment.trim(),
      email: email.trim() || null,
      diagsText,
      notifLine,
      env: collectDiagEnv(),
    }
  }, [diags, kind, resolvedTarget, comment, email, diagsText, notifLine])

  // 本文組み立てとURLエンコードは確認画面でしか要らない。打鍵ごとに回さない
  // （envelope自体は送信そのものなので遅延させない＝useDeferredValueは使わない）。
  const previewText = useMemo(() => {
    if (stage !== 'preview' || !envelope) return ''
    return buildFeedbackPreviewText(envelope)
  }, [stage, envelope])

  const fallbackUrl = useMemo(() => {
    if (stage !== 'preview' || !envelope) return null
    return buildMailtoUrl({ to: DIAG_REPORT_TO, subject: buildFeedbackSubject(kind, envelope.env), body: previewText })
  }, [stage, envelope, kind, previewText])

  const copyPrimary = fallbackUrl ? mailtoMayTruncate(fallbackUrl) : true

  const onConfirm = () => {
    if (validationError || !envelope) return
    setStage('preview')
  }

  const onBack = () => {
    setStage('form')
    setSubmitFailed(false)
  }

  const onSubmit = async () => {
    if (!envelope) return
    setSubmitting(true)
    const result = await submitFeedback(envelope)
    setSubmitting(false)
    if (result.ok) {
      Alert.alert('送信しました', 'ご協力ありがとうございます。', [{ text: 'OK', onPress: onClose }])
      return
    }
    setSubmitFailed(true)
  }

  const onCopy = () => {
    try {
      Clipboard.setString(previewText)
      Alert.alert('コピーしました', `メールやDMに貼り付けて ${DIAG_REPORT_TO} へお送りください。`)
    } catch {
      Alert.alert('コピーできませんでした', `本文を長押しして選択し、手でコピーしてから ${DIAG_REPORT_TO} へお送りください。`)
    }
  }

  const onMail = () => {
    if (!fallbackUrl) return
    Linking.openURL(fallbackUrl).catch(() => {
      Alert.alert('メールアプリを開けませんでした', `「本文をコピー」で本文を写して、${DIAG_REPORT_TO} へお送りください。`)
    })
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View
        style={[
          styles.root,
          {
            backgroundColor: ui.colors.screenSolid,
            paddingTop: insets.top + 12,
            paddingBottom: (kbHeight > 0 && Platform.OS === 'ios' ? 0 : insets.bottom) + 12,
            marginBottom: kbHeight,
          },
        ]}
      >
        <View style={styles.headRow}>
          <Text style={[styles.headTitle, { color: ui.heading }]}>フィードバックを送る</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="閉じる">
            <Text style={[styles.close, { color: ui.labelColor }]}>閉じる</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {stage === 'form' ? (
            <>
              <Text style={[styles.label, { color: ui.labelColor }]}>種別</Text>
              <Segmented
                options={KIND_OPTIONS}
                value={kind}
                onChange={setKind}
              />

              {kind === 'bug' ? (
                <>
                  <Text style={[styles.label, { color: ui.labelColor, marginTop: 14 }]}>対象</Text>
                  <TargetChips options={TARGET_OPTIONS} value={target} onChange={setTarget} />
                </>
              ) : null}

              <Text style={[styles.label, { color: ui.labelColor, marginTop: 14 }]}>
                {kind === 'bug' ? '何が起きましたか？' : 'どんな機能が欲しいですか？'}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: ui.inputBg, borderColor: ui.inputBorder, color: ui.valueColor }]}
                value={comment}
                onChangeText={setComment}
                placeholder={feedbackPlaceholder(kind, resolvedTarget)}
                placeholderTextColor={ui.subMuted}
                multiline
                maxLength={FEEDBACK_COMMENT_MAX_LENGTH}
                textAlignVertical="top"
              />

              {relevantDiags.length > 0 ? (
                <>
                  <Text style={[styles.label, { color: ui.labelColor, marginTop: 14 }]}>
                    {`診断記録（${relevantDiags.length}件・そのまま送られます）`}
                  </Text>
                  <View style={[styles.bodyBox, { backgroundColor: ui.inputBg, borderColor: ui.inputBorder }]}>
                    <Text selectable style={[styles.body, { color: ui.valueColor }]}>
                      {diagsText}
                    </Text>
                  </View>
                </>
              ) : null}

              <Text style={[styles.label, { color: ui.labelColor, marginTop: 14 }]}>返信用メールアドレス（任意）</Text>
              <TextInput
                style={[styles.emailInput, { backgroundColor: ui.inputBg, borderColor: ui.inputBorder, color: ui.valueColor }]}
                value={email}
                onChangeText={setEmail}
                placeholder="返信が必要な場合のみご記入ください"
                placeholderTextColor={ui.subMuted}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </>
          ) : (
            <>
              <Text style={[styles.lead, { color: ui.labelColor }]}>
                この内容がそのまま送信されます。学籍番号・氏名は含まれていません。
              </Text>
              <View style={[styles.bodyBox, { backgroundColor: ui.inputBg, borderColor: ui.inputBorder }]}>
                <Text selectable style={[styles.body, { color: ui.valueColor }]}>
                  {previewText}
                </Text>
              </View>

              {submitFailed ? (
                <View style={[styles.notice, { backgroundColor: ui.colors.softBoxBg, marginTop: 14 }]}>
                  <Ionicons name="alert-circle-outline" size={16} color={ui.labelColor} />
                  <Text style={[styles.noticeText, { color: ui.labelColor }]}>
                    送信できませんでした。かわりにメールで送るか、本文をコピーしてください。
                  </Text>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        {stage === 'form' ? (
          <Pressable
            style={[styles.cta, { backgroundColor: COLORS.cta }, validationError ? styles.ctaBusy : null]}
            disabled={validationError !== null}
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel="内容を確認する"
          >
            <Text style={styles.ctaText}>確認する</Text>
          </Pressable>
        ) : submitFailed ? (
          <>
            {copyPrimary ? (
              <>
                <Pressable
                  style={[styles.cta, { backgroundColor: COLORS.cta }]}
                  onPress={onCopy}
                  accessibilityRole="button"
                  accessibilityLabel="本文をコピー"
                >
                  <Text style={styles.ctaText}>本文をコピー</Text>
                </Pressable>
                <Pressable
                  style={[styles.ghost, { backgroundColor: ui.inputBg, borderColor: ui.inputBorder }]}
                  onPress={onMail}
                  accessibilityRole="button"
                  accessibilityLabel="メールで送る"
                >
                  <Text style={[styles.ghostText, { color: ui.dark ? COLORS.emeraldLight : COLORS.emeraldDark }]}>
                    メールで送る
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={[styles.cta, { backgroundColor: COLORS.cta }]}
                  onPress={onMail}
                  accessibilityRole="button"
                  accessibilityLabel="メールで送る"
                >
                  <Text style={styles.ctaText}>メールで送る</Text>
                </Pressable>
                <Pressable
                  style={[styles.ghost, { backgroundColor: ui.inputBg, borderColor: ui.inputBorder }]}
                  onPress={onCopy}
                  accessibilityRole="button"
                  accessibilityLabel="本文をコピー"
                >
                  <Text style={[styles.ghostText, { color: ui.dark ? COLORS.emeraldLight : COLORS.emeraldDark }]}>
                    本文をコピー
                  </Text>
                </Pressable>
              </>
            )}
            <Pressable
              style={[styles.ghost, { backgroundColor: ui.inputBg, borderColor: ui.inputBorder }]}
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="戻って書き直す"
            >
              <Text style={[styles.ghostText, { color: ui.dark ? COLORS.emeraldLight : COLORS.emeraldDark }]}>
                戻って書き直す
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={[styles.cta, { backgroundColor: COLORS.cta }, submitting ? styles.ctaBusy : null]}
              disabled={submitting}
              onPress={onSubmit}
              accessibilityRole="button"
              accessibilityLabel="送信"
            >
              <Text style={styles.ctaText}>{submitting ? '送信しています…' : '送信'}</Text>
            </Pressable>
            <Pressable
              style={[styles.ghost, { backgroundColor: ui.inputBg, borderColor: ui.inputBorder }]}
              onPress={onBack}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="戻って書き直す"
            >
              <Text style={[styles.ghostText, { color: ui.dark ? COLORS.emeraldLight : COLORS.emeraldDark }]}>
                戻って書き直す
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
  notice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderRadius: 12, padding: 10 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: { minHeight: 96, borderWidth: 1, borderRadius: 14, padding: 12, fontSize: 14, lineHeight: 21 },
  emailInput: { height: 44, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, fontSize: 14 },
  bodyBox: { borderWidth: 1, borderRadius: 14, padding: 12 },
  body: { fontSize: 11, lineHeight: 17 },
  cta: { borderRadius: 16, paddingVertical: 13, alignItems: 'center' },
  ctaBusy: { opacity: 0.6 },
  ctaText: { color: COLORS.white, fontSize: 15, fontWeight: '600' },
  ghost: { borderRadius: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, marginTop: 8 },
  ghostText: { fontSize: 14, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1 },
})

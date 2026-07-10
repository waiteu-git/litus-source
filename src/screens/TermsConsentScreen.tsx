import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS } from '../theme'
import { TERMS_VERSION } from '../legal/termsVersion'
import { saveTermsConsent } from '../storage/termsConsentStore'

// 規約本文（正典は docs/legal/terms-ja.md。片方を更新したら他方も必ず合わせること）。
const TERMS_BODY = `本アプリ「リタス（Litus）」は、東京理科大学の公式アプリではない非公式のアプリです。個人が学習・利便のために提供しています。ご利用の前に以下に同意してください。

1. 本人利用・認証情報
・あなた自身のTUSアカウントでログインして利用してください。
・本アプリは認証情報（ID・パスワード）を保存しません。ログインは大学の公式ログイン画面で行われます。

2. 取得する情報の範囲
・CLASSからは履修科目・時間割・出席・掲示のみを取得します。成績など機微な情報は取得しません。
・通信先はLETUS／CLASS／本アプリの自前バックエンド（lms.waiteu.dev）に限られます。
・本アプリは、自前バックエンド（lms.waiteu.dev）に対して、利用者個人を特定できる形での情報の送信を行いません。通知は端末内でローカルに予約され、送信を伴いません。

3. 禁止事項
・CLASS／LETUS／大学のシステムに過度な負荷をかける行為。
・出席コードの自動連投・総当たり、スクレイピングの乱用など、正常な運用を妨げる行為。
・代理出席・なりすまし等の不正な出席登録。
・大学の規程・利用規約・法令に違反する利用。

4. 自己責任・免責
・本アプリの利用に伴う一切の責任は利用者が負います。大学規程・法令の遵守は利用者の責任です。
・本アプリは現状有姿で提供され、いかなる保証もありません。利用に起因する損害について、提供者は責任を負いません。

5. 規約の改定
・規約は改定されることがあります。改定時は起動時に再度の同意を求めます。
・本規約は日本法に準拠します。

「同意して始める」を押すと、上記に同意したものとみなします。`

export default function TermsConsentScreen({ onAccept }: { onAccept: () => void }) {
  const insets = useSafeAreaInsets()
  const [busy, setBusy] = useState(false)
  async function accept() {
    if (busy) return
    setBusy(true)
    try {
      await saveTermsConsent(TERMS_VERSION)
      onAccept()
    } finally {
      setBusy(false)
    }
  }
  return (
    <LinearGradient colors={[COLORS.gradTop, COLORS.gradBottom]} style={styles.root}>
      <View style={[styles.inner, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title}>ご利用の前に</Text>
        <Text style={styles.sub}>リタスは非公式アプリです。以下に同意のうえご利用ください。</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody}>
          <Text style={styles.body}>{TERMS_BODY}</Text>
        </ScrollView>
        <Pressable style={[styles.cta, busy && { opacity: 0.6 }]} onPress={accept} disabled={busy}>
          <Text style={styles.ctaText}>同意して始める</Text>
        </Pressable>
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 20 },
  title: { color: COLORS.white, fontSize: 24, fontWeight: '700', marginBottom: 6 },
  sub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, marginBottom: 14 },
  scroll: { flex: 1, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 14, padding: 16 },
  scrollBody: { paddingBottom: 10 },
  body: { color: '#12332a', fontSize: 13.5, lineHeight: 22 },
  cta: { marginTop: 16, backgroundColor: COLORS.white, borderRadius: 999, paddingVertical: 15, alignItems: 'center' },
  ctaText: { color: COLORS.emeraldDark, fontSize: 16, fontWeight: '700' },
})

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DESKTOP_UA, DETECT_PAGE_JS } from '../collect/injectedScripts'
import { loadOnboardingDone, saveOnboardingDone } from '../storage/onboardingStore'
import OnboardingSlides from '../screens/OnboardingSlides'
import { COLORS } from '../theme'

const CLASS_URL = 'https://class.admin.tus.ac.jp/'
// checking中に本物のログイン状態が判定できない場合の保険（リダイレクト完了待ち）。
const CHECK_TIMEOUT_MS = 12000

type GateState = 'loading' | 'firstRun' | 'checking' | 'needsLogin' | 'authed'

const LoginContext = createContext<{ requireLogin: () => void }>({ requireLogin: () => {} })

/** 画面側からセッション切れ時に再ログインを要求する。 */
export function useLoginGate() {
  return useContext(LoginContext)
}

/**
 * 起動ゲート。初回はチュートリアル（スライド→本物のSSOログイン全面表示・こちらのUIで包まない）、
 * 2回目以降は翠の起動画面でCLASSセッションを確認し、確認でき次第タブへ入場する。チュートリアル
 * 表示中も背後の1x1 WebViewがセッション確認を進め、結果は lastResultRef に貯めて完了時に即反映する。
 * CLASSとLETUSは同一SSOなので1回のログインで両方有効。認証情報は保存しない。
 * セッション切れは各画面が requireLogin() で再表示させる。
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const [state, setState] = useState<GateState>('loading')
  const [nonce, setNonce] = useState(0)
  const webviewRef = useRef<WebView>(null)
  // firstRun 中に届いた判定を保持し、スライド完了時に即適用する。
  const lastResultRef = useRef<'needsLogin' | 'authed' | null>(null)

  useEffect(() => {
    loadOnboardingDone()
      .then((done) => setState(done ? 'checking' : 'firstRun'))
      .catch(() => setState('checking'))
  }, [])

  useEffect(() => {
    if (state !== 'checking') return
    const t = setTimeout(() => setState((s) => (s === 'checking' ? 'needsLogin' : s)), CHECK_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [state, nonce])

  // ログイン成功＝チュートリアル完了として永続化（途中離脱なら次回もチュートリアルから）。
  useEffect(() => {
    if (state === 'authed') saveOnboardingDone().catch(() => undefined)
  }, [state])

  function requireLogin() {
    lastResultRef.current = null
    setNonce((n) => n + 1)
    setState('checking')
  }

  function onSlidesDone() {
    if (lastResultRef.current === 'authed') setState('authed')
    else if (lastResultRef.current === 'needsLogin') setState('needsLogin')
    else setState('checking')
  }

  function onMessage(data: string) {
    let p: { type?: string; hasPasswordInput?: boolean; hasEnterSplash?: boolean; hasClassMenu?: boolean } | null =
      null
    try {
      p = JSON.parse(data)
    } catch {
      return
    }
    if (!p || p.type !== 'page') return
    const result = p.hasPasswordInput ? 'needsLogin' : p.hasEnterSplash || p.hasClassMenu ? 'authed' : null
    if (!result) return // リダイレクト途中は checking のまま待つ
    lastResultRef.current = result
    // checking中は判定どおり遷移。needsLogin（可視ログイン）中はログイン完了(authed)のみ受け付ける。
    setState((s) => (s === 'checking' || (s === 'needsLogin' && result === 'authed') ? result : s))
  }

  if (state === 'authed') {
    return <LoginContext.Provider value={{ requireLogin }}>{children}</LoginContext.Provider>
  }

  const showLoginUi = state === 'needsLogin'
  return (
    <LoginContext.Provider value={{ requireLogin }}>
      <View style={styles.root}>
        {showLoginUi ? (
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.title}>ログイン</Text>
            <Text style={styles.sub}>TUSアカウントでログインしてください（認証情報は保存しません）</Text>
          </View>
        ) : null}
        <View style={showLoginUi ? styles.webBox : styles.webHidden}>
          <WebView
            key={nonce}
            ref={webviewRef}
            source={{ uri: CLASS_URL }}
            userAgent={DESKTOP_UA}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            onLoadEnd={() => webviewRef.current?.injectJavaScript(DETECT_PAGE_JS)}
            onMessage={(e) => onMessage(e.nativeEvent.data)}
            style={styles.webviewFill}
          />
        </View>
        {state === 'loading' || state === 'checking' ? (
          <LinearGradient colors={[COLORS.gradTop, COLORS.gradBottom]} style={styles.boot}>
            <Text style={styles.bootLogo}>リタス</Text>
            <Text style={styles.bootSub}>Litus — 東京理科大 非公式アプリ</Text>
            <ActivityIndicator color="#ffffff" style={styles.bootSpin} />
            <Text style={styles.bootStatus}>
              {state === 'loading' ? '起動しています…' : 'CLASSに接続しています…'}
            </Text>
          </LinearGradient>
        ) : null}
        {state === 'firstRun' ? (
          <View style={StyleSheet.absoluteFill}>
            <OnboardingSlides onDone={onSlidesDone} />
          </View>
        ) : null}
      </View>
    </LoginContext.Provider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: COLORS.emerald, paddingHorizontal: 16, paddingBottom: 14 },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '600' },
  sub: { color: '#eafff7', fontSize: 13, marginTop: 4 },
  webBox: { flex: 1 },
  // 判定用に読み込みは続けるが画面には出さない（サイズ0だと読み込まれない端末があるため1x1）。
  webHidden: { position: 'absolute', width: 1, height: 1, top: -1000, left: -1000, opacity: 0 },
  webviewFill: { flex: 1 },
  boot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootLogo: { color: '#ffffff', fontSize: 40, fontWeight: '800', letterSpacing: 2 },
  bootSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 6 },
  bootSpin: { marginTop: 28 },
  bootStatus: { color: '#eafff7', fontSize: 13, marginTop: 10 },
})

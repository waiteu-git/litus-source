import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DESKTOP_UA, DETECT_PAGE_JS } from '../collect/injectedScripts'
import { COLORS } from '../theme'

const CLASS_URL = 'https://class.admin.tus.ac.jp/'
// checking中に本物のログイン状態が判定できない場合の保険（リダイレクト完了待ち）。
const CHECK_TIMEOUT_MS = 12000

type GateState = 'checking' | 'needsLogin' | 'authed'

const LoginContext = createContext<{ requireLogin: () => void }>({ requireLogin: () => {} })

/** 画面側からセッション切れ時に再ログインを要求する。 */
export function useLoginGate() {
  return useContext(LoginContext)
}

/**
 * 起動時ログインゲート。CLASSを開いてSSOセッションを確認し、未ログインなら専用ログイン画面（本物のCLASS/
 * 大学SSOログインをそのまま全面表示・こちらのUIで包まない）を出す。ログイン完了（入口スプラッシュ/メニュー
 * 到達）を検知したら children（タブ）を表示。CLASSとLETUSは同一SSOなので1回のログインで両方有効。
 * 認証情報は保存しない。セッション切れは各画面が requireLogin() で再表示させる。
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets()
  const [state, setState] = useState<GateState>('checking')
  const [nonce, setNonce] = useState(0)
  const webviewRef = useRef<WebView>(null)

  useEffect(() => {
    if (state !== 'checking') return
    const t = setTimeout(() => setState((s) => (s === 'checking' ? 'needsLogin' : s)), CHECK_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [state, nonce])

  function requireLogin() {
    setNonce((n) => n + 1)
    setState('checking')
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
    if (p.hasPasswordInput) setState('needsLogin')
    else if (p.hasEnterSplash || p.hasClassMenu) setState('authed')
    // どちらでもない（リダイレクト途中）は checking のまま待つ。
  }

  return (
    <LoginContext.Provider value={{ requireLogin }}>
      {state === 'authed' ? (
        children
      ) : (
        <View style={styles.root}>
          <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
            <Text style={styles.title}>ログイン</Text>
            <Text style={styles.sub}>
              {state === 'checking'
                ? 'ログイン状態を確認しています…'
                : 'TUSアカウントでログインしてください（初回のみ）'}
            </Text>
          </View>
          <View style={styles.webBox}>
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
          {state === 'checking' ? (
            <View style={styles.checking}>
              <ActivityIndicator color="#ffffff" />
              <Text style={styles.checkingText}>ログイン状態を確認しています…</Text>
            </View>
          ) : null}
        </View>
      )}
    </LoginContext.Provider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: COLORS.emerald, paddingHorizontal: 16, paddingBottom: 14 },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '600' },
  sub: { color: '#eafff7', fontSize: 13, marginTop: 4 },
  webBox: { flex: 1 },
  webviewFill: { flex: 1 },
  checking: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.gradBottom,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  checkingText: { color: '#ffffff', fontSize: 14 },
})

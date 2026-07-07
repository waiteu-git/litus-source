import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { DESKTOP_UA, DETECT_AUTH_JS, MYCOURSES_URL } from '../collect/injectedScripts'
import { classifyAuthState, type AuthStatus } from './classifyAuthState'

interface AuthContextValue {
  /** CLASS（出席・時間割）のログイン状態。可視画面が setClass で反映する */
  class: AuthStatus
  /** LETUS（課題）のログイン状態。背景ウォームアップで判定 */
  letus: AuthStatus
  /** 可視CLASS画面からCLASSのログイン状態を反映する */
  setClass: (status: AuthStatus) => void
  /** LETUSウォームアップを再実行する */
  refresh: () => void
}

const AuthContext = createContext<AuthContextValue>({
  class: 'unknown',
  letus: 'unknown',
  setClass: () => {},
  refresh: () => {},
})

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

/**
 * LETUS（Moodle）のみ、画面外の非表示WebViewでSSOセッションを黙って先読み・維持する（起動時・復帰時）。
 * Cookieが生きていればログイン維持、切れていれば needsLogin を配信して各画面が可視ログインへ促す。
 *
 * CLASS（JSF/PrimeFaces）は背景ウォームアップしない: ViewState/セッションが繊細で、隠しWebViewと
 * 可視画面(出席/時間割)が同一セッションで同時にCLASSを触ると ViewExpired（「システムエラー、画面を
 * 閉じてください」）を誘発し、アプリ再起動が必要になる不具合が出たため。CLASSのログイン状態は可視画面が
 * DETECT_AUTH_JS で直接判定して setClass で反映する。認証情報は保存しない（Cookieウォームアップのみ）。
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [classStatus, setClassStatus] = useState<AuthStatus>('unknown')
  const [letusStatus, setLetusStatus] = useState<AuthStatus>('unknown')
  // key を上げると LETUS WebView が作り直され、認証ページへ再アクセス＝セッションを温め直す。
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => sub.remove()
  }, [refresh])

  function onLetusMessage(data: string) {
    let parsed: { type?: string; hasPasswordInput?: boolean; hasLogoutLink?: boolean } | null = null
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    if (!parsed || parsed.type !== 'auth') return
    setLetusStatus(
      classifyAuthState({
        hasPasswordInput: !!parsed.hasPasswordInput,
        hasLogoutLink: !!parsed.hasLogoutLink,
      }),
    )
  }

  return (
    <AuthContext.Provider
      value={{ class: classStatus, letus: letusStatus, setClass: setClassStatus, refresh }}
    >
      {children}
      <View style={styles.hidden} pointerEvents="none">
        <WebView
          key={`letus-${nonce}`}
          source={{ uri: MYCOURSES_URL }}
          userAgent={DESKTOP_UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          injectedJavaScript={DETECT_AUTH_JS}
          onMessage={(e) => onLetusMessage(e.nativeEvent.data)}
        />
      </View>
    </AuthContext.Provider>
  )
}

const styles = StyleSheet.create({
  // レイアウトは持たせつつ画面外・不可視に置く（サイズ0だとWebViewが読み込まれない端末があるため）。
  hidden: { position: 'absolute', width: 1, height: 1, top: -1000, left: -1000, opacity: 0 },
})

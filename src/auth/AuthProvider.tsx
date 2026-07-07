import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import {
  CLASS_TOP_URL,
  DESKTOP_UA,
  DETECT_AUTH_JS,
  ENTER_CLASS_PC_JS,
  MYCOURSES_URL,
} from '../collect/injectedScripts'
import { classifyAuthState, type AuthStatus } from './classifyAuthState'

type Service = 'class' | 'letus'

const SERVICE_URL: Record<Service, string> = {
  class: CLASS_TOP_URL,
  letus: MYCOURSES_URL,
}

// CLASSは入口スプラッシュで止まるので、先に「PC ENTER」を自動クリックしてから認証状態を判定する。
const SERVICE_INJECT: Record<Service, string> = {
  class: `${ENTER_CLASS_PC_JS}\n${DETECT_AUTH_JS}`,
  letus: DETECT_AUTH_JS,
}

interface AuthContextValue {
  /** CLASS（出席・時間割）のログイン状態 */
  class: AuthStatus
  /** LETUS（課題）のログイン状態 */
  letus: AuthStatus
  /** 手動でウォームアップを再実行する（ログイン完了後などに呼ぶ） */
  refresh: () => void
}

const AuthContext = createContext<AuthContextValue>({
  class: 'unknown',
  letus: 'unknown',
  refresh: () => {},
})

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

/**
 * 起動時・フォアグラウンド復帰時に、画面外の非表示WebViewでCLASS/LETUSの認証ページを黙って先読みする。
 * Cookieが生きていればSSOリダイレクトが裏で完走してログイン済み状態を維持（ユーザー操作なし＝「ボタンを
 * 押させない自動ログイン」）。切れていれば needsLogin を配信し、各画面が可視ログインへ促す。
 * 認証情報は保存しない（Cookieウォームアップのみ）。純粋判定は classifyAuthState に委譲。
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [classStatus, setClassStatus] = useState<AuthStatus>('unknown')
  const [letusStatus, setLetusStatus] = useState<AuthStatus>('unknown')
  // key を上げると両WebViewが作り直され、認証ページへ再アクセス＝セッションを温め直す。
  const [nonce, setNonce] = useState(0)

  const refresh = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh()
    })
    return () => sub.remove()
  }, [refresh])

  function onMessage(service: Service, data: string) {
    let parsed: { type?: string; hasPasswordInput?: boolean; hasLogoutLink?: boolean } | null = null
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    if (!parsed || parsed.type !== 'auth') return
    const status = classifyAuthState({
      hasPasswordInput: !!parsed.hasPasswordInput,
      hasLogoutLink: !!parsed.hasLogoutLink,
    })
    ;(service === 'class' ? setClassStatus : setLetusStatus)(status)
  }

  return (
    <AuthContext.Provider value={{ class: classStatus, letus: letusStatus, refresh }}>
      {children}
      <View style={styles.hidden} pointerEvents="none">
        {(['class', 'letus'] as Service[]).map((service) => (
          <WebView
            key={`${service}-${nonce}`}
            source={{ uri: SERVICE_URL[service] }}
            userAgent={DESKTOP_UA}
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            javaScriptEnabled
            injectedJavaScript={SERVICE_INJECT[service]}
            onMessage={(e) => onMessage(service, e.nativeEvent.data)}
          />
        ))}
      </View>
    </AuthContext.Provider>
  )
}

const styles = StyleSheet.create({
  // レイアウトは持たせつつ画面外・不可視に置く（サイズ0だとWebViewが読み込まれない端末があるため）。
  hidden: { position: 'absolute', width: 1, height: 1, top: -1000, left: -1000, opacity: 0 },
})

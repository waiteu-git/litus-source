import { describe, it, expect } from 'vitest'
import { TabRouter } from '@react-navigation/routers'
import { TAB_ROUTE_NAMES, INITIAL_TAB, TAB_BACK_BEHAVIOR } from './tabConfig'

/** RootTabs と同じ設定で router を組む。@react-navigation/routers は純JSなので node で動く。 */
function makeRouter() {
  return TabRouter({ initialRouteName: INITIAL_TAB, backBehavior: TAB_BACK_BEHAVIOR })
}
const OPTS = { routeNames: [...TAB_ROUTE_NAMES], routeParamList: {}, routeGetIdList: {} } as never

/** getStateForAction は PartialState を含む union を返すので、非nullの完全stateへ絞る。 */
type FullState = ReturnType<ReturnType<typeof makeRouter>['getInitialState']>
function must(s: unknown): FullState {
  expect(s).not.toBeNull()
  return s as FullState
}

describe('タブの戻る挙動', () => {
  it('起動直後はホームに着地する', () => {
    const router = makeRouter()
    const state = router.getInitialState(OPTS)
    expect(state.routes[state.index].name).toBe('ホーム')
  })

  it('ホームで戻るとタブナビは処理しない＝アプリが終了する', () => {
    // GO_BACK に null を返す＝navigation.canGoBack() が false＝Android の戻るが OS に流れる。
    // 既定の backBehavior='firstRoute' だと history に先頭タブ(時間割)が積まれ、
    // ホームで戻るたびに時間割へジャンプして終了できなかった。
    const router = makeRouter()
    const state = router.getInitialState(OPTS)
    expect(router.getStateForAction(state, { type: 'GO_BACK' }, OPTS)).toBeNull()
  })

  it('他タブで戻るとホームへ戻る', () => {
    const router = makeRouter()
    const initial = router.getInitialState(OPTS)
    const jumped = must(router.getStateForAction(initial, { type: 'JUMP_TO', payload: { name: '時間割' } }, OPTS))
    expect(jumped.routes[jumped.index].name).toBe('時間割')
    const back = must(router.getStateForAction(jumped, { type: 'GO_BACK' }, OPTS))
    expect(back.routes[back.index].name).toBe('ホーム')
  })

  it('先頭タブと初期タブが食い違う＝既定の firstRoute では成立しない構成である', () => {
    // この不一致こそがバグの原因。将来タブ順や初期タブを変えて一致した場合でも
    // backBehavior の明示は残す必要があるため、前提として記録しておく。
    expect(TAB_ROUTE_NAMES[0]).not.toBe(INITIAL_TAB)
    expect(TAB_BACK_BEHAVIOR).toBe('initialRoute')
  })
})

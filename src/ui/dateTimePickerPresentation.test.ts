import { describe, expect, it } from 'vitest'
import { pickerPresentation } from './dateTimePickerPresentation'

describe('pickerPresentation（日付ピッカーの出し方はOSで別物）', () => {
  it('Android はネイティブのダイアログ（レイアウトに何も足さない）', () => {
    expect(pickerPresentation('android')).toBe('nativeDialog')
  })

  it('iOS は自前モーダル＋spinner', () => {
    // iOS の DateTimePicker は **ビュー階層にインラインで埋め込まれる**。display 未指定だと
    // iOS 14+ は compact ＝日付チップが常駐し、押して初めてカレンダーが開く二度手間になる
    // （実機 206 の症状: 日付欄が2つ・下段が英語・もう一度押さないと開かない）。
    expect(pickerPresentation('ios')).toBe('modalSpinner')
  })

  it('未知のOSはダイアログ側へ倒す（インライン常駐を既定にしない）', () => {
    expect(pickerPresentation('web')).toBe('nativeDialog')
    expect(pickerPresentation('windows')).toBe('nativeDialog')
  })
})

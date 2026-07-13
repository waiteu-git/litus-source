/**
 * 非色トークン（余白・角丸・タイポ・影）。React Native 非依存＝vitestで検証可能。
 * 値の正典は Claude Design プロジェクトの styles.css。デジタル庁DADS基準（本文16px/行間150-170%、
 * 高密度面14px/130%）に沿う。fontSizeは7段に集約し、12.5/13.5の小数と虚偽の'800'ウェイトを廃する。
 */

type TypeStyle = { fontSize: number; lineHeight: number; fontWeight?: '400' | '500' | '700' }

type TypeKey = 'caption' | 'label' | 'dense' | 'body' | 'title' | 'screenTitle' | 'stat'

/**
 * タイポ7段。lineHeight は px（fontSize×倍率）で持つ（RNのlineHeightはpx指定のため）。
 * 各キーを一様に TypeStyle 型で宣言する（リテラル型のまま推論させると、キー毎に
 * fontWeight の有無が異なる union になり、`TYPE[k].fontWeight` のような動的アクセスが
 * strict モードで型エラーになるため）。
 */
export const TYPE: Record<TypeKey, TypeStyle> = {
  caption: { fontSize: 11, lineHeight: 14.3 },
  label: { fontSize: 12, lineHeight: 15.6, fontWeight: '500' },
  dense: { fontSize: 14, lineHeight: 18.2 },
  body: { fontSize: 16, lineHeight: 25.6 },
  title: { fontSize: 17, lineHeight: 23.8, fontWeight: '700' },
  screenTitle: { fontSize: 21, lineHeight: 28.35, fontWeight: '700' },
  stat: { fontSize: 24, lineHeight: 28.8, fontWeight: '700' },
}

/** 角丸。card=18 が標準カード、sheet=20 がボトムシート、pill=999 が全丸。 */
export const RADIUS = { sm: 8, md: 12, card: 18, sheet: 20, pill: 999 } as const

/** 余白。s4=14 は画面横パディングの標準（掲示2画面の左右28px二重掛けを是正する基準）。 */
export const SPACE = { s1: 4, s2: 8, s3: 12, s4: 14, s5: 16, s6: 24 } as const

type ShadowStyle = {
  shadowColor: string
  shadowOffset: { width: number; height: number }
  shadowOpacity: number
  shadowRadius: number
  elevation: number
}

/**
 * 影は3段。card は「影なし・境界線で浮かせる」ため null。
 * floating=タブバー/バナー、fab=浮遊ボタン。値の分裂（0.18〜0.4/8〜12）を2種に固定。
 */
export const SHADOW: { card: null; floating: ShadowStyle; fab: ShadowStyle } = {
  card: null,
  floating: {
    shadowColor: '#04281e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  fab: {
    shadowColor: '#04281e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
}

import Svg, { Line, Path } from 'react-native-svg'
import { celebrationColors, type CelebrationVariant } from '../theme.celebration'

/**
 * ホームのお祝いカードの絵＝フラスコと小さな星（化学を表す定番の図）。
 *
 * 出所（ブランド資産の規約）: **この図形はこのファイルの数値だけで決まる自前の幾何**（viewBox 200x200）。
 * 外部の画像・ロゴ・メダル・校章・写真・生成AIの出力は一切使っていない。フラスコ＝首の細い三角フラスコ
 * （首 x=88..112・口 y=40・肩から底まで台形・底の角は二次曲線で丸める）、液＝その下側、星＝4点の菱形の星。
 * 色は theme.celebration.ts の台帳（markOutline / markLiquid / markStarFill / markStarStroke）。
 * 装飾なので読み上げない。
 */
export function CelebrationMark({ variant, size }: { variant: CelebrationVariant; size: number }) {
  const c = celebrationColors(variant)
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" accessible={false} importantForAccessibility="no-hide-descendants">
      <Path d="M72 126 H128 L144 144 Q150 158 136 158 H64 Q50 158 56 144 Z" fill={c.markLiquid} />
      <Path
        d="M88 40 H112 V80 L144 142 Q152 158 136 158 H64 Q48 158 56 142 L88 80 Z"
        fill="none"
        stroke={c.markOutline}
        strokeWidth={7}
        strokeLinejoin="round"
      />
      <Line x1={84} y1={40} x2={116} y2={40} stroke={c.markOutline} strokeWidth={7} strokeLinecap="round" />
      <Path
        d="M156 42 L160 54 L172 58 L160 62 L156 74 L152 62 L140 58 L152 54 Z"
        fill={c.markStarFill}
        stroke={c.markStarStroke}
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </Svg>
  )
}

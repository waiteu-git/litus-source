import { useMemo, useRef, useState } from 'react'
import { Animated, PanResponder, Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from './Text'
import { useUi } from './screen'
import { DUR, EASE } from './motion'
import { SHADOW } from './scale'
import type { SectionLayoutOps, SectionMeta, SectionPref } from './sectionLayout'

/** 行の固定高さ（スロットのピッチ）。ドラッグ距離→挿入 index の換算に使う。 */
const ROW_H = 48

/**
 * セクション並び替えのドラッグ UI（ホーム/科目詳細で共用の汎用版・旧 HomeLayoutReorder）。
 * 各行のグリップ（≡）から縦ドラッグして順序を変更する。
 * 機構は素の PanResponder + Animated（新規依存なし・Carousel と同じ手法）。掴んだ行は指に追従し、
 * 他行は行高ぶんずれて挿入位置を示す。離すと確定スロットへ吸い込んでから onChange で確定する。
 * スクリーンリーダー向けにはグリップの accessibilityActions（上へ/下へ）で ops.move を提供する。
 * ドラッグ中は onDragActive(true) を通知し、親の ScrollView スクロールを止めてもらう。
 */
export default function SectionLayoutReorder<K extends string>({
  layout,
  meta,
  ops,
  onChange,
  onDragActive,
}: {
  layout: SectionPref<K>[]
  meta: Record<K, SectionMeta>
  ops: Pick<SectionLayoutOps<K>, 'move' | 'reorder' | 'toggle'>
  onChange: (next: SectionPref<K>[]) => void
  onDragActive: (active: boolean) => void
}) {
  const ui = useUi()

  // 各行の translateY（他行のずれ＋掴んだ行の指追従）。セクション数は固定だが、念のため長さ変化に追随する。
  const valsRef = useRef<Animated.Value[]>([])
  if (valsRef.current.length !== layout.length) {
    valsRef.current = layout.map(() => new Animated.Value(0))
  }
  const shifts = valsRef.current

  // ジェスチャのクロージャ陳腐化を避けるため、最新の layout / コールバックを ref で参照する。
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onDragActiveRef = useRef(onDragActive)
  onDragActiveRef.current = onDragActive

  // 掴み中の index（描画の持ち上げ用は state、ジェスチャ内参照は ref）。target は現在の挿入先。
  const [dragging, setDragging] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const targetRef = useRef(0)

  // 掴んだ行を確定スロットへ吸い込み → 全 translateY を 0 リセットしつつ順序を同一同期ブロックでコミット
  // （旧順への 1 フレームの戻り＝フラッシュを出さない）。
  function finishDrag() {
    const from = dragIndexRef.current
    if (from == null) return
    const to = targetRef.current
    const snap = (to - from) * ROW_H
    Animated.timing(shifts[from], {
      toValue: snap,
      duration: DUR.micro,
      easing: EASE.enter,
      // 指追従は per-frame setValue で駆動するため、同じ値に native/JS ドライバを混在させない
      // （数行の設定リストで性能は無関係・混在起因の描画不整合を確実に避ける）。
      useNativeDriver: false,
    }).start(() => {
      for (let i = 0; i < shifts.length; i++) shifts[i].setValue(0)
      if (to !== from) onChangeRef.current(ops.reorder(layoutRef.current, from, to))
      dragIndexRef.current = null
      setDragging(null)
      onDragActiveRef.current(false)
    })
  }

  // index ごとの PanResponder。ドラッグ中は DOM を並び替えない（translateY のみ）ため、
  // 「スロット i の行」に固定して問題ない（確定後は別セクションが i に来るが、その行の掴みとして正しい）。
  const responders = useMemo(
    () =>
      Array.from({ length: layout.length }, (_, i) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          // 掴んだら親 ScrollView に奪い返させない（縦スクロールとの競合を断つ）。
          onPanResponderTerminationRequest: () => false,
          onPanResponderGrant: () => {
            dragIndexRef.current = i
            targetRef.current = i
            shifts[i].setValue(0)
            setDragging(i)
            onDragActiveRef.current(true)
          },
          onPanResponderMove: (_, g) => {
            const from = dragIndexRef.current
            if (from == null) return
            shifts[from].setValue(g.dy)
            const n = layoutRef.current.length
            const target = Math.max(0, Math.min(n - 1, Math.round(from + g.dy / ROW_H)))
            if (target === targetRef.current) return
            targetRef.current = target
            // 他行を挿入位置に合わせて ±ROW_H へずらす（範囲外は 0 へ戻す）。
            for (let idx = 0; idx < n; idx++) {
              if (idx === from) continue
              let offset = 0
              if (from < target && idx > from && idx <= target) offset = -ROW_H
              else if (from > target && idx >= target && idx < from) offset = ROW_H
              Animated.timing(shifts[idx], {
                toValue: offset,
                duration: DUR.fast,
                easing: EASE.move,
                // 掴んだ行の setValue 駆動と同じ値プールを扱うため JS ドライバに統一（上のコメント参照）。
                useNativeDriver: false,
              }).start()
            }
          },
          onPanResponderRelease: finishDrag,
          onPanResponderTerminate: finishDrag,
        }),
      ),
    // 長さは実質固定。コールバック/値は ref 経由で最新参照するため依存は length のみ。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [layout.length],
  )

  function onGripA11yAction(key: K, e: AccessibilityActionEvent) {
    const name = e.nativeEvent.actionName
    if (name === 'moveUp') onChange(ops.move(layoutRef.current, key, -1))
    else if (name === 'moveDown') onChange(ops.move(layoutRef.current, key, 1))
  }

  return (
    <View>
      <Text style={[styles.note, { color: ui.labelColor }]}>
        グリップ（≡）を押しながら上下にドラッグして順番を変えられます。目のアイコンで表示/非表示を切り替えます。
      </Text>
      {layout.map((s, i) => {
        const m = meta[s.key]
        const isDragged = dragging === i
        return (
          <Animated.View
            key={s.key}
            style={[
              styles.row,
              {
                transform: [{ translateY: shifts[i] }, { scale: isDragged ? 1.02 : 1 }],
                zIndex: isDragged ? 2 : 1,
              },
              isDragged && [
                styles.rowLifted,
                { backgroundColor: ui.colors.cardBg, borderColor: ui.colors.cardBorder },
                SHADOW.floating,
              ],
            ]}
          >
            {i > 0 && !isDragged ? (
              <View style={[styles.divider, { backgroundColor: ui.dividerColor }]} pointerEvents="none" />
            ) : null}
            <View
              {...responders[i].panHandlers}
              style={styles.grip}
              accessibilityRole="adjustable"
              accessibilityLabel={`${m.label}の並び順`}
              accessibilityHint="ダブルタップして上下のアクションで移動できます"
              accessibilityActions={[
                { name: 'moveUp', label: '上へ' },
                { name: 'moveDown', label: '下へ' },
              ]}
              onAccessibilityAction={(e) => onGripA11yAction(s.key, e)}
            >
              <Ionicons name="reorder-two-outline" size={22} color={ui.chevron} />
            </View>
            <Text style={[styles.label, { color: s.enabled ? ui.valueColor : ui.subMuted }]} numberOfLines={1}>
              {m.label}
            </Text>
            {m.fixedOn ? (
              <View style={styles.tglBtn}>
                <Ionicons name="lock-closed" size={15} color={ui.chevron} />
              </View>
            ) : (
              <Pressable
                onPress={() => onChange(ops.toggle(layout, s.key))}
                hitSlop={6}
                style={styles.tglBtn}
                accessibilityRole="button"
                accessibilityLabel={`${m.label}を${s.enabled ? '非表示' : '表示'}`}
              >
                <Ionicons
                  name={s.enabled ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={s.enabled ? ui.accent : ui.subMuted}
                />
              </Pressable>
            )}
          </Animated.View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  note: { fontSize: 12, marginBottom: 6 },
  row: {
    height: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
  },
  // 掴んだ行の持ち上げ（面として浮く）。境界線＋影＋角丸で他行より前面に見せる。
  rowLifted: { borderWidth: 1, paddingHorizontal: 4 },
  // 高さに影響しない 1px 区切り線（ROW_H を一定に保つため absolute で描く）。
  divider: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  grip: { width: 40, height: ROW_H, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 14, minWidth: 0, paddingLeft: 2 },
  tglBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
})

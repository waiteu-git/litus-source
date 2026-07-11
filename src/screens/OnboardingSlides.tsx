import { useEffect, useRef, useState } from 'react'
import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS } from '../theme'
import { DUR, EASE, SHIFT } from '../ui/motion'

const SLIDES = [
  {
    icon: 'checkbox-outline' as const,
    title: '課題を自動で見張る',
    body: 'LETUSの課題と締切を自動で集めて一覧に。締切前にはリマインド通知が届きます。',
  },
  {
    icon: 'flash-outline' as const,
    title: '出席はワンタップ',
    body: 'CLASSのモバイル出席登録をアプリ内で完結。認証コードを入れて押すだけです。',
  },
  {
    icon: 'calendar-outline' as const,
    title: '時間割と通知',
    body: '時間割を取り込むと授業前に出席ナッジが届きます。次の画面でTUSアカウントにログインしてください（認証情報は保存しません）。',
  },
]

/** 初回起動のチュートリアル。横スワイプ3枚→「ログインへ進む」で onDone。スキップ可。 */
export default function OnboardingSlides({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets()
  const [page, setPage] = useState(0)
  const scrollRef = useRef<ScrollView>(null)
  const width = Dimensions.get('window').width
  const last = page >= SLIDES.length - 1

  function goNext() {
    if (last) {
      onDone()
      return
    }
    scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true })
  }

  return (
    <LinearGradient colors={[COLORS.gradTop, COLORS.gradBottom]} style={styles.root}>
      <Pressable style={[styles.skip, { top: insets.top + 10 }]} onPress={onDone}>
        <Text style={styles.skipText}>スキップ</Text>
      </Pressable>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {SLIDES.map((s, i) => (
          <Slide key={s.title} slide={s} width={width} active={i === page} />
        ))}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
        <Pressable style={styles.cta} onPress={goNext}>
          <Text style={styles.ctaText}>{last ? 'ログインへ進む' : '次へ'}</Text>
        </Pressable>
      </View>
    </LinearGradient>
  )
}

/**
 * 1枚のスライド。アクティブになると中身を fade(0→1)+scale(0.96→1) base で立ち上げ、
 * イラストだけ translateX(24→0) slow の軽いパララックスを重ねる。非アクティブ時は静止（覗いても崩れない）。
 */
function Slide({
  slide,
  width,
  active,
}: {
  slide: (typeof SLIDES)[number]
  width: number
  active: boolean
}) {
  const opacity = useRef(new Animated.Value(1)).current
  const scale = useRef(new Animated.Value(1)).current
  const illustX = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (active) {
      opacity.setValue(0)
      scale.setValue(0.96)
      illustX.setValue(SHIFT.large)
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: DUR.base, easing: EASE.enter, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: DUR.base, easing: EASE.enter, useNativeDriver: true }),
        Animated.timing(illustX, { toValue: 0, duration: DUR.slow, easing: EASE.enter, useNativeDriver: true }),
      ]).start()
    } else {
      opacity.setValue(1)
      scale.setValue(1)
      illustX.setValue(0)
    }
  }, [active, opacity, scale, illustX])

  return (
    <Animated.View style={[styles.slide, { width, opacity, transform: [{ scale }] }]}>
      <Animated.View style={[styles.iconBox, { transform: [{ translateX: illustX }] }]}>
        <Ionicons name={slide.icon} size={64} color={COLORS.white} />
      </Animated.View>
      <Text style={styles.title}>{slide.title}</Text>
      <Text style={styles.body}>{slide.body}</Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skip: { position: 'absolute', right: 18, zIndex: 2, padding: 6 },
  skipText: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  iconBox: {
    width: 128,
    height: 128,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: { color: COLORS.white, fontSize: 24, fontWeight: '700', marginBottom: 12 },
  body: { color: '#eafff7', fontSize: 15, lineHeight: 24, textAlign: 'center' },
  footer: { paddingHorizontal: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotOn: { backgroundColor: COLORS.white },
  cta: {
    height: 54,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: COLORS.emeraldDark, fontSize: 16, fontWeight: '700' },
})

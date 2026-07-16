import { useEffect, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { COLLECT_COURSE_PAGE_JS, DESKTOP_UA } from './injectedScripts'
import { computeCourseSignature, diffCourseSignature } from '../updates/courseUpdates'
import { selectCoursesToSnapshot } from '../updates/courseSnapshotWindow'
import { loadCourseSnapshots, saveCourseSnapshots } from '../storage/courseSnapshotStore'
import type { CourseSnapshotMap } from '../storage/courseSnapshotSerialize'
import { loadCourseMap } from '../storage/courseMapStore'
import { loadAllCourses } from '../storage/allCoursesStore'
import { loadTrackedCourses } from '../storage/trackedCoursesStore'
import { trackedCourseInfos } from '../updates/courseTracking'
import { publishCourseNews } from './publishCourseNews'
import type { CourseRunDiff } from '../updates/courseNews'

// 各コースページの読込がハングした場合の保険。
const PAGE_TIMEOUT_MS = 15000

/**
 * LETUSコース更新チェックの headless エンジン（旧 LetusSyncEngine の snapshots ステージを抽出・
 * 旧 UpdateCheckScreen の後継）。courseMap＋追跡コースのページを逐次巡回し、活動シグネチャの差分を
 * スナップショットへ保存→増分を LETUS新着（courseNews）へ転記する。
 * 鮮度TTL（COURSE_SNAPSHOT_TTL_MS）内に収集済みのコースはスキップ＝呼び出し頻度が高くても安い。
 * 巡回対象が無ければ即 onFinished。LETUSのみに触るため CLASS 収集（リース）とは競合しない。
 * 起動点: ①ホーム同期の LETUS フェーズ（LetusSyncEngine 内）②時間割の引っ張り更新（TimetableScreen）。
 */
export default function CourseUpdateEngine({
  onProgress,
  onFinished,
}: {
  onProgress?: (label: string) => void
  onFinished: () => void
}) {
  const webviewRef = useRef<WebView>(null)
  const [urls, setUrls] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)
  const snapshotsRef = useRef<CourseSnapshotMap>({})
  const savedRef = useRef(false)
  const finishedRef = useRef(false)
  // このrunで実巡回したコースの増分（LETUS新着への転記用。未巡回コースの保持中addedは含めない）。
  const runDiffsRef = useRef<CourseRunDiff[]>([])
  // コースURL→表示名（新着の文言用）。courseMap／追跡情報から逆引き。
  const courseNamesRef = useRef<Map<string, string>>(new Map())
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  function finish() {
    if (finishedRef.current) return
    finishedRef.current = true
    onFinishedRef.current()
  }

  // 巡回対象の選定: courseMap＋追跡コースを合流し、鮮度TTL内はスキップ。
  useEffect(() => {
    ;(async () => {
      const map = await loadCourseMap()
      snapshotsRef.current = await loadCourseSnapshots()
      for (const course of Object.values(map)) {
        if (!courseNamesRef.current.has(course.url)) courseNamesRef.current.set(course.url, course.name)
      }
      let trackedUrls: string[] = []
      try {
        const tracked = trackedCourseInfos(await loadAllCourses(), await loadTrackedCourses())
        trackedUrls = tracked.map((t) => t.url)
        for (const t of tracked) {
          if (t.name && !courseNamesRef.current.has(t.url)) courseNamesRef.current.set(t.url, t.name)
        }
      } catch {
        // 追跡情報の読込失敗は無視（courseMap のみ巡回）
      }
      const unique = [...new Set([...Object.values(map).map((c) => c.url), ...trackedUrls])]
      setUrls(selectCoursesToSnapshot(unique, snapshotsRef.current, new Date()))
      setIndex(0)
    })().catch(() => finish())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentUrl = urls?.[index]

  useEffect(() => {
    if (urls && currentUrl) onProgress?.(`コース内容を確認しています… ${Math.min(index + 1, urls.length)}/${urls.length}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls, index, currentUrl])

  // ページ読込ハングの保険。
  useEffect(() => {
    if (!currentUrl) return
    const t = setTimeout(() => setIndex((i) => i + 1), PAGE_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [currentUrl, index])

  function onPageMessage(data: string) {
    let payload: { type?: string; html?: string }
    try {
      payload = JSON.parse(data)
    } catch {
      setIndex((i) => i + 1)
      return
    }
    if (payload.type === 'coursepage' && typeof payload.html === 'string' && currentUrl) {
      const nextSig = computeCourseSignature(payload.html, currentUrl)
      const prev = snapshotsRef.current[currentUrl]
      const diff = prev ? diffCourseSignature(prev.activities, nextSig) : { added: [], removed: [] }
      snapshotsRef.current[currentUrl] = {
        activities: nextSig,
        collectedAt: new Date().toISOString(),
        added: diff.added,
        removed: diff.removed,
      }
      if (diff.added.length > 0) {
        runDiffsRef.current.push({
          url: currentUrl,
          name: courseNamesRef.current.get(currentUrl) ?? '',
          added: diff.added,
        })
      }
    }
    setIndex((i) => i + 1)
  }

  // 完走（巡回対象0件を含む）→ 保存してから LETUS新着へ転記して終了。
  useEffect(() => {
    if (urls === null || index < urls.length || savedRef.current) return
    savedRef.current = true
    if (urls.length === 0) {
      finish()
      return
    }
    ;(async () => {
      try {
        await saveCourseSnapshots(snapshotsRef.current)
        // LETUS新着への転記は**保存成功時のみ**。保存失敗時に転記すると差分基準が前進しないまま
        // 新着だけ記録され、既読(markCourseSeen)後の再巡回で同じ活動が再検出されてNEWが復活する。
        // 失敗時は次回runが同じ差分を再検出するので取りこぼしは無い。
        await publishCourseNews(runDiffsRef.current)
      } catch {
        // 保存失敗でも終了（既存スナップショットが使われる）
      }
      finish()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls, index])

  if (!currentUrl) return null
  return (
    <View style={styles.box}>
      <WebView
        key={currentUrl}
        ref={webviewRef}
        source={{ uri: currentUrl }}
        userAgent={DESKTOP_UA}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onLoadEnd={() => webviewRef.current?.injectJavaScript(COLLECT_COURSE_PAGE_JS)}
        onMessage={(e) => onPageMessage(e.nativeEvent.data)}
        style={styles.webview}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  box: { height: 1, opacity: 0 },
  webview: { height: 1, opacity: 0 },
})

// litus 純粋層（parsers/health/attendance）の名前付き export を1オブジェクトに集約して返す。
// litus repo 内に同居するため src を直接 import する（vendor 同期は不要・単一の真実）。
// これらは RN 非依存の純粋モジュールで、node-html-parser のみ litus root の node_modules から解決される。
export async function loadLitus() {
  const health = await import('../../../src/health/collectionHealth.ts')
  const signals = await import('../../../src/health/collectionSignals.ts')
  const maint = await import('../../../src/health/maintenanceWindow.ts')
  const bulletin = await import('../../../src/parsers/bulletin.ts')
  const timetable = await import('../../../src/parsers/timetable.ts')
  const letus = await import('../../../src/parsers/letus.ts')
  const letusCourses = await import('../../../src/parsers/letusCourses.ts')
  const letusLinks = await import('../../../src/parsers/letusLinks.ts')
  const classPage = await import('../../../src/attendance/classifyClassPage.ts')
  return {
    ...health,
    ...signals,
    ...maint,
    ...bulletin,
    ...timetable,
    ...letus,
    ...letusCourses,
    ...letusLinks,
    ...classPage,
  }
}

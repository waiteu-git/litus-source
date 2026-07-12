import { describe, it, expect } from 'vitest'
import { parseAttendanceStatsMessage } from './attendanceStatsMessage'

const tableHtml =
  '<div id="funcForm:jugyoKaisuTbl"><div class="scroll_div"><table><tbody>' +
  '<tr><td class="colSizeYobiJigen"><span title="月1">月1</span></td>' +
  '<td class="colSizeBetterLong">9973337基礎電気数学</td>' +
  '<td class="colSizeRate">91％</td>' +
  '<td class="colSizeFixed"><span class="syuketsuKbnMark">〇</span><p class="jugyoDate">04/13</p></td>' +
  '</tr></tbody></table></div></div>'

describe('parseAttendanceStatsMessage', () => {
  it('正常payloadをcoursesに', () => {
    const r = parseAttendanceStatsMessage(JSON.stringify({ type: 'attendanceStats', html: tableHtml }))
    expect(r.error).toBeNull()
    expect(r.courses).toHaveLength(1)
    expect(r.courses[0].courseCode).toBe('9973337')
  })
  it('壊れJSONはerror', () => {
    expect(parseAttendanceStatsMessage('{').error).not.toBeNull()
  })
  it('0件（未描画）はerror', () => {
    const r = parseAttendanceStatsMessage(JSON.stringify({ type: 'attendanceStats', html: '<div></div>' }))
    expect(r.courses).toHaveLength(0)
    expect(r.error).not.toBeNull()
  })
})

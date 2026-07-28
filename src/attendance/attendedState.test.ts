import { describe, expect, it } from 'vitest'
import { canRecordAttendance, isAttendedNow, resolveAttendedNow, mergeAttendedRecord, todayKey, withExpiredCodeCleared, type AttendedRecord } from './attendedState'

const rec = (over: Partial<AttendedRecord> = {}): AttendedRecord => ({
  date: '2026-07-07',
  courseName: '哲学',
  confirmWindow: '12:50〜14:30',
  code: '1234',
  ...over,
})

const at = (h: number, m: number) => new Date(2026, 6, 7, h, m) // 2026-07-07

describe('todayKey', () => {
  it('YYYY-MM-DD（ゼロ詰め）', () => {
    expect(todayKey(new Date(2026, 6, 7, 13, 0))).toBe('2026-07-07')
    expect(todayKey(new Date(2026, 0, 3))).toBe('2026-01-03')
  })
})

describe('isAttendedNow', () => {
  it('nullは常にfalse', () => {
    expect(isAttendedNow(null, at(13, 0))).toBe(false)
  })
  it('受付時間内は出席済み表示', () => {
    expect(isAttendedNow(rec(), at(13, 0))).toBe(true)
  })
  it('受付終了時刻を過ぎたらfalse', () => {
    expect(isAttendedNow(rec(), at(14, 31))).toBe(false)
  })
  it('日付が違えばfalse', () => {
    expect(isAttendedNow(rec({ date: '2026-07-06' }), at(13, 0))).toBe(false)
  })
  it('confirmWindowが無ければ当日中はtrue', () => {
    expect(isAttendedNow(rec({ confirmWindow: null }), at(23, 0))).toBe(true)
  })
})

describe('mergeAttendedRecord', () => {
  it('新しいコードがあればそのまま採用', () => {
    const prev = rec({ code: '1111' })
    const next = rec({ code: '2222' })
    expect(mergeAttendedRecord(prev, next).code).toBe('2222')
  })
  it('同一授業（同日・科目名/受付時間一致）なら空コードでも既存を引き継ぐ（再アクセスで消えない）', () => {
    const prev = rec({ code: '1234' })
    const next = rec({ code: '' })
    expect(mergeAttendedRecord(prev, next).code).toBe('1234')
  })
  it('別の授業（科目名・受付時間が違う）ならコードを引き継がない（前授業のコード誤表示を防ぐ）', () => {
    // 前のコマにアプリで出席(1234)→今のコマは別授業をPC出席(コード無)。
    const prev = rec({ courseName: '線形代数学', confirmWindow: '08:50〜09:20', code: '1234' })
    const next = rec({ courseName: '基礎電気数学', confirmWindow: '10:20〜12:00', code: '' })
    expect(mergeAttendedRecord(prev, next).code).toBe('')
  })
  it('日付が違えば引き継がない（別日の記録）', () => {
    const prev = rec({ date: '2026-07-06', code: '1234' })
    const next = rec({ date: '2026-07-07', code: '' })
    expect(mergeAttendedRecord(prev, next).code).toBe('')
  })
  it('既存が無ければ next をそのまま', () => {
    expect(mergeAttendedRecord(null, rec({ code: '' })).code).toBe('')
  })

  describe('classEndMin（授業終了までの延長）', () => {
    const r = () => rec({ confirmWindow: '08:50〜09:20' }) // 受付は9:20で終了
    it('受付終了後でも授業終了(分)までは出席済み', () => {
      // 授業は10:20(=620分)まで。受付終了(9:20)を過ぎた10:00でもtrue。
      expect(isAttendedNow(r(), at(10, 0), 620)).toBe(true)
    })
    it('授業終了を過ぎたらfalse', () => {
      expect(isAttendedNow(r(), at(10, 21), 620)).toBe(false)
    })
    it('classEndMinが無ければ従来どおり受付終了で切れる', () => {
      expect(isAttendedNow(r(), at(10, 0))).toBe(false)
    })
    it('受付終了が授業終了より遅ければ遅い方(受付)まで', () => {
      // 受付14:30まで・授業は13:00(=780)で終了 → 遅い方の14:30まで。
      expect(isAttendedNow(rec({ confirmWindow: '12:50〜14:30' }), at(14, 0), 780)).toBe(true)
      expect(isAttendedNow(rec({ confirmWindow: '12:50〜14:30' }), at(14, 31), 780)).toBe(false)
    })
  })
})

describe('canRecordAttendance', () => {
  it('科目名があれば記録してよい', () => {
    expect(canRecordAttendance('法学１', null)).toBe(true)
  })
  it('受付時間があれば記録してよい（科目名が引けなくても授業の文脈はある）', () => {
    expect(canRecordAttendance('', '12:50〜14:30')).toBe(true)
  })
  it('科目名も受付時間も無ければ記録しない（何に対する出席か特定できない）', () => {
    // これを記録すると isAttendedNow が「その日ずっと出席済み」を返し（ends.length===0）、
    // 後の本物の授業で出席フローが塞がれる（2026-07-17 実機で「（科目名不明）出席済み」が居座った）
    expect(canRecordAttendance('', null)).toBe(false)
    expect(canRecordAttendance('   ', null)).toBe(false)
  })
})

describe('isAttendedNow: 科目も受付時間も無い記録の危険性（回帰の番人）', () => {
  it('時刻情報が無い記録は当日ずっと true を返す＝だから canRecordAttendance で作らせない', () => {
    const rec = { date: todayKey(new Date('2026-07-17T09:00:00')), courseName: '', confirmWindow: null, code: '' }
    expect(isAttendedNow(rec, new Date('2026-07-17T23:59:00'))).toBe(true)
  })
})

describe('withExpiredCodeCleared（出席コードの期限切れ掃除・監査M-1）', () => {
  it('期限内は同じ参照を返す＝書き戻さない（コードは表示のため保持）', () => {
    const r = rec()
    expect(withExpiredCodeCleared(r, at(13, 0))).toBe(r)
    expect(r.code).toBe('1234')
  })

  it('受付終了後は code だけを空にする（date/courseName/confirmWindow は残す）', () => {
    const r = rec()
    const out = withExpiredCodeCleared(r, at(14, 31))
    expect(out).not.toBe(r)
    expect(out.code).toBe('')
    expect(out.date).toBe('2026-07-07')
    expect(out.courseName).toBe('哲学')
    expect(out.confirmWindow).toBe('12:50〜14:30')
    // 入力を受け取った記録自体は破壊しない（純粋関数）
    expect(r.code).toBe('1234')
  })

  it('「この授業は出席済み」の判定は掃除後も生きる', () => {
    const out = withExpiredCodeCleared(rec(), at(14, 31))
    // 翌日の判定に使う date と、当該コマ同定に使う confirmWindow が残っている
    expect(isAttendedNow(out, at(13, 0))).toBe(true)
  })

  it('授業終了までの延長中（classEndMin）は保持し、延長も過ぎたら消す', () => {
    const r = rec({ confirmWindow: '08:50〜09:20' }) // 受付は9:20で終了・授業は10:20(=620分)まで
    expect(withExpiredCodeCleared(r, at(10, 0), 620)).toBe(r)
    expect(withExpiredCodeCleared(r, at(10, 21), 620).code).toBe('')
  })

  it('confirmWindow が無い記録は当日いっぱい保持し、日付が変われば消す', () => {
    const r = rec({ confirmWindow: null })
    expect(withExpiredCodeCleared(r, at(23, 59))).toBe(r)
    expect(withExpiredCodeCleared(r, new Date(2026, 6, 8, 0, 1)).code).toBe('')
  })

  it('confirmWindow が壊れていても同じ扱い（当日いっぱい→翌日で消す）', () => {
    const r = rec({ confirmWindow: '受付時間は掲示を確認' })
    expect(withExpiredCodeCleared(r, at(23, 59))).toBe(r)
    expect(withExpiredCodeCleared(r, new Date(2026, 6, 8, 0, 1)).code).toBe('')
  })

  it('日付が違う（前日以前の）記録は時刻に関わらず消す', () => {
    expect(withExpiredCodeCleared(rec({ date: '2026-07-06' }), at(13, 0)).code).toBe('')
  })

  it('既に空コードなら同じ参照＝無駄な書き戻しをしない', () => {
    const r = rec({ code: '' })
    expect(withExpiredCodeCleared(r, at(14, 31))).toBe(r)
  })

  it('記録が無ければ null のまま', () => {
    expect(withExpiredCodeCleared(null, at(13, 0))).toBe(null)
  })

  it('不変条件: コードが空になる記録は必ず isAttendedNow=false＝出席済みカードが出ないので空文字は表示に流れない', () => {
    const cases: Array<[AttendedRecord, Date, number | null]> = [
      [rec(), at(13, 0), null],
      [rec(), at(14, 31), null],
      [rec({ confirmWindow: '08:50〜09:20' }), at(10, 0), 620],
      [rec({ confirmWindow: '08:50〜09:20' }), at(10, 21), 620],
      [rec({ confirmWindow: null }), at(23, 59), null],
      [rec({ date: '2026-07-06' }), at(13, 0), null],
      [rec({ confirmWindow: '壊れた窓' }), at(0, 1), null],
    ]
    for (const [r, now, endMin] of cases) {
      const out = withExpiredCodeCleared(r, now, endMin)
      if (out.code === '' && r.code !== '') expect(isAttendedNow(out, now, endMin)).toBe(false)
      if (isAttendedNow(r, now, endMin)) expect(out.code).toBe(r.code)
    }
  })
})

describe('resolveAttendedNow', () => {
  // 実機 2026-07-17: CLASSは attendSuc 無し＋リアペ待ちなのにアプリが「出席済み」を表示し、
  // リアペ提出画面が到達不能になった（AttendanceScreen の attended 分岐が先）。
  // データ全消去で正常化＝古いローカル記録が犯人と確定。CLASSの状態が正。
  it('CLASSが出席済みなら記録が無くても出席済み', () => {
    expect(resolveAttendedNow('attended', null, at(13, 0))).toBe(true)
  })

  it('reaction_pending はローカル記録より強い（出席していないことの明示）', () => {
    // 記録は「出席済み」と言っているが、CLASSは「まだ提出していない」と言っている
    expect(isAttendedNow(rec(), at(13, 0))).toBe(true)
    expect(resolveAttendedNow('reaction_pending', rec(), at(13, 0))).toBe(false)
  })

  it('reaction_pending なら記録が無い場合も当然false', () => {
    expect(resolveAttendedNow('reaction_pending', null, at(13, 0))).toBe(false)
  })

  it('CLASSが否定していない状態ではローカル記録を補助に使う（授業間の継続表示）', () => {
    expect(resolveAttendedNow('accepting', rec(), at(13, 0))).toBe(true)
    expect(resolveAttendedNow('none', rec(), at(13, 0))).toBe(true)
    expect(resolveAttendedNow(undefined, rec(), at(13, 0))).toBe(true)
  })

  it('記録が期限切れならCLASSが黙っていてもfalse', () => {
    expect(resolveAttendedNow(undefined, rec(), at(14, 31))).toBe(false)
  })

  it('classEndMin による延長は reaction_pending では効かない', () => {
    // 受付は14:30で閉じるが授業は16:00まで→通常は延長されるが、リアペ待ちなら出席済みにしない
    expect(isAttendedNow(rec(), at(15, 0), 16 * 60)).toBe(true)
    expect(resolveAttendedNow('reaction_pending', rec(), at(15, 0), 16 * 60)).toBe(false)
  })
})

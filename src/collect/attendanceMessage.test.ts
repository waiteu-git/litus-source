import { describe, expect, it } from 'vitest'
import { parseAttendanceMessage } from './attendanceMessage'

const msg = (o: Record<string, unknown>) => JSON.stringify({ type: 'attendance', ...o })

describe('parseAttendanceMessage', () => {
  it('受付なし: NONE文言 → status none・エラーなし', () => {
    const r = parseAttendanceMessage(msg({ text: '現在、出席確認中の履修授業はありません。' }))
    expect(r.status).toBe('none')
    expect(r.accepting).toBe(false)
    expect(r.error).toBeNull()
  })

  it('受付中(未提出): hasCodeInput → accepting・確認時間/残り抽出', () => {
    const text = '08:50〜10:20 化学1\n出席確認時間：08:50〜09:20\nあと6分50秒'
    const r = parseAttendanceMessage(msg({ text, courseName: '化学1', hasCodeInput: true, timeSum: 410 }))
    expect(r.status).toBe('accepting')
    expect(r.accepting).toBe(true)
    expect(r.courseName).toBe('化学1')
    expect(r.confirmWindow).toBe('08:50〜09:20')
    expect(r.remaining).toBe('あと6分50秒')
  })

  it('受付時間は signSize（label実測）を優先し本文が無くても取れる', () => {
    // 実DOMの signSize は全角コロン＋全角チルダ「出席確認時間：10:20～12:00」。
    const r = parseAttendanceMessage(
      msg({ text: '線形代数学１\nあと81分26秒', courseName: '線形代数学１', hasCodeInput: true, signSize: '出席確認時間：10:20～12:00', timeSum: 4908 }),
    )
    expect(r.status).toBe('accepting')
    expect(r.confirmWindow).toBe('10:20〜12:00')
  })

  it('出席済み: attendSuc → attended（本文が薄くても確定・cross-device）', () => {
    const text = '08:50〜10:20 化学1\n出席確認時間：08:50〜09:20\n出席確認終了\n出席'
    const r = parseAttendanceMessage(msg({ text, courseName: '化学1', attendSuc: true, signEnded: true, timeSum: -1 }))
    expect(r.status).toBe('attended')
    expect(r.accepting).toBe(false)
    expect(r.courseName).toBe('化学1')
    expect(r.confirmWindow).toBe('08:50〜09:20')
  })

  it('出席済みは hasCodeInput より優先（両立時はattended）', () => {
    const r = parseAttendanceMessage(msg({ text: '化学1\n出席確認時間：08:50〜09:20', attendSuc: true, hasCodeInput: true }))
    expect(r.status).toBe('attended')
  })

  it('受付終了・未提出: 科目あり・入力なし・signEnded → closed', () => {
    const text = '08:50〜10:20 化学1\n出席確認時間：08:50〜09:20\n出席確認終了'
    const r = parseAttendanceMessage(msg({ text, courseName: '化学1', hasCodeInput: false, signEnded: true }))
    expect(r.status).toBe('closed')
    expect(r.confirmWindow).toBe('08:50〜09:20')
  })

  it('timeSum<=0 でも受付終了とみなす', () => {
    const r = parseAttendanceMessage(msg({ text: '化学1\n出席確認時間：08:50〜09:20', hasCodeInput: false, timeSum: -1 }))
    expect(r.status).toBe('closed')
  })

  it('リアペ未提出: attendSuc無し＋未完了文言 → reaction_pending・確認時間/科目抽出', () => {
    // 実DOM①: コード送信後は verification 欄と「出席登録する」が消え、reactionMsg だけが残る。
    const text = '12:50〜14:30 法学１\n出席確認時間：12:50～14:30\n出席確認中\n出席登録は完了していません。\nリアクションペーパーを提出してください。'
    const r = parseAttendanceMessage(
      msg({
        text,
        courseName: '法学１',
        signSize: '出席確認時間：12:50～14:30',
        reactionMsg: '出席登録は完了していません。 リアクションペーパーを提出してください。',
      }),
    )
    expect(r.status).toBe('reaction_pending')
    expect(r.accepting).toBe(false)
    expect(r.courseName).toBe('法学１')
    expect(r.confirmWindow).toBe('12:50〜14:30')
    expect(r.error).toBeNull()
  })

  it('リアペ提出済み: attendSuc優先 → attended（reactionMsg提出済み文言では未完了扱いしない）', () => {
    // 実DOM③: attendSuc「出席」と reactionMsg「リアクションペーパー提出済み」が同時に付く。
    const r = parseAttendanceMessage(
      msg({ text: '出席確認中\n出席\nリアクションペーパー提出済み', attendSuc: true, reactionMsg: 'リアクションペーパー提出済み' }),
    )
    expect(r.status).toBe('attended')
  })

  it('reactionMsgが提出済み文言のみ（attendSuc無しの異常系）→ reaction_pendingにしない', () => {
    // .reactionMsg クラスは①③両方に付くため、クラス存在（=フィールド有無）でなく文言で判定する。
    const r = parseAttendanceMessage(msg({ text: 'リアクションペーパー提出済み', reactionMsg: 'リアクションペーパー提出済み' }))
    expect(r.status).not.toBe('reaction_pending')
  })

  it('受付終了後でもリアペ未完了文言があれば reaction_pending を優先（理由を見せる）', () => {
    const r = parseAttendanceMessage(
      msg({
        text: '出席確認時間：12:50～14:30\n出席確認終了\n出席登録は完了していません。',
        signSize: '出席確認時間：12:50～14:30',
        reactionMsg: '出席登録は完了していません。',
        signEnded: true,
        timeSum: -1,
      }),
    )
    expect(r.status).toBe('reaction_pending')
  })

  it('遷移中/判定不能: どの目印もない → unknown', () => {
    const r = parseAttendanceMessage(msg({ text: '読み込み中...' }))
    expect(r.status).toBe('unknown')
    expect(r.error).toBeNull()
  })

  it('本文が空（attendSucも無い）→ 読み取り失敗', () => {
    const r = parseAttendanceMessage(msg({ text: '   ' }))
    expect(r.status).toBe('unknown')
    expect(r.error).toBe('出席受付状況を読み取れませんでした')
  })

  it('JSON破損・非オブジェクト・type違いは解析エラー', () => {
    for (const raw of ['not-json', 'null', '42', '"x"', JSON.stringify({ type: 'timetable' })]) {
      const r = parseAttendanceMessage(raw)
      expect(r.status).toBe('unknown')
      expect(r.error).toBe('メッセージを解析できませんでした')
    }
  })
})

describe('リアペの任意提出（ボタンがあるなら書ける）', () => {
  it('リアペ必須・未提出は reaction_pending のまま（出席が塞がれている＝最優先で出す）', () => {
    const r = parseAttendanceMessage(
      msg({
        text: '12:50〜14:30 法学１\n出席確認中',
        reactionMsg: '出席登録は完了していません。 リアクションペーパーを提出してください。',
        hasReactionBtn: true,
      }),
    )
    expect(r.status).toBe('reaction_pending')
    expect(r.reactionAvailable).toBe(true)
  })
  it('受付中でリアペボタンがあれば、必須でなくても書ける（reactionAvailable=true・状態は accepting のまま）', () => {
    const r = parseAttendanceMessage(
      msg({ text: '12:50〜14:30 法学１\n出席確認中\n認証コード', hasCodeInput: true, hasReactionBtn: true }),
    )
    expect(r.status).toBe('accepting')
    expect(r.reactionAvailable).toBe(true)
  })
  // 🔴**状態でリアペを塞がない。** NONE_MARKER は2つの世界で同じ文言が出る:
  //   (a) 学期中・受付時間外＝履修授業は在り、リアペのフォームは開ける（前期中の実使用）
  //   (b) 休業期間・履修授業ゼロ＝開かない（2026-08-13 手動押下で確認）
  // ページに区別する材料が無いので予測できない。(b)だけを見て塞ぐと(a)＝学期中の提出を殺す。
  // 後期開始は9/11＝公開直後。**誤りの向きが非対称なので塞がない。**
  it('受付なし(none)でもリアペボタンが在れば書ける（状態からリアペ可否は予測できない）', () => {
    const r = parseAttendanceMessage(
      msg({ text: '出席確認中の履修授業はありません', hasReactionBtn: true }),
    )
    expect(r.status).toBe('none')
    expect(r.reactionAvailable).toBe(true)
  })
  // ⚠status は名指しで固定する。最初 `not.toBe('none')` で書いたら実際には 'unknown' を通っており、
  // 守りたい 'closed' を1mmも守れていなかった（時限表示が無いと closed へ落ちない）。
  it('受付終了(closed)でも書ける', () => {
    const r = parseAttendanceMessage(
      msg({ text: '08:50〜10:20 化学1\n出席確認時間：08:50〜09:20\n出席確認終了', signEnded: true, hasReactionBtn: true }),
    )
    expect(r.status).toBe('closed')
    expect(r.reactionAvailable).toBe(true)
  })
  it('リアペボタンが無い授業は書けない（reactionAvailable=false）', () => {
    const r = parseAttendanceMessage(
      msg({ text: '12:50〜14:30 法学１\n出席確認中\n認証コード', hasCodeInput: true }),
    )
    expect(r.status).toBe('accepting')
    expect(r.reactionAvailable).toBe(false)
  })
  it('提出済みでも書ける（CLASSは再提出を許す＝「リアクションペーパー確認」から編集・再提出できる）', () => {
    const r = parseAttendanceMessage(
      msg({
        text: '12:50〜14:30 法学１\n出席確認中\n出席',
        attendSuc: true,
        reactionMsg: 'リアクションペーパー提出済み',
        hasReactionBtn: true,
      }),
    )
    expect(r.status).toBe('attended')
    expect(r.reactionAvailable).toBe(true)
    expect(r.reactionSubmitted).toBe(true)
  })
  it('未提出なら reactionSubmitted=false', () => {
    const r = parseAttendanceMessage(
      msg({ text: '12:50〜14:30 法学１\n出席確認中\n認証コード', hasCodeInput: true, hasReactionBtn: true, reactionMsg: 'リアクションペーパー未提出' }),
    )
    expect(r.reactionAvailable).toBe(true)
    expect(r.reactionSubmitted).toBe(false)
  })
  it('出席済みでも未提出のリアペボタンがあれば書ける', () => {
    const r = parseAttendanceMessage(
      msg({ text: '12:50〜14:30 法学１\n出席', attendSuc: true, reactionMsg: 'リアクションペーパー未提出', hasReactionBtn: true }),
    )
    expect(r.status).toBe('attended')
    expect(r.reactionAvailable).toBe(true)
  })
})

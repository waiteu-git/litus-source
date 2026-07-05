import { parse } from 'node-html-parser'

describe('scaffold smoke', () => {
  it('node-html-parser querySelector works', () => {
    const root = parse('<div class="a"><span>hi</span></div>')
    expect(root.querySelector('.a span')?.text).toBe('hi')
  })
})

/**
 * buildRecallNotify 纯函数单测（issue #19 撤回终态上报）
 *
 * 覆盖规格（plan-recall-event §一）语义决策表全部六场景的 payload 组装：
 * 组装与发送分离，五处接线点的调用时机由 tests/client/recall-node.test.ts
 * 组件级用例钉（含 STALE 不上报——纯函数层无 STALE outcome 分支，类型即守卫）。
 * 本文件是 tests/unit（纯 JS）：不写 TS 语法，类型面由 tests/types 钉。
 */

import { describe, it, expect } from 'vitest'
import { buildRecallNotify } from '../../src/client/util.js'

const BASE = { sessionId: 's1', messageId: 'm1', scope: 'both' }

describe('buildRecallNotify：规格 §一 语义决策表六场景', () => {
  it('场景 1 execute 成功 + fork 成功 → complete（chatReverted:true、childSessionId）', () => {
    const p = buildRecallNotify(BASE, {
      outcome: 'complete', cutSeq: 7, childSessionId: 'child-1',
      count: 3, chatReverted: true, archiveRequested: true,
    })
    expect(p).toEqual({
      status: 'complete', sessionId: 's1', messageId: 'm1', scope: 'both',
      cutSeq: 7, childSessionId: 'child-1', count: 3,
      chatReverted: true, archiveRequested: true,
    })
  })

  it('场景 2 execute 成功 + cutSeq null（纯文件回退）→ complete（chatReverted:false、childSessionId:null）', () => {
    const p = buildRecallNotify(BASE, {
      outcome: 'complete', cutSeq: null, childSessionId: null,
      count: 2, chatReverted: false, archiveRequested: false,
    })
    expect(p.status).toBe('complete')
    expect(p.chatReverted).toBe(false)
    expect(p.childSessionId).toBeNull()
    expect(p.cutSeq).toBeNull()
  })

  it('场景 3 execute 成功 + fork 抛错/返空 → failed(stage:fork)，无 childSessionId 字段', () => {
    for (const error of ['fork boom', 'no child']) {
      const p = buildRecallNotify(BASE, { outcome: 'fork-failed', cutSeq: 7, error })
      expect(p.status).toBe('failed')
      expect(p.stage).toBe('fork')
      expect(p.error).toBe(error)
      expect(p.cutSeq).toBe(7)
      expect('childSessionId' in p).toBe(false)
    }
  })

  it('场景 4 execute 返 ok:false（非 STALE）→ failed(stage:execute) 且 code 透传', () => {
    const p = buildRecallNotify(BASE, { outcome: 'execute-rejected', cutSeq: 7, code: 'AGENT_BUSY', error: 'busy' })
    expect(p.status).toBe('failed')
    expect(p.stage).toBe('execute')
    expect(p.code).toBe('AGENT_BUSY')
    expect(p.error).toBe('busy')
  })

  it('场景 5 execute 抛异常 → failed(stage:execute)，cutSeq 为 client 已知切点', () => {
    const p = buildRecallNotify(BASE, { outcome: 'execute-threw', cutSeq: null, error: 'network down' })
    expect(p.status).toBe('failed')
    expect(p.stage).toBe('execute')
    expect(p.error).toBe('network down')
    expect(p.cutSeq).toBeNull()
    expect('code' in p).toBe(false)
  })

  it('场景 6 STALE 中间态不上报：outcome 无该分支（类型守卫），接线层以提前 return 保证——此处钉四种合法 outcome 恰好映射两种终态 status', () => {
    const outcomes = [
      { outcome: 'complete', cutSeq: null, childSessionId: null, count: 0, chatReverted: false, archiveRequested: false },
      { outcome: 'execute-rejected', cutSeq: null, code: 'X', error: 'e' },
      { outcome: 'execute-threw', cutSeq: null, error: 'e' },
      { outcome: 'fork-failed', cutSeq: null, error: 'e' },
    ]
    const statuses = outcomes.map((o) => buildRecallNotify(BASE, o).status)
    expect(statuses).toEqual(['complete', 'failed', 'failed', 'failed'])
  })
})

describe('buildRecallNotify：字段兜底与 scope 透传', () => {
  it('session-only scope 透传（session-only 撤回的终态语义）', () => {
    const p = buildRecallNotify({ sessionId: 's1', messageId: 'm1', scope: 'session-only' }, { outcome: 'complete', cutSeq: 5, childSessionId: 'c', count: 0, chatReverted: true, archiveRequested: false })
    expect(p.scope).toBe('session-only')
    expect(p.count).toBe(0)
  })

  it('execute-rejected 无 code 时不带 code 键（host 端按缺省处理）', () => {
    const p = buildRecallNotify(BASE, { outcome: 'execute-rejected', cutSeq: null, error: 'no snapshot' })
    expect('code' in p).toBe(false)
  })
})

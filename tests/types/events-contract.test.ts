// 编译期契约断言（tsc --noEmit 消费）：撤回终态事件契约（src/types/events.ts，
// issue #19）。事件名与 payload 形状是对外公共契约——本文件钉「漂移即红」，
// 语义决策（六场景发什么）由 routes-core notify 端点单测钉。
import { RECALL_EVENT_COMPLETE, RECALL_EVENT_FAILED, RECALL_EVENT_VERSION } from '../../src/types/events.js'
import type { RecallCompleteEvent, RecallFailedEvent } from '../../src/types/events.js'

// 事件名是 cordis 字符串寻址键，漂移即下游监听静默失联——字面量类型钉死
const _complete: 'dsh-recall/complete' = RECALL_EVENT_COMPLETE
const _failed: 'dsh-recall/failed' = RECALL_EVENT_FAILED
// 首发版本钉 1：additive 演进不动它，破坏性变更走 major 且升 2（下游分流依据）
const _version: 1 = RECALL_EVENT_VERSION

// payload 组装形状（host notify 端点的构造目标）：缺字段/多字段/类型漂移即红
const _completePayload: RecallCompleteEvent = {
  version: 1,
  sessionId: 's',
  childSessionId: 'c',
  scope: 'both',
  cutSeq: 3,
  messageId: 'm',
  root: null,
  count: 0,
  chatReverted: true,
  archiveRequested: true,
  time: 0,
}
const _failedPayload: RecallFailedEvent = {
  version: 1,
  stage: 'fork',
  sessionId: 's',
  messageId: 'm',
  scope: 'session-only',
  cutSeq: null,
  root: null,
  error: 'x',
  time: 0,
}

// host notify 端点 ↔ RecallNotifyResponse 双向绑定（api-contracts 同款套路）：
// 端点改返回形状或类型漂移任一方向，此处即编译报错
import type { RecallNotifyResponse } from '../../src/types/api.js'
import type { createRoutesCore } from '../../src/host/routes-core.js'

type CoreHandlers = ReturnType<typeof createRoutesCore>
type Actual<T> = T extends (...args: any[]) => infer R ? Awaited<R> : never
const _notifyH2C: RecallNotifyResponse = null as unknown as Actual<CoreHandlers['notify']>
const _notifyC2H: Actual<CoreHandlers['notify']> = null as unknown as RecallNotifyResponse

// host 本地事件名常量（build-host 转译覆盖不到 types/，见 routes-core 注释）
// 与契约常量双向赋值：任何一侧改名即红——单一事实源在编译期维持
import { RECALL_EVENT_COMPLETE_HOST, RECALL_EVENT_FAILED_HOST } from '../../src/host/routes-core.js'
const _hostNameComplete: typeof RECALL_EVENT_COMPLETE = RECALL_EVENT_COMPLETE_HOST
const _hostNameComplete2: typeof RECALL_EVENT_COMPLETE_HOST = RECALL_EVENT_COMPLETE
const _hostNameFailed: typeof RECALL_EVENT_FAILED = RECALL_EVENT_FAILED_HOST
const _hostNameFailed2: typeof RECALL_EVENT_FAILED_HOST = RECALL_EVENT_FAILED

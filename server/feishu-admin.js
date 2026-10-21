'use strict';
function renderFeishuStatus() {
  return `<details id="feishuStatusPanel" style="margin:0 0 16px;padding:12px;border:1px solid var(--line);border-radius:9px;background:#fff"><summary>飞书通知与同步 / Feishu</summary><p id="feishuStatusText" role="status">展开查看通知与同步状态</p><div class="actions"><button type="button" class="btn" id="feishuRefresh">刷新状态</button><button type="button" class="btn" id="feishuReconcile">全量对账</button><input id="feishuRetryRef" aria-label="报名编号或任务ID" placeholder="报名编号或失败任务ID" style="padding:8px"><button type="button" class="btn" id="feishuRetry">重试失败任务</button></div><pre id="feishuErrors" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details>`;
}
module.exports={renderFeishuStatus};

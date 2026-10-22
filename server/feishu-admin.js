'use strict';
function renderFeishuStatus() {
  return `<details id="feishuStatusPanel" class="feishu-status-panel"><summary><span>Feishu notifications and sync</span></summary><div class="feishu-status-content"><p id="feishuStatusText" role="status">Loading notification and sync status…</p><div class="actions"><button type="button" class="btn" id="feishuRefreshStatus">Refresh status</button><button type="button" class="btn" id="feishuReconcile">Full reconciliation</button><input id="feishuRetryRef" aria-label="Registration reference or failed job ID" placeholder="Registration reference or failed job ID" style="padding:8px"><button type="button" class="btn" id="feishuRetry">Retry failed tasks</button></div><pre id="feishuErrors" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></div></details>`;
}
module.exports={renderFeishuStatus};

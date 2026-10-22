'use strict';

// Only interface labels are translated. Registration data and API values remain unchanged.
const translations = {
  'Feishu notifications': ['Feishu notifications', '飞书通知'],
  'Email notifications': ['Email notifications', '邮件通知'],
  'Feishu notifications and sync': ['Feishu notifications and sync', '飞书通知与同步'],
  'Feishu bot': ['Feishu bot', '飞书机器人'],
  'Table sync': ['Table sync', '表格同步'],
  'Notification channel': ['Notification channel', '通知渠道'],
  'Notification type': ['Notification type', '通知类型'],
  'Recipient / target': ['Recipient / target', '收件人 / 发送目标'],
  'Subject': ['Subject', '主题'],
  'Triggered at': ['Triggered at', '触发时间'],
  'Sent / synced at': ['Sent / synced at', '发送 / 同步时间'],
  'Attempts this cycle': ['Attempts this cycle', '本轮尝试次数'],
  'Pending notification': ['Pending notification', '待发送'],
  'Accepted by channel': ['Accepted by channel', '发送成功（渠道已接受）'],
  'Synced': ['Synced', '同步成功'],
  'Blocked': ['Blocked', '配置阻塞'],
  'Failed / blocked': ['Failed / blocked', '失败 / 阻塞'],
  'All types': ['All types', '全部类型'],
  'From date': ['From date', '开始日期'],
  'To date': ['To date', '结束日期'],
  'Search notifications': ['Search notifications', '搜索姓名、邮箱或报名编号'],
  'Notification details': ['Notification details', '通知详情'],
  'Retry failed notification': ['Retry failed notification', '重试失败通知'],
  'No notification records': ['No notification records', '暂无通知记录'],
  'Details': ['Details', '详情'],
  'Last success': ['Last success', '最近成功时间'],
  'Email configured · SMTP acceptance does not confirm delivery or reading': ['Email configured · SMTP acceptance does not confirm delivery or reading', '邮件已配置 · 发送成功表示 SMTP 已接受，不代表送达或已读'],
  'Email sending is not configured': ['Email sending is not configured', '邮件发送尚未配置'],
  'Notification and table sync states are tracked separately': ['Notification and table sync states are tracked separately', '通知发送与表格同步分别记录状态'],
  'Loading notifications…': ['Loading notifications…', '正在加载通知记录…'],
  'Unable to load notifications': ['Unable to load notifications', '加载通知记录失败'],
  'Notification queued for retry': ['Notification queued for retry', '通知已加入重试队列'],
  'Registration email': ['Registration email', '报名确认邮件'],
  'Materials email': ['Materials email', '资料补交邮件'],
  'New registration': ['New registration', '新报名通知'],
  'Materials uploaded': ['Materials uploaded', '资料上传通知'],
  'Next attempt': ['Next attempt', '下次尝试时间'],
  'Error reason': ['Error reason', '错误原因'],
  'Desired version': ['Desired version', '目标版本'],
  'Synced version': ['Synced version', '已同步版本'],
  'CC': ['CC', '抄送'],
  'Notification content': ['Notification content', '通知内容'],
  'Manual retry history': ['Manual retry history', '手动重试记录'],
  'Attempts before retry': ['Attempts before retry', '重试前尝试次数'],
  'No manual retries recorded': ['No manual retries recorded', '暂无手动重试记录'],
  'View registration': ['View registration', '查看报名'],
  'Historical content is unavailable': ['Historical content is unavailable', '历史正文未保存，无法查看'],
  'Unable to decrypt saved email content': ['Unable to decrypt saved email content', '无法解密已保存的邮件正文，请检查加密密钥'],
  'Sync records reflect the current sync state': ['Sync records reflect the current sync state', '同步记录展示当前同步状态'],
  'Unknown notification channel': ['Unknown notification channel', '未知通知渠道'],
  'Invalid notification status': ['Invalid notification status', '通知状态无效'],
  'Invalid date range': ['Invalid date range', '日期范围无效'],
  'Invalid notification ID': ['Invalid notification ID', '通知编号无效'],
  'Notification not found': ['Notification not found', '未找到通知记录'],
  'Only failed notifications can be retried': ['Only failed notifications can be retried', '只能重试失败的通知'],
  'Original email payload is unavailable': ['Original email payload is unavailable', '原始邮件发送内容不可用，无法重试'],
  'Refresh status': ['Refresh status', '刷新状态'],
  'Full reconciliation': ['Full reconciliation', '全量对账'],
  'Retry failed tasks': ['Retry failed tasks', '重试失败任务'],
  'Registration reference or failed job ID': ['Registration reference or failed job ID', '报名编号或失败任务 ID'],
  'Enter a registration reference or failed job ID': ['Enter a registration reference or failed job ID', '请输入报名编号或失败任务 ID'],
  'Loading notification and sync status…': ['Loading notification and sync status…', '正在加载通知与同步状态…'],
  'Notifications: {enabled} ({configured}) · Pending {pending} · Failed {failed}': ['Notifications: {enabled} ({configured}) · Pending {pending} · Failed {failed}', '通知：{enabled}（{configured}）· 待处理 {pending} · 失败 {failed}'],
  'Table: {enabled} ({configured}) · Pending {pending} · Failed {failed}': ['Table: {enabled} ({configured}) · Pending {pending} · Failed {failed}', '表格：{enabled}（{configured}）· 待同步 {pending} · 失败 {failed}'],
  'Enabled': ['Enabled', '已启用'],
  'Paused': ['Paused', '已暂停'],
  'Configured': ['Configured', '已配置'],
  'Configuration incomplete': ['Configuration incomplete', '配置未完成'],
  'Last reconciliation (Beijing time): {time}{queued}{error}': ['Last reconciliation (Beijing time): {time}{queued}{error}', '最近对账（北京时间）：{time}{queued}{error}'],
  'Not yet run': ['Not yet run', '尚未执行'],
  ' (queued)': [' (queued)', '（已排队）'],
  'Oldest pending (Beijing time): {time}': ['Oldest pending (Beijing time): {time}', '最早待处理时间（北京时间）：{time}'],
  'Last successful sync (Beijing time): {time}': ['Last successful sync (Beijing time): {time}', '最近成功同步（北京时间）：{time}'],
  'Request failed': ['Request failed', '请求失败'],
  'Service temporarily unavailable': ['Service temporarily unavailable', '服务暂时不可用，请稍后重试'],
  'Failed to fetch': ['Failed to fetch', '网络请求失败，请检查连接后重试'],
  'Conference management': ['Conference management', '大会管理'],
  'Conference 2026': ['Conference 2026', '2026 年大会'],
  'Administrator': ['Administrator', '管理员'],
  'Sign out': ['Sign out', '退出登录'],
  'Toggle navigation': ['Toggle navigation', '展开或收起导航'],
  'Close navigation': ['Close navigation', '关闭导航'],
  "手动上传嘉宾肖像": ["Upload speaker portrait","手动上传嘉宾肖像"],
  "手动上传机构标识": ["Upload organisation logo","手动上传机构标识"],
  "正在上传…": ["Uploading…","正在上传…"],
  "管理员手动上传": ["Uploaded by administrator","管理员手动上传"],
  "未填写展示信息": ["Display details not filled in","未填写展示信息"],
  "可从左侧选择已审核资料，或手动上传图片加入右侧展示草稿。填写展示信息并调整顺序后，保存才更新官网。": ["Select approved materials on the left or upload images to the showcase draft on the right. Fill in display details and arrange the cards, then save to update the website.","可从左侧选择已审核资料，或手动上传图片加入右侧展示草稿。填写展示信息并调整顺序后，保存才更新官网。"],
  "图片已加入展示草稿，请填写展示信息并保存后更新官网。": ["Image added to the draft. Fill in display details and save to update the website.","图片已加入展示草稿，请填写展示信息并保存后更新官网。"],
  "图片未能加入展示草稿，请重试上传": ["Unable to add the image to the draft. Please upload it again.","图片未能加入展示草稿，请重试上传"],
  "A public name is required for manual portraits": ["A public name is required for manual portraits","请填写手动上传嘉宾的公开姓名"],
  "A public company name is required for manual logos": ["A public company name is required for manual logos","请填写手动上传标识的公开机构名称"],
  "调整图片": ["Adjust image","调整图片"],
  "头像 · 固定 5:6": ["Portrait · Fixed 5:6","头像 · 固定 5:6"],
  "Logo · 固定 5:3": ["Logo · Fixed 5:3","Logo · 固定 5:3"],
  "拖动矩形框调整位置，拖动四角等比例缩放；框内就是官网展示范围。": ["Drag the frame to reposition it and drag its corners to resize at a fixed ratio. The frame defines the website image.","拖动矩形框调整位置，拖动四角等比例缩放；框内就是官网展示范围。"],
  "裁剪框，方向键移动，缩放滑块调整大小": ["Crop frame: use arrow keys to move and the zoom slider to resize","裁剪框，方向键移动，缩放滑块调整大小"],
  "官网展示预览": ["Website preview","官网展示预览"],
  "裁剪比例固定，可调整位置和大小": ["Fixed crop ratio; adjust position and size","裁剪比例固定，可调整位置和大小"],
  "原图": ["Original image","原图"],
  "缩放": ["Zoom","缩放"],
  "重置取景": ["Reset crop","重置取景"],
  "应用后进入草稿，保存展示柜后才更新官网。": ["Apply to your draft, then save the showcase to update the website.","应用后进入草稿，保存展示柜后才更新官网。"],
  "应用取景": ["Apply crop","应用取景"],
  "Invalid crop position or zoom": ["Invalid crop position or zoom","裁剪位置或缩放倍数无效"],
  "Refresh registration before saving.": ["Refresh registration before saving.","请刷新报名信息后再保存。"],
  "Registration changed; refresh before saving.": ["Registration changed; refresh before saving.","报名信息已更新，请刷新后再保存。"],
  "The material changed; refresh before reviewing": ["The material changed; refresh before reviewing","资料已更新，请刷新后重新审核。"],
  "Admission approval and publication consent are required": ["Admission approval and publication consent are required","请先通过报名资格审核，并确认已有对应展示授权。"],
  "This organisation already has a published logo. Unpublish it before publishing another registration.": ["This organisation already has a published logo. Unpublish it before publishing another registration.","该机构已有发布的 Logo，请先将原记录下架，再发布另一份报名的 Logo。"],
  "Supplement email is not configured": ["Supplement email is not configured","补交邮件尚未配置。"],
  "Supplement email could not be queued": ["Supplement email could not be queued","补交邮件未能加入发送队列。"],
  "Materials are not configured": ["Materials are not configured","资料功能尚未配置。"],
  "Database is unavailable.": ["Database is unavailable.","数据库暂时不可用，请稍后重试。"],
  "Sending": ["Sending","正在发送"],
  '上一页':['Previous','上一页'], '下一页':['Next','下一页'],
  '资料邮件已加入发送队列':['Materials email queued','资料邮件已加入发送队列'],
  '邮件未发送，请检查邮件配置':['Email not sent; check mail configuration','邮件未发送，请检查邮件配置'],
  'Queued':['Queued','排队发送中'], 'Not configured':['Not configured','未配置'], 'Sent':['Sent','已发送'], 'Failed':['Failed','发送失败'],
  'Registration Operations · 报名管理': ['Registration Operations', '报名管理'],
  'MySQL is the source of truth · 删除采用软删除，可随时恢复': ['MySQL is the source of truth · Deleted registrations can be restored', '数据保存在 MySQL · 删除采用软删除，可随时恢复'],
  'Active Registrations': ['Active Registrations', '有效报名'],
  'Deleted / 回收站': ['Deleted', '回收站'], 'VIP Codes': ['VIP Codes', 'VIP 码管理'],
  'Materials / 资料审核': ['Materials', '资料审核'], 'Materials / 资料': ['Materials', '资料'],
  'Pricing / 价格设置': ['Pricing', '价格设置'],
  'Registration Pricing · 报名价格设置': ['Registration Pricing', '报名价格设置'],
  'Conference registration pricing · 竖向为报名身份，横向为参会方式': ['Conference registration pricing · Rows: identities, Columns: options', '大会报名价格设置 · 竖向为报名身份，横向为参会方式'],
  'Back to Registrations': ['Back to Registrations', '返回报名管理'],
  'Save Prices': ['Save Prices', '保存价格'],
  'Saving…': ['Saving…', '正在保存…'],
  'Reset to Defaults': ['Reset to Defaults', '恢复默认'],
  'Registration Identity / 报名身份': ['Registration Identity', '报名身份'],
  'Delegate Pass': ['Delegate Pass', '参会通行证'],
  'Speaking Package': ['Speaking Package', '演讲套餐'],
  'Panel / Roundtable Package': ['Panel / Roundtable Package', '小组讨论 / 圆桌套餐'],
  '1-on-1 LP Matchmaking Package': ['1-on-1 LP Matchmaking Package', '一对一 LP 对接套餐'],
  'Limited Partner (LP)': ['Limited Partner (LP)', '有限合伙人（LP）'],
  'LP CLUB Member': ['LP CLUB Member', 'LP CLUB 会员'],
  'General Partner (GP)': ['General Partner (GP)', '普通合伙人（GP）'],
  'Asset Management': ['Asset Management', '资产管理'],
  'Standard': ['Standard', '标准报名'],
  'Complimentary': ['Complimentary', '免费/受邀'],
  'Complimentary / By invitation': ['Complimentary / By invitation', '免费 / 受邀参会'],
  'Prices saved successfully': ['Prices saved successfully', '价格设置已成功保存'],
  'Reset to default prices successfully': ['Reset to default prices successfully', '已恢复默认价格'],
  'Loaded pricing configuration': ['Loaded pricing configuration', '已加载价格设置'],
  'Failed to load pricing': ['Failed to load pricing', '价格设置加载失败'],
  'Failed to save prices': ['Failed to save prices', '价格设置保存失败'],
  'Failed to reset prices': ['Failed to reset prices', '恢复默认价格失败'],
  'Refresh pricing before saving.': ['Refresh pricing before saving.', '请刷新价格设置后再保存。'],
  'Registration pricing is not configured.': ['Registration pricing is not configured.', '报名价格尚未配置。'],
  'Registration pricing configuration is invalid.': ['Registration pricing configuration is invalid.', '报名价格配置无效。'],
  'Reset all prices to the initial base prices?': ['Reset all prices to the initial base prices?', '是否将所有报名价格恢复为默认基准价格？'],
  'Price must be a non-negative integer': ['Price must be a non-negative integer', '价格必须为非负整数'],
  'Pricing is loading. Please wait.': ['Pricing is loading. Please wait.', '价格正在加载，请稍候。'],
  'Pricing was changed by another administrator. Refresh before saving.': ['Pricing was changed by another administrator. Refresh before saving.', '价格已被其他管理员修改，请刷新后再保存。'],
  'Discard unsaved price changes?': ['Discard unsaved price changes?', '是否放弃尚未保存的价格修改？'],
  'Unsaved changes': ['Unsaved changes', '未保存的修改'],
  'Total Packages': ['Total Packages', '套餐总数'],
  'Identities': ['Identities', '报名身份'],
  'Participation Options': ['Participation Options', '参会方式'],
  'Complimentary Packages': ['Complimentary Packages', '免费套餐'],
  'Paid Packages': ['Paid Packages', '付费套餐'],
  'Review materials / 审核资料 →': ['Review materials →', '审核资料 →'],
  'Export CSV': ['Export CSV', '导出 CSV'], 'Refresh': ['Refresh', '刷新'],
  'All statuses': ['All statuses', '全部状态'], 'All packages': ['All packages', '全部套餐'],
  'Search name, company, email or reference': ['Search name, company, email or reference', '搜索姓名、机构、邮箱或报名编号'],
  'Operations sections': ['Operations sections', '管理功能'], 'Registration': ['Registration', '报名信息'],
  'Reference': ['Reference', '报名编号'], 'Status': ['Status', '状态'], 'Submitted': ['Submitted', '提交时间'],
  'Name': ['Name', '姓名'], 'Company': ['Company', '机构'], 'Title': ['Title', '职位'],
  'Email': ['Email', '邮箱'], 'Package': ['Package', '套餐'], 'Fee': ['Fee', '费用'],
  'Country': ['Country', '国家地区'], 'Actions': ['Actions', '操作'], 'Total': ['Total', '总计'],
  'Received': ['Received', '已收到'], 'Under Review': ['Under Review', '审核中'],
  'Approved': ['Approved', '已通过'], 'Waitlisted': ['Waitlisted', '候补'], 'Rejected': ['Rejected', '已拒绝'], 'Cancelled': ['Cancelled', '已取消'],
  'Delete': ['Delete', '删除'], 'Restore': ['Restore', '恢复'], 'Loading…': ['Loading…', '正在加载…'],
  'No matching registrations.': ['No matching registrations.', '没有符合条件的报名。'],
  'Load failed': ['Load failed', '加载失败'], 'Update failed': ['Update failed', '更新失败'],
  'Delete failed': ['Delete failed', '删除失败'], 'Restore failed': ['Restore failed', '恢复失败'],
  'Delete permanently': ['Delete permanently', '彻底删除'],
  'Permanently delete this registration? This action cannot be undone.': ['Permanently delete this registration? This action cannot be undone.', '确定彻底删除这条报名？此操作无法撤销。'],
  'Permanent deletion failed': ['Permanent deletion failed', '彻底删除失败'],
  'Permanently deleted': ['Permanently deleted', '已彻底删除'],
  'Status updated': ['Status updated', '状态已更新'], 'Moved to Deleted': ['Moved to Deleted', '已移入回收站'], 'Restored': ['Restored', '已恢复'],
  'Move this registration to Deleted / Recycle Bin?': ['Move this registration to Deleted / Recycle Bin?', '将这条报名移入回收站？'],
  'Deletion reason (optional):': ['Deletion reason (optional):', '删除原因（选填）：'],
  'Job title': ['Job title', '职位'], 'Department': ['Department', '部门'],
  'Organisation type': ['Organisation type', '机构类型'], 'Country / Region': ['Country / Region', '国家地区'],
  'City': ['City', '城市'], 'Business email': ['Business email', '企业邮箱'], 'Mobile': ['Mobile', '手机号'],
  'WhatsApp / WeChat': ['WhatsApp / WeChat', 'WhatsApp / 微信'], 'Investment focus': ['Investment focus', '投资方向'],
  'Purpose': ['Purpose', '参会目的'], '1-on-1 matchmaking': ['1-on-1 matchmaking', '一对一洽谈'],
  'Expected arrival': ['Expected arrival', '预计抵达日期'], 'Guests': ['Guests', '同行人数'],
  'Visa letter': ['Visa letter', '签证邀请函'], 'Fee (USD)': ['Fee (USD)', '费用（美元）'],
  'Status note': ['Status note', '状态备注'], 'Deleted at': ['Deleted at', '删除时间'],
  'Deleted by': ['Deleted by', '删除操作人'], 'Deletion reason': ['Deletion reason', '删除原因'],
  'Generate VIP Codes': ['Generate VIP Codes', '生成 VIP 码'], 'Search code, name or email': ['Search code, name or email', '搜索 VIP 码、姓名或邮箱'],
  'Search VIP codes': ['Search VIP codes', '搜索 VIP 码'], 'Filter by status': ['Filter by status', '按状态筛选'],
  'VIP code statistics': ['VIP code statistics', 'VIP 码统计'], 'Search': ['Search', '搜索'],
  'Available': ['Available', '可用'], 'Redeeming': ['Redeeming', '核销中'], 'Review': ['Review', '待核查'],
  'Used': ['Used', '已使用'], 'Revoked': ['Revoked', '已撤销'], 'Expired': ['Expired', '已过期'],
  'Copy Selected': ['Copy Selected', '复制所选'], 'Revoke Selected': ['Revoke Selected', '撤销所选'],
  'Clear Selection': ['Clear Selection', '清空选择'], 'Selected 0 codes': ['Selected 0 codes', '已选择 0 项'],
  'Selected {count} (across pages)': ['Selected {count} (across pages)', '已选择 {count} 项（跨页保留）'],
  'One code redeems one Delegate Pass. The attendee name and email are recorded automatically after successful registration.': ['One code redeems one Delegate Pass. The attendee name and email are recorded automatically after successful registration.', '每个 VIP 码可兑换一张参会票。报名成功后自动记录参会者姓名及邮箱。'],
  'VIP Code': ['VIP Code', 'VIP 码'], 'Used By': ['Used By', '使用人'], 'Business Email': ['Business Email', '企业邮箱'],
  'Select all VIP codes on this page': ['Select all VIP codes on this page', '选择本页全部 VIP 码'],
  'Select {code}': ['Select {code}', '选择 {code}'], 'Previous': ['Previous', '上一页'], 'Next': ['Next', '下一页'],
  'Page 1': ['Page 1', '第 1 页'], 'Page {page} / {pages} · Total {total}': ['Page {page} / {pages} · Total {total}', '第 {page} / {pages} 页 · 共 {total} 项'],
  'Close': ['Close', '关闭'], 'Quantity (1–200)': ['Quantity (1–200)', '数量（1–200）'],
  'New codes are selected automatically. Copy or export them to share with your invitees.': ['New codes are selected automatically. Copy or export them to share with your invitees.', '生成后自动选中新码，可复制或导出后提供给受邀者。'],
  'Generate': ['Generate', '生成'], 'Cancel': ['Cancel', '取消'], 'VIP Code Details': ['VIP Code Details', 'VIP 码详情'],
  'Copy Full Code': ['Copy Full Code', '复制完整码'], 'Registration Reference': ['Registration Reference', '报名编号'],
  'The registration outcome is unconfirmed. Reconcile it first, or record a reason to permanently revoke the code. It cannot be made available again.': ['The registration outcome is unconfirmed. Reconcile it first, or record a reason to permanently revoke the code. It cannot be made available again.', '报名结果尚未确认。请先核对报名，或填写原因后永久撤销，此码不能重新设为可用。'],
  'Revoke Code': ['Revoke Code', '撤销此码'], 'Reconcile Registration': ['Reconcile Registration', '核对报名'],
  'Revoke Code in Review': ['Revoke Code in Review', '撤销待核查码'], 'Revoke VIP Codes': ['Revoke VIP Codes', '撤销 VIP 码'],
  'Revocation Reason': ['Revocation Reason', '撤销原因'], 'Enter the reason for revocation': ['Enter the reason for revocation', '请输入撤销原因'],
  'Confirm Revocation': ['Confirm Revocation', '确认撤销'], 'View Details': ['View Details', '查看详情'],
  'No matching VIP codes.': ['No matching VIP codes.', '没有符合条件的 VIP 码。'],
  'Unexpected server response. Please refresh and retry.': ['Unexpected server response. Please refresh and retry.', '服务器响应异常，请刷新后重试。'],
  'Request failed. Please retry.': ['Request failed. Please retry.', '请求失败，请重试。'], 'Operation failed.': ['Operation failed.', '操作失败。'],
  'Quantity must be an integer from 1–200.': ['Quantity must be an integer from 1–200.', '数量须为 1–200 的整数。'],
  'Generated {count} codes and selected them for copying/export.': ['Generated {count} codes and selected them for copying/export.', '已生成 {count} 个码并选中，可复制或导出。'],
  'Clipboard access is unavailable. Copy the full code manually from its details.': ['Clipboard access is unavailable. Copy the full code manually from its details.', '无法访问剪贴板，请在详情中手动复制完整码。'],
  'No selected codes are available to copy.': ['No selected codes are available to copy.', '所选 VIP 码均无法复制。'],
  'Copied {count} available codes{skipped}.': ['Copied {count} available codes{skipped}.', '已复制 {count} 个可用码{skipped}。'],
  '; skipped {count} unavailable codes': ['; skipped {count} unavailable codes', '，跳过 {count} 个不可用码'],
  'Export failed.': ['Export failed.', '导出失败。'], 'Unexpected server response. CSV export failed.': ['Unexpected server response. CSV export failed.', '服务器响应异常，CSV 导出失败。'],
  'Valid unused codes exported.': ['Valid unused codes exported.', '已导出有效且未使用的 VIP 码。'],
  'After investigating the registration outcome, permanently revoke this code. It will not become available again.': ['After investigating the registration outcome, permanently revoke this code. It will not become available again.', '核实报名结果后永久撤销此码，此码不能重新设为可用。'],
  'Revoke the selected VIP codes? Used or processing codes will be skipped.': ['Revoke the selected VIP codes? Used or processing codes will be skipped.', '撤销所选 VIP 码？已使用或处理中的码将被跳过。'],
  'Revoked: {count} · Skipped: {skipped}': ['Revoked: {count} · Skipped: {skipped}', '已撤销：{count} · 已跳过：{skipped}'],
  'Please enter a reason for revocation.': ['Please enter a reason for revocation.', '请输入撤销原因。'],
  'The code in Review has been permanently revoked.': ['The code in Review has been permanently revoked.', '待核查码已永久撤销。'],
  'Registration matched. The code is now Used.': ['Registration matched. The code is now Used.', '已匹配报名，此码已标记为已使用。'],
  'No matching registration found. The code remains in Review.': ['No matching registration found. The code remains in Review.', '未找到匹配的报名，此码继续待核查。'],
  'Full code copied.': ['Full code copied.', '已复制完整码。'],
  '资料审核与公开展示': ['Material review and publication', '资料审核与公开展示'],
  '关闭资料审核': ['Close material review', '关闭资料审核'], '刷新': ['Refresh', '刷新'],
  '按报名编号筛选（留空查看全部）': ['Filter by registration reference (leave blank for all)', '按报名编号筛选（留空查看全部）'],
  '报名编号 / 姓名': ['Reference / name', '报名编号 / 姓名'], '报名状态': ['Registration status', '报名状态'],
  '名片': ['Business card', '名片'], '肖像': ['Portrait', '肖像'], '标识': ['Logo', '标识'],
  '负责人': ['Owner', '负责人'], '操作': ['Actions', '操作'], '审核 / 配置': ['Review / configure', '审核 / 配置'],
  '暂无记录': ['No records.', '暂无记录'], '名片（仅内部）': ['Business card (internal only)', '名片（仅内部）'],
  '嘉宾肖像': ['Speaker portrait', '嘉宾肖像'], '机构标识': ['Organisation logo', '机构标识'],
  '公开姓名': ['Public name', '公开姓名'], '公开职位': ['Public title', '公开职位'], '公开机构名称': ['Public organisation name', '公开机构名称'],
  '当前已发布快照': ['Currently published version', '当前已发布快照'],
  '替换资料待审核期间，此处保留上一已发布版本。下架不会删除待审原件。': ['The previous published version stays visible while replacements await review. Unpublishing keeps the submitted originals.', '替换资料待审核期间，此处保留上一已发布版本。下架不会删除待审原件。'],
  '立即下架': ['Unpublish now', '立即下架'], '已发布': ['Published', '已发布'],
  '报名：': ['Registration: ', '报名：'], '；肖像授权：': ['; portrait consent: ', '；肖像授权：'],
  '；标识授权：': ['; logo consent: ', '；标识授权：'], '是': ['Yes', '是'], '否': ['No', '否'],
  '保存负责人': ['Save owner', '保存负责人'], '重发补充资料邮件（旧链接将失效）': ['Resend materials email (invalidates old link)', '重发补充资料邮件（旧链接将失效）'],
  '资料邮件：': ['Materials email: ', '资料邮件：'], '驳回原因': ['Reason for rejection', '驳回原因'],
  '内部审核通过': ['Approve for internal verification', '内部审核通过'],
  '审核状态': ['Review status', '审核状态'], '待审核': ['Pending review', '待审核'],
  '已通过': ['Approved', '已通过'], '未通过': ['Rejected', '未通过'],
  '报名审核': ['Registration review', '报名审核'], '报名状态已保存': ['Registration status saved', '报名状态已保存'],
  '设为待审核': ['Reset to pending review', '设为待审核'],
  '审核并发布当前版本': ['Approve and publish current version', '审核并发布当前版本'],
  '驳回': ['Reject', '驳回'], '尚未上传': ['Not uploaded yet', '尚未上传'],
  '公开展示配置': ['Public display settings', '公开展示配置'],
  '配置修改会同步到已发布快照；替换图片仍需单独审核。机构去重键默认使用独立报名记录，仅在确认属于同一机构时设置相同键。': ['Changes update the published text and layout. Replacement images still need approval. Set the same organisation key only after confirming the registrations belong to the same organisation.', '配置修改会同步到已发布快照；替换图片仍需单独审核。机构去重键默认使用独立报名记录，仅在确认属于同一机构时设置相同键。'],
  '排序（数字越小越靠前）': ['Sort order (lower numbers first)', '排序（数字越小越靠前）'],
  '机构去重键': ['Organisation key', '机构去重键'], '嘉宾肖像焦点': ['Portrait focal point', '嘉宾肖像焦点'],
  '机构标识焦点': ['Logo focal point', '机构标识焦点'], '保存公开配置': ['Save public settings', '保存公开配置'],
  '版本与操作记录': ['Version and operation history', '版本与操作记录'],
  '负责人已保存': ['Owner saved', '负责人已保存'], '重新发送链接？旧资料链接将立即失效。': ['Resend the link? The previous materials link will stop working immediately.', '重新发送链接？旧资料链接将立即失效。'],
  '资料邮件已发送': ['Materials email sent', '资料邮件已发送'],
  '邮件发送失败，请检查邮件配置后重试': ['Email failed. Check the mail configuration and retry.', '邮件发送失败，请检查邮件配置后重试'],
  '请填写驳回原因': ['Enter a reason for rejection', '请填写驳回原因'], '审核已保存': ['Review saved', '审核已保存'],
  '已下架': ['Unpublished', '已下架'], '公开配置已保存': ['Public settings saved', '公开配置已保存'],
  'Attachment upload/download needs file storage permissions. Please contact the organiser. / 附件上传及下载权限未开通，请联系主办方。': ['Attachment upload/download needs file storage permissions. Please contact the organiser.', '附件上传及下载权限未开通，请联系主办方。'],
  'Attachment upload/download needs file storage permissions. Please contact the organiser.': ['Attachment upload/download needs file storage permissions. Please contact the organiser.', '附件上传及下载权限未开通，请联系主办方。'],
  'File storage is temporarily unavailable. Please retry later.': ['File storage is temporarily unavailable. Please retry later.', '文件存储暂时不可用，请稍后重试。'],
  'Admission approval and publication consent are required': ['Admission approval and publication consent are required', '请先通过报名审核，并取得对应的展示授权'],
  'The material changed; refresh before reviewing': ['The material changed; refresh before reviewing', '资料版本已变化，请刷新后重新审核'],
  'A rejection reason is required': ['A rejection reason is required', '请填写驳回原因'],
  'Materials service temporarily unavailable': ['Materials service temporarily unavailable', '资料服务暂时不可用，请稍后重试'],
  'Request failed / 请求失败': ['Request failed', '请求失败'],
  missing: ['Not submitted', '未提交'], received: ['Received', '已收到'], pending: ['Pending review', '待审核'],
  approved: ['Approved', '已通过'], rejected: ['Changes requested', '需重传'], unpublished: ['Unpublished', '已下架'],
  not_applicable: ['Not applicable', '不适用'], Pending: ['Pending', '待发送'], Sent: ['Sent', '已发送'], Failed: ['Failed', '发送失败'], sent: ['Sent', '已发送'], failed: ['Failed', '发送失败']
};

Object.assign(translations, {
  "采用最新文字": ["Use latest reviewed text", "采用最新文字"],
  "审核工作台": [
    "Review workspace",
    "审核工作台"
  ],
  "官网展示柜": [
    "Website showcase",
    "官网展示柜"
  ],
  "资料审核通过": [
    "Approve material",
    "资料审核通过"
  ],
  "要求重传": [
    "Request replacement",
    "要求重传"
  ],
  "确认要求重传": [
    "Confirm replacement request",
    "确认要求重传"
  ],
  "重传原因": [
    "Replacement reason",
    "重传原因"
  ],
  "身份与展示文字": [
    "Identity and display text",
    "身份与展示文字"
  ],
  "报名原始信息只读；下方仅调整官网展示文字。": [
    "Original registration details are read-only. Edit website display text below.",
    "报名原始信息只读；下方仅调整官网展示文字。"
  ],
  "保存展示文字": [
    "Save display text",
    "保存展示文字"
  ],
  "跟进安排": [
    "Follow-up",
    "跟进安排"
  ],
  "跟进备注": [
    "Follow-up note",
    "跟进备注"
  ],
  "保存跟进": [
    "Save follow-up",
    "保存跟进"
  ],
  "跟进已保存": [
    "Follow-up saved",
    "跟进已保存"
  ],
  "展示文字已保存": [
    "Display text saved",
    "展示文字已保存"
  ],
  "资料质量审核": [
    "Material quality review",
    "资料质量审核"
  ],
  "审核只确认资料质量；通过后可在官网展示柜中选择展示。名片仅供内部核验。": [
    "Review confirms material quality. Approved materials can be selected in the website showcase. Business cards remain private.",
    "审核只确认资料质量；通过后可在官网展示柜中选择展示。名片仅供内部核验。"
  ],
  "授权与展示状态": [
    "Consent and display status",
    "授权与展示状态"
  ],
  "肖像展示授权": [
    "Portrait consent",
    "肖像展示授权"
  ],
  "机构标识展示授权": [
    "Organisation logo consent",
    "机构标识展示授权"
  ],
  "已授权": [
    "Consent granted",
    "已授权"
  ],
  "未授权": [
    "No consent",
    "未授权"
  ],
  "授权由参会者管理。取得授权并通过报名、资料审核后，仍需在官网展示柜选择并保存。": [
    "Attendees manage their own consent. After registration and material approval, select and save materials in the website showcase to publish them.",
    "授权由参会者管理。取得授权并通过报名、资料审核后，仍需在官网展示柜选择并保存。"
  ],
  "操作记录": [
    "Activity history",
    "操作记录"
  ],
  "暂无操作记录": [
    "No activity yet",
    "暂无操作记录"
  ],
  "上传资料": [
    "Material uploaded",
    "上传资料"
  ],
  "资料审核": [
    "Material reviewed",
    "资料审核"
  ],
  "修改展示文字": [
    "Display text updated",
    "修改展示文字"
  ],
  "更新跟进": [
    "Follow-up updated",
    "更新跟进"
  ],
  "更新授权": [
    "Consent updated",
    "更新授权"
  ],
  "移出官网": [
    "Removed from website",
    "移出官网"
  ],
  "删除资料": [
    "Material deleted",
    "删除资料"
  ],
  "重发资料邮件": [
    "Materials email resent",
    "重发资料邮件"
  ],
  "资料变更": [
    "Material changed",
    "资料变更"
  ],
  "官网已展示": [
    "Visible on website",
    "官网已展示"
  ],
  "可加入展示柜": [
    "Ready for showcase",
    "可加入展示柜"
  ],
  "暂不可展示": [
    "Not ready for showcase",
    "暂不可展示"
  ],
  "报名待通过": [
    "Registration approval needed",
    "报名待通过"
  ],
  "缺少展示授权": [
    "Display consent needed",
    "缺少展示授权"
  ],
  "资料待审核": [
    "Material approval needed",
    "资料待审核"
  ],
  "套餐不支持肖像": [
    "Portrait unavailable for this package",
    "套餐不支持肖像"
  ],
  "报名已删除": [
    "Registration deleted",
    "报名已删除"
  ],
  "请检查审核与授权": [
    "Check review and consent",
    "请检查审核与授权"
  ],
  "预览暂不可用": [
    "Preview unavailable",
    "预览暂不可用"
  ],
  "加入展示柜": [
    "Add to showcase",
    "加入展示柜"
  ],
  "没有符合条件的资料": [
    "No matching materials",
    "没有符合条件的资料"
  ],
  "正在加载…": [
    "Loading…",
    "正在加载…"
  ],
  "有未保存的调整": [
    "Unsaved changes",
    "有未保存的调整"
  ],
  "已与官网同步": [
    "Saved website layout",
    "已与官网同步"
  ],
  "放弃本次调整": [
    "Discard changes",
    "放弃本次调整"
  ],
  "保存并更新官网": [
    "Save and update website",
    "保存并更新官网"
  ],
  "官网展示柜已被其他人更新。本地调整已保留，请查看最新官网后手动合并，或放弃本次调整并重新加载。": [
    "Someone else updated this showcase. Your draft is preserved. Check the website and merge manually, or discard your changes to reload the saved layout.",
    "官网展示柜已被其他人更新。本地调整已保留，请查看最新官网后手动合并，或放弃本次调整并重新加载。"
  ],
  "左侧选择已审核资料，右侧即官网展示顺序。拖动调整顺序，也可使用前移和后移。保存后才更新官网。": [
    "Choose approved materials on the left. The right shows the website order. Drag cards or use Move earlier and Move later. The website updates only when you save.",
    "左侧选择已审核资料，右侧即官网展示顺序。拖动调整顺序，也可使用前移和后移。保存后才更新官网。"
  ],
  "资料候选区": [
    "Available materials",
    "资料候选区"
  ],
  "搜索姓名、机构或报名编号": [
    "Search name, organisation or reference",
    "搜索姓名、机构或报名编号"
  ],
  "官网展示顺序": [
    "Website display order",
    "官网展示顺序"
  ],
  "拖动调整顺序": [
    "Drag to reorder",
    "拖动调整顺序"
  ],
  "拖动照片调整取景，方向键微调": [
    "Drag photo to frame; use arrow keys for fine adjustment",
    "拖动照片调整取景，方向键微调"
  ],
  "改用最新已审核图片": [
    "Use latest approved image",
    "改用最新已审核图片"
  ],
  "更多": [
    "More",
    "更多"
  ],
  "同一机构": [
    "Same organisation",
    "同一机构"
  ],
  "前移": [
    "Move earlier",
    "前移"
  ],
  "后移": [
    "Move later",
    "后移"
  ],
  "移出展示柜": [
    "Remove from showcase",
    "移出展示柜"
  ],
  "点击左侧加入，或将资料拖到这里": [
    "Add a material from the left or drag it here",
    "点击左侧加入，或将资料拖到这里"
  ],
  "官网展示柜已更新": [
    "Website showcase updated",
    "官网展示柜已更新"
  ],
  "没有可用的已审核图片": [
    "No approved image available",
    "没有可用的已审核图片"
  ],
  "使用最新已审核图片替换？保存后才更新官网。": [
    "Replace with the latest approved image? The website updates when you save.",
    "使用最新已审核图片替换？保存后才更新官网。"
  ],
  "搜索已有报名机构": [
    "Find an existing registration organisation",
    "搜索已有报名机构"
  ],
  "资料邮件已加入发送队列": [
    "Materials email queued",
    "资料邮件已加入发送队列"
  ],
  "邮件未发送，请检查邮件配置": [
    "Email was not sent. Check mail settings.",
    "邮件未发送，请检查邮件配置"
  ]
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// This receives only the fixed server template; attendee data is inserted later by controllers.
function markup(page) {
  return page.split(/(<script>[\s\S]*?<\/script>|<style>[\s\S]*?<\/style>)/g).map(part => {
    if (/^<(script|style)>/.test(part)) return part;
    return part.replace(/(<option\b[^>]*>)([^<]*)(<\/option>)/g, (all, open, text, close) => Object.hasOwn(translations, text) && !open.includes('data-admin-i18n=') ? open.slice(0, -1) + ' data-admin-i18n="' + escapeHtml(text) + '">' + text + close : all)
      .split(/(<[^>]+>)/g).map((piece, index, pieces) => {
        if (piece.startsWith('<')) return piece.replace(/\b(placeholder|aria-label)="([^"]+)"/g, (all, attr, value) => translations[value] ? all + ' data-admin-' + (attr === 'placeholder' ? 'placeholder' : 'aria') + '="' + escapeHtml(value) + '"' : all);
        const key = piece.trim();
        if (!translations[key] || /<option\b/.test(pieces[index - 1] || '') || /<title\b/.test(pieces[index - 1] || '')) return piece;
        return piece.replace(key, '<span data-admin-i18n="' + escapeHtml(key) + '">' + key + '</span>');
      }).join('');
  }).join('');
}

function browser(translations) {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let language = /^zh/i.test(navigator.language || '') ? 'zh' : 'en';
  try { const saved = localStorage.getItem('lpclub-admin-language'); if (['zh', 'en'].includes(saved)) language = saved; } catch (_) {}
  function text(key, params = {}) {
    const template = translations[key]?.[language === 'zh' ? 1 : 0] ?? String(key ?? '');
    return template.replace(/\{(\w+)\}/g, (all, name) => Object.hasOwn(params, name) ? String(params[name]) : all);
  }
  function label(key) {
    return Object.hasOwn(translations, key) ? '<span data-admin-i18n="' + escapeHtml(key) + '">' + escapeHtml(text(key)) + '</span>' : escapeHtml(key);
  }
  function setText(element, key, params = {}) {
    element.setAttribute('data-admin-i18n', key);
    element.setAttribute('data-admin-params', JSON.stringify(params));
    element.textContent = text(key, params);
  }
  function apply() {
    document.querySelectorAll('[data-admin-i18n]').forEach(element => {
      let params = {}; try { params = JSON.parse(element.getAttribute('data-admin-params') || '{}'); } catch (_) {}
      const value = text(element.getAttribute('data-admin-i18n'), params);
      if (element.textContent !== value) element.textContent = value;
    });
    for (const [marker, attr] of [['data-admin-placeholder', 'placeholder'], ['data-admin-aria', 'aria-label'], ['data-admin-alt', 'alt']]) document.querySelectorAll('[' + marker + ']').forEach(element => {
      let params = {}; try { params = JSON.parse(element.getAttribute('data-admin-params') || '{}'); } catch (_) {}
      const value = text(element.getAttribute(marker), params);
      if (element.getAttribute(attr) !== value) element.setAttribute(attr, value);
    });
  }
  function setLanguage(next) {
    if (!['zh', 'en'].includes(next)) return;
    language = next;
    try { localStorage.setItem('lpclub-admin-language', language); } catch (_) {}
    document.documentElement.lang = language;
    document.title = 'LP CLUB · ' + text('Registration Operations · 报名管理');
    for (const [lang, id] of [['zh', 'adminLangZh'], ['en', 'adminLangEn']]) {
      const button = document.getElementById(id);
      if (button) { button.setAttribute('aria-pressed', String(lang === language)); button.onclick = () => setLanguage(lang); }
    }
    apply();
    window.LPClubAdminShell?.refresh();
    window.LPClubNotifications?.translate();
  }
  window.LPClubAdminI18n = { text, label, setText, setLanguage, get language() { return language; } };
  new MutationObserver(apply).observe(document.body, { childList: true, subtree: true });
  setLanguage(language);
}
const script = '(' + browser.toString() + ')(' + JSON.stringify(translations).replace(/</g, '\\u003c') + ');';
// Legacy standalone renderers also run without the shared management shell.
const helpers = `const t=(key,params={})=>globalThis.window?.LPClubAdminI18n?.text(key,params)??String(key??'').replace(/\\{(\\w+)\\}/g,(all,name)=>Object.hasOwn(params,name)?String(params[name]):all);const l=key=>globalThis.window?.LPClubAdminI18n?.label(key)??e(key);const setText=(element,key,params={})=>{if(globalThis.window?.LPClubAdminI18n)window.LPClubAdminI18n.setText(element,key,params);else element.textContent=t(key,params)};`;

module.exports = { markup, script, helpers, translations };

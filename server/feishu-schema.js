'use strict';

/*
 * Canonical schema for the LP CLUB Conference registration Base.
 * Feishu Base is the ONLY source of truth for registrations.
 */
const FEISHU_FIELDS = [
  { name: 'Registration Reference / 报名编号', type: 1, primary: true },
  { name: 'Status / 状态', type: 1 },
  { name: 'Submitted At / 提交时间', type: 1 },
  { name: 'Salutation / 称谓', type: 1 },
  { name: 'Full Name / 姓名', type: 1 },
  { name: 'Company / Organization / 公司机构', type: 1 },
  { name: 'Organization Type / 机构类型', type: 1 },
  { name: 'Department / 部门', type: 1 },
  { name: 'Job Title / 职位', type: 1 },
  { name: 'Country / Region / 国家地区', type: 1 },
  { name: 'City / 城市', type: 1 },
  { name: 'Business Email / 企业邮箱', type: 1 },
  { name: 'Mobile Number / 手机号码', type: 1 },
  { name: 'Same as WhatsApp or WeChat / 是否同号', type: 1 },
  { name: 'WhatsApp or WeChat Number / WhatsApp或微信号码', type: 1 },
  { name: 'Investment Focus / 投资方向', type: 1 },
  { name: 'Purpose of Attendance / 参会目的', type: 1 },
  { name: 'LP & GP 1-on-1 Matchmaking / 一对一洽谈', type: 1 },
  { name: 'Visa Invitation Letter / 签证邀请函', type: 1 },
  { name: 'Expected Arrival Date / 预计抵达日期', type: 1 },
  { name: 'Accompanying Guests / 同行人数', type: 2 },
  { name: 'Privacy Consent / 隐私授权', type: 1 },
  { name: 'Package ID / 套餐ID', type: 1 },
  { name: 'Attendee Category / 报名身份', type: 1 },
  { name: 'Ticket / 票种', type: 1 },
  { name: 'Currency / 币种', type: 1 },
  { name: 'Amount / 金额', type: 2 },
  { name: 'Display Price / 显示价格', type: 1 },
  { name: 'Pricing Basis / 计价说明', type: 1 },
  { name: 'Source / 来源', type: 1 },
  { name: 'Email Status / 邮件状态', type: 1 },
  { name: 'Email Sent At / 邮件发送时间', type: 1 },
  { name: 'Status Updated At / 状态更新时间', type: 1 },
  { name: 'Status Note / 状态备注', type: 1 },

  // Soft-delete / recycle-bin fields. Never physically delete registrations.
  { name: 'Is Deleted / 已删除', type: 7 },
  { name: 'Deleted At / 删除时间', type: 1 },
  { name: 'Deleted By / 删除人', type: 1 },
  { name: 'Deletion Reason / 删除原因', type: 1 }
];

module.exports = { FEISHU_FIELDS };

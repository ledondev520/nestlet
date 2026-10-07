/** Read-only official-source observations, not a packet validator or agency acceptance. */
const CHECKED_AT = '2026-10-07';
const both = (zh, en) => ({ zh, en });
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
export const DEFAULT_GUIDANCE_AGENCY = 'sfha';
export const AGENCY_OPTIONS = freeze([
  { id: 'sfha', label: both('旧金山 SFHA', 'San Francisco · SFHA') },
  { id: 'unknown', label: both('尚未确定 / 其他机构', 'Unknown / another agency') },
  { id: 'oha', label: both('奥克兰 OHA', 'Oakland · OHA') },
  { id: 'haca', label: both('阿拉米达县 HACA', 'Alameda County · HACA') },
  { id: 'sccha', label: both('圣克拉拉县 SCCHA', 'Santa Clara County · SCCHA') }
]);
export const GUIDANCE_COPY = freeze({
  zh: {
    title: '官方资料参考', selectLabel: '资料参考机构（不代表本案例所属机构）',
    scope: '仅供准备辅助文书参考。五项事实核对不代表官方材料齐全；选择参考机构不会修改案例事实。',
    acceptance: '当前受理版本及本案例适用性尚未确认', checkedLabel: '资料查阅日期', editionLabel: '页面所示版本',
    conditionsLabel: '需人工确认',
    versionCaution: '表格印有已过去的 OMB 到期日，不足以判断有效或无效。请向机构确认受理版本；不得修改该日期。'
  },
  en: {
    title: 'Official source references', selectLabel: 'Reference agency (not confirmed for this case)',
    scope: 'Guidance for supplementary drafts only. Reviewing five facts does not complete an official packet; selecting a reference agency does not change case facts.',
    acceptance: 'Accepted edition and case applicability unconfirmed', checkedLabel: 'Sources checked', editionLabel: 'Displayed version',
    conditionsLabel: 'Confirm with a reviewer',
    versionCaution: 'A past printed OMB expiration alone establishes neither validity nor invalidity. Confirm the accepted edition with the agency; do not change the printed date.'
  }
});
const source = (id, title, url, edition = both('未标示 / 未核实', 'Not displayed / not verified'), printedOMBExpiration = null) =>
  ({ id, title, url, edition, printedOMBExpiration, checkedAt: CHECKED_AT, acceptanceStatus: 'unconfirmed' });
const hudGuide = source('hud-guide', 'HUD HCV Forms for Landlords', 'https://www.hud.gov/helping-americans/housing-choice-vouchers-landlord-forms');
const registry = freeze({
  sfha: {
    links: [
      source('sfha-process', 'SFHA Housing Choice Voucher Lease-Up Process', 'https://sfha.org/housing-programs/housing-choice-voucher-participants'),
      source('sfha-rta', 'SFHA HUD-52517 Request for Tenancy Approval', 'https://sfha.org/files/documents/52517ENG.pdf', both('04/2023；2 页；OMB 印刷到期日 04/30/2026', '04/2023; 2 pages; printed OMB expiration 04/30/2026'), '2026-04-30'),
      source('sfha-owner', 'SFHA Property Owner Packet', 'https://sfha.org/files/documents/Property%20Owner%20Packet%20Rev.%2007.2024.pdf', both('文件名 Rev.07.2024；6 页', 'Filename Rev.07.2024; 6 pages')),
      source('hud-addendum', 'HUD-52641-A Tenancy Addendum', 'https://www.hud.gov/sites/dfiles/OCHCO/documents/52641A.pdf', both('4/2023；5 页；OMB 印刷到期日 4/30/2026', '4/2023; 5 pages; printed OMB expiration 4/30/2026'), '2026-04-30')
    ],
    notes: [
      both('先确认本案例是否由 SFHA 负责、凭证有效期及业主/代理身份。SFHA 流程要求在凭证到期前或当天提交 RTA；新业主申请检查前需取得 Vendor Number。', 'Confirm the case agency, voucher deadline and owner/agent role. SFHA describes RTA submission by voucher expiry and a Vendor Number before a new owner requests inspection.'),
      both('RTA 还涉及租客、日期、房屋信息、押金、水电分工及双方签署。业主材料含产权、W-9、银行证明，以及视身份适用的代理/授权文件；勿在普通草稿中收集税号或账户。', 'RTA preparation also needs tenant, dates, unit details, deposit, utilities and both parties’ execution. The owner packet lists ownership, W-9, bank evidence and conditional agent/authority documents; keep tax and account identifiers out of ordinary drafts.'),
      both('业主材料中的 HAP 承接页涉及现有合同，不能视为每宗新租约必填。签名、收讫确认和机构批准须由有权人员处理；官方表格不得改写。', 'The HAP-assumption page concerns an existing contract, so do not treat it as universal for a new lease. Authorized people handle signatures, receipt acknowledgments and agency approvals; preserve official forms.')
    ]
  },
  unknown: {
    links: [hudGuide],
    notes: [
      both('确认负责机构、凭证类别、案例类型和操作人身份后，再取得机构当前受理的材料清单。', 'Confirm the responsible agency, voucher program, case type and operator role before obtaining its currently accepted packet.'),
      both('可先生成英文跟进函或案例摘要。不得据此宣称已完成官方表格、通过检查或获批租金。', 'An English follow-up or case summary can be prepared now. It does not establish completed official forms, inspection passage or rent approval.')
    ]
  },
  oha: {
    links: [
      source('oha-forms', 'OHA Affordable Housing Provider Forms', 'https://www.oakha.org/propertyowners/section8ownerforms/'),
      source('oha-rta', 'OHA Request for Tenancy Approval Packet', 'https://www.oakha.org/wp-content/uploads/2025/06/RTA-Packet-2025_fillable.pdf', both('文件名 2025；10 页；内含 LH0406 (10/19)', 'Filename 2025; 10 pages; includes LH0406 (10/19)'))
    ],
    notes: [
      both('日期、业主法定名称及代理授权须核实；业主/代理需签署预检查清单。预检查清单不是通过检查的证明。', 'Verify dates, legal owner identity and agent authority; the owner/agent signs the preparation checklist. That checklist does not prove inspection passage.'),
      both('材料中的租金表针对同址 2 套及以上房屋；RTA 的可比租金条目条件另行判断。现有租约的 HAP 取消文件不适用于所有案例。', 'The packet’s rent roll applies to premises with 2+ units; the RTA comparable-rental condition is separate. Existing-tenancy HAP cancellation is not universal.')
    ]
  },
  haca: {
    links: [
      source('haca-process', 'HACA Paperwork Guidance', 'https://www.haca.net/landlords/landlord-questions/how-much-paperwork-is-there/'),
      source('haca-resources', 'HACA Landlord Resources', 'https://www.haca.net/landlords/landlord-resources/'),
      source('haca-deposit', 'HACA Direct Deposit Enrollment Form', 'https://www.haca.net/pdf/Direct%20Deposit%20Enrollment%20Form.pdf', both('Version 2；更新 10.27.2022；2 页', 'Version 2; updated 10.27.2022; 2 pages'))
    ],
    notes: [
      both('HACA 与奥克兰 OHA 是不同机构。HACA 说明列出 RTA、租约、检查、HAP 及新业主 W-9；完整当前 RTA 模板尚未核实。', 'HACA and Oakland OHA are different agencies. HACA describes RTA, lease, inspection, HAP and new-owner W-9; its complete current RTA template remains unverified.'),
      both('直接存款文件包含财务授权，需单独确认适用性并使用获准的安全渠道；不得自动签署或填写真实账号。', 'Direct-deposit paperwork includes financial authorization. Confirm applicability and the approved secure channel separately; do not automatically execute it or populate real account details.')
    ]
  },
  sccha: {
    links: [
      source('sccha-move', 'SCCHA Move Process', 'https://www.scchousingauthority.org/section-8/for-participants/existing-tenants/move-process/'),
      source('sccha-owners', 'SCCHA New Landlord Process', 'https://www.scchousingauthority.org/section-8/for-landlords/for-new-landlords/'),
      source('sccha-resources', 'SCCHA Participant Resources', 'https://www.scchousingauthority.org/section-8/for-participants/existing-tenants/')
    ],
    notes: [
      both('SCCHA 说明相关材料随凭证提供，由业主和参加者填写签署。独立 RFTA PDF、字段映射及受理版本尚未核实。', 'SCCHA says paperwork accompanies the voucher and is completed and signed by owner and participant. A standalone RFTA PDF, field mapping and accepted edition remain unverified.'),
      both('使用本案例实际收到的材料确认检查、租金和签署流程；不要从网页参考推定本案例已获批准。', 'Use the actual case packet to confirm inspection, rent and execution steps; website guidance does not establish case approval.')
    ]
  }
});
/** Explicit selector only: never infer a case agency from an address or arbitrary input. */
export function getAgencyGuidance(id = 'unknown', locale = 'zh') {
  const key = typeof id === 'string' && Object.hasOwn(registry, id) ? id : 'unknown';
  const language = locale === 'en' ? 'en' : 'zh';
  const item = registry[key];
  return freeze({
    id: key, label: AGENCY_OPTIONS.find(option => option.id === key).label[language],
    checkedAt: CHECKED_AT, acceptanceStatus: 'unconfirmed', scope: GUIDANCE_COPY[language].scope,
    links: item.links.map(link => ({ ...link, edition: link.edition[language] })),
    notes: item.notes.map(note => note[language])
  });
}

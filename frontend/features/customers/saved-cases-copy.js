export const savedCasesCopy = {
  zh: {
    unavailable:'事项暂不可用，未清除工作区草稿。', manage:'管理事项', saved:'修改已保存。', deleted:'事项已删除，已存原件保留。',
    allOriginals: '全部原件', originalsHint: '查看本账号保存的全部原件。\n无需先选客户或事项。',
    title: '已存事项', intro: "选择事项，接着处理。",
    all: '全部事项', recent: '最近十项', unassigned: '未选客户', scope: '显示范围',
    search: '搜索事项', placeholder: '输入事项名称或编号', searchHint: '按名称或编号查找，最近更新优先。',
    recentHint: '显示搜索结果中最近更新的10项。\n其余记录请选「全部事项」查看。',
    clear: '清空搜索', refresh: '刷新列表', retry: '刷新列表',
    loading: '正在加载已保存事项…', failed: '暂时无法加载已保存事项，请重试。',
    sessionExpired: '登录已失效，请重新登录。\n登录后可查看自己的事项。',
    empty: '暂无事项', emptyHint: '对话或材料页保存的事项会显示在这里。\n无需先创建客户。',
    emptyUnassigned: '没有未关联客户的事项', emptyUnassignedHint: '选择「全部事项」，查看其他记录。',
    noMatches: '没有找到匹配的事项', noMatchesHint: '换个名称或编号试试，或清空搜索。',
    linked: '已关联客户', recordId: '记录编号', updated: '更新时间', unnamed: '未命名',
    open: '打开事项', previous: '上一页', next: '下一页',
    count: (shown, matching, total) => `本页 ${shown} 项\n当前范围 ${matching} 项\n账号共 ${total} 项`,
    page: (page, pages) => `第 ${page} / ${pages} 页`
  },
  en: {
    unavailable:'Case unavailable. Workspace drafts were not discarded.', manage:'Manage case', saved:'Changes saved.', deleted:'Case deleted. Saved originals were retained.',
    allOriginals: 'All originals, including unassigned', originalsHint: 'Expand to find saved files without selecting a customer or case first.',
    title: 'Saved cases', intro: "Continue a saved case.",
    all: 'All cases', recent: 'Latest 10', unassigned: 'Unassigned', scope: 'Case scope',
    search: 'Search saved cases', placeholder: 'Enter a case title or record ID', searchHint: 'Search titles or IDs. Results are ordered by their most recent update.',
    recentHint: 'Showing the 10 most recently updated search results. Choose All cases to see the rest.',
    clear: 'Clear case search', refresh: 'Refresh saved cases', retry: 'Reload case directory',
    loading: 'Loading saved cases…', failed: 'Saved cases could not be loaded. Please retry.',
    sessionExpired: 'Your session has expired. Sign in again to view your cases.',
    empty: 'No saved cases yet', emptyHint: 'Cases explicitly saved from Conversation or Materials appear here. Creating a customer first is optional.',
    emptyUnassigned: 'No unassigned cases', emptyUnassignedHint: 'Choose All cases to view records already linked to customers.',
    noMatches: 'No matching cases', noMatchesHint: 'Try another title or ID, or clear the search.',
    linked: 'Customer linked', recordId: 'Record ID', updated: 'Updated', unnamed: 'Untitled case',
    open: 'Open saved case', previous: 'Previous cases page', next: 'Next cases page',
    count: (shown, matching, total) => `${shown} shown · ${matching} in this view · ${total} saved in your account`,
    page: (page, pages) => `Page ${page} of ${pages}`
  }
};
export const casesCopy = lang => savedCasesCopy[lang === 'en' ? 'en' : 'zh'];

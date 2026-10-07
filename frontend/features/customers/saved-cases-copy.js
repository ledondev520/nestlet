export const savedCasesCopy = {
  zh: {
    allOriginals: '全部原件（含未关联）', originalsHint: '展开查找此账户保存的文件，无需先选择客户或事项。',
    title: '已保存事项', intro: '从这里找回所有已保存的事项，包括尚未关联客户的对话与材料工作。',
    all: '全部事项', recent: '最近 10 项', unassigned: '未关联客户', scope: '事项范围',
    search: '搜索已保存事项', placeholder: '输入事项名称或记录编号', searchHint: '按名称或编号查找，结果按最近更新时间排序。',
    recentHint: '显示当前搜索结果中最近更新的 10 项；选择“全部事项”查看其余记录。',
    clear: '清空事项搜索', refresh: '刷新已保存事项', retry: '重新加载事项目录',
    loading: '正在加载已保存事项…', failed: '暂时无法加载已保存事项，请重试。',
    sessionExpired: '登录已失效，请重新登录后查看自己的事项。',
    empty: '还没有已保存的事项', emptyHint: '在对话或材料页明确保存的事项，会出现在这里；无需先创建客户。',
    emptyUnassigned: '没有未关联客户的事项', emptyUnassignedHint: '可以切换到“全部事项”查看已关联客户的记录。',
    noMatches: '没有找到匹配的事项', noMatchesHint: '换个名称或编号试试，或清空搜索。',
    linked: '已关联客户', recordId: '记录编号', updated: '更新于', unnamed: '未命名事项',
    open: '打开已保存事项', previous: '上一页事项', next: '下一页事项',
    count: (shown, matching, total) => `本页 ${shown} 项 · 当前范围 ${matching} 项 · 账户共 ${total} 项`,
    page: (page, pages) => `第 ${page} / ${pages} 页`
  },
  en: {
    allOriginals: 'All originals, including unassigned', originalsHint: 'Expand to find saved files without selecting a customer or case first.',
    title: 'Saved cases', intro: 'Reopen every saved case here, including conversation or materials work that has not been linked to a customer.',
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

export const originalRetentionCopy = {
  zh: {
    title: "保存原图",
    boundary: "发送前，请逐张保存原图。\n仅发送消息不会保存原图。\n保存的原图仅当前账号可见。\n可按文件名查找，未识别图中文字。",
    save: "保存原图", saving: '正在保存原图…', checking: '正在核对保存状态…', cancel: '停止等待',
    saved: "原图已保存到事项材料。", preview: '查看原图', download: '下载原图', materials: "查看材料",
    failed: '未能保存原图。请保留当前页面后重试。', retry: '重试保存',
    uncertain: "尚未确认结果，但原图可能已保存。\n请先核对状态，不会自动重复上传。",
    check: "核对保存", unresolved: "还未找到已保存的副本。\n请继续核对，或查看事项材料。\n为避免重复，不会再次上传。",
    unavailable: "原图不可用，请重新添加图片。\n历史对话中的记录无法恢复原图。",
    filename: "文件名无效，请改用正确的后缀。\n支持PNG或JPEG，请重新添加。",
    capacity: '私有材料空间已满，原图未保存。', session: "登录已失效，请重新登录后再保存。",
    missingCase: "当前事项不可用。\n请重新打开正确事项后再保存。",
    invalidImage: "图片无法保存，请重新添加有效原图。\n支持PNG或JPEG。"
  },
  en: {
    title: 'Save chat originals',
    boundary: 'Save each original before sending. Only images you choose to save enter this case’s private Materials; sending alone does not retain originals. Search images by filename; no OCR is performed.',
    save: 'Save this original', saving: 'Saving original…', checking: 'Checking saved status…', cancel: 'Stop waiting',
    saved: 'Original saved to this case’s Materials', preview: 'View original', download: 'Download original', materials: 'Open this case’s Materials',
    failed: 'Could not save the original. Keep this page open and retry.', retry: 'Retry saving',
    uncertain: 'Save is not confirmed; the server may have saved it. Check its status first. No automatic duplicate upload will be made.',
    check: 'Check saved status', unresolved: 'No confirmed copy was found yet. Check again or inspect this case’s Materials. Upload will not be repeated to avoid duplicates.',
    unavailable: 'Original bytes are unavailable. Reattach the image; historical chat metadata cannot restore an original.',
    filename: 'The filename is unsupported. Reattach with a valid PNG / JPEG filename.',
    capacity: 'Private material storage is full. The original was not saved.', session: 'Your session expired. Sign in again before saving.',
    missingCase: 'This case is unavailable. Reopen the correct case before saving.',
    invalidImage: 'This image could not be saved. Reattach a valid PNG / JPEG original.'
  }
};
export function originalRetentionError(error, words) {
  if (error?.status === 401 || ['AUTH_REQUIRED', 'CSRF_REJECTED'].includes(error?.code)) return words.session;
  if (['ORIGINAL_UNAVAILABLE'].includes(error?.code)) return words.unavailable;
  if (['ORIGINAL_FILENAME_INVALID', 'ASSET_FILENAME_INVALID'].includes(error?.code)) return words.filename;
  if (['ASSET_QUOTA_EXCEEDED'].includes(error?.code)) return words.capacity;
  if (['CASE_NOT_FOUND', 'ORIGINAL_CASE_REQUIRED'].includes(error?.code)) return words.missingCase;
  if (['CHAT_IMAGE_INVALID', 'ASSET_IMAGE_INVALID', 'ASSET_IMAGE_UNSUPPORTED', 'ASSET_TYPE_UNSUPPORTED'].includes(error?.code)) return words.invalidImage;
  return words.failed;
}

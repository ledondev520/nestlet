export const originalRetentionCopy = {
  zh: {
    title: '保存聊天原图',
    boundary: '请在发送前逐张保存。只有点击保存的原图才会存入本案私有材料；仅发送聊天不会保存原图。图片可按文件名查找，未进行 OCR。',
    save: '保存这张原图', saving: '正在保存原图…', checking: '正在核对保存状态…', cancel: '停止等待',
    saved: '原图已保存到本案材料', preview: '查看原图', download: '下载原图', materials: '打开本案材料',
    failed: '未能保存原图。请保留当前页面后重试。', retry: '重试保存',
    uncertain: '尚未确认保存结果，服务器可能已保存。先核对状态，不会自动重复上传。',
    check: '核对保存状态', unresolved: '仍未找到可确认的副本。请继续核对，或到本案材料中检查；为避免重复，不会再次上传。',
    unavailable: '原始文件已不可用，请重新附加图片；历史聊天中的图片记录不能恢复原图。',
    filename: '文件名不受支持，请使用有效的 PNG / JPEG 文件名重新附加。',
    capacity: '私有材料空间已满，原图未保存。', session: '会话已失效，请重新登录后再保存。',
    missingCase: '当前案件不可用，请重新打开正确案件后再保存。',
    invalidImage: '无法保存这张图片，请重新附加有效的 PNG / JPEG 原图。'
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

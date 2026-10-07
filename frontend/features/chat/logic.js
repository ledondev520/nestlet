import { normalizeLibraryActivity, normalizeLibrarySources } from './retrieval.js';
import { AGENCY_OPTIONS } from '../../../public/agency-guidance.js';
/** Bounded chat protocol helpers. No provider simulation or browser persistence. */
export const CHAT_BOUNDS = Object.freeze({ text: 8000, output: 64000, images: 2, imageBytes: 2 * 1024 * 1024, imageSide: 8192 });
export class ChatClientError extends Error {
  constructor(code) { super(code); this.name = 'ChatClientError'; this.code = code; }
}
const fail = code => { throw new ChatClientError(code); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
export function newCasePayload(title) {
  return { title, sourceText: '', fields: [], draftType: 'followup', draftText: '', extractionMode: 'manual', namesVerified: false, clientId: null };
}
export function validateImageFile(file) {
  if (!file || !['image/png', 'image/jpeg'].includes(file.type) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > CHAT_BOUNDS.imageBytes) fail('CHAT_IMAGE_INVALID');
}
/** Header dimensions reject decompression-sized images before asking the browser to decode pixels. */
export function imageDimensions(bytes, mimeType) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 4 || bytes.byteLength > CHAT_BOUNDS.imageBytes) fail('CHAT_IMAGE_INVALID');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width=0,height=0;
  if (mimeType==='image/png') {
    const signature=[137,80,78,71,13,10,26,10];
    if(bytes.length<33 || signature.some((value,index)=>bytes[index]!==value) || view.getUint32(8)!==13 || String.fromCharCode(...bytes.subarray(12,16))!=='IHDR')fail('CHAT_IMAGE_INVALID');
    width=view.getUint32(16);height=view.getUint32(20);
  } else if(mimeType==='image/jpeg') {
    if(bytes[0]!==255||bytes[1]!==216)fail('CHAT_IMAGE_INVALID');
    const markers=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);let offset=2;
    while(offset+3<bytes.length){
      if(bytes[offset]!==255)fail('CHAT_IMAGE_INVALID');while(bytes[offset]===255)offset++;
      const marker=bytes[offset++];if(marker===0xd9||marker===0xda)break;if(marker===1||(marker>=0xd0&&marker<=0xd8))continue;
      if(offset+2>bytes.length)fail('CHAT_IMAGE_INVALID');const length=view.getUint16(offset);
      if(length<2||offset+length>bytes.length)fail('CHAT_IMAGE_INVALID');
      if(markers.has(marker)){if(length<8)fail('CHAT_IMAGE_INVALID');height=view.getUint16(offset+3);width=view.getUint16(offset+5);break;}offset+=length;
    }
  } else fail('CHAT_IMAGE_INVALID');
  if(!width||!height||width>CHAT_BOUNDS.imageSide||height>CHAT_BOUNDS.imageSide)fail('CHAT_IMAGE_INVALID');
  return {width,height};
}
export function buildChatTurn({ caseId, conversationId, clientMessageId, text, images = [], lang = 'zh', libraryConsent = false, guidanceAgency = 'unknown' }) {
  if (!AGENCY_OPTIONS.some(option => option.id === guidanceAgency)) fail('CHAT_INVALID');
  if (typeof libraryConsent !== 'boolean' || !uuid(caseId) || !uuid(conversationId) || !uuid(clientMessageId) || !['zh', 'en'].includes(lang) || typeof text !== 'string' || /\u0000/u.test(text)) fail('CHAT_INVALID');
  if (text.length > CHAT_BOUNDS.text || !Array.isArray(images) || images.length > CHAT_BOUNDS.images) fail('CHAT_TOO_LARGE');
  if (!text.trim() && !images.length) fail('CHAT_EMPTY');
  const cleanImages = images.map(image => {
    if (!['image/png', 'image/jpeg'].includes(image.mimeType) || typeof image.data !== 'string' || !image.data || image.data.length > Math.ceil(CHAT_BOUNDS.imageBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(image.data)) fail('CHAT_IMAGE_INVALID');
    return { mimeType: image.mimeType, data: image.data };
  });
  return { caseId, conversationId, clientMessageId, locale: lang, consent: true, guidanceAgency, ...(libraryConsent ? {libraryConsent:true} : {}),
    messages: [{ role: 'user', content: text, ...(cleanImages.length ? { images: cleanImages } : {}) }] };
}
export function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length > 100) fail('INVALID_RESPONSE');
  return messages.map(message => {
    if (!message || !uuid(message.id) || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string' || message.content.length > CHAT_BOUNDS.output || !['complete', 'interrupted', 'failed'].includes(message.state)) fail('INVALID_RESPONSE');
    if (message.imageMetadata !== undefined && (!Array.isArray(message.imageMetadata) || message.imageMetadata.length > 2)) fail('INVALID_RESPONSE');
    return { id: message.id, role: message.role, content: message.content, state: message.state,
      clientMessageId: message.clientMessageId || null, requestId: message.requestId || null,
      imageMetadata: (message.imageMetadata || []).slice(0,2).map(image => ({mimeType:image.mimeType,byteCount:image.byteCount,retained:false})) };
  });
}
/** Merge a just-received partial with a reload that raced server disconnect cleanup. */
export function restoredMessages(stored, localUser, localAssistant) {
  const rows = normalizeMessages(stored);
  const userIndex = rows.findIndex(message => message.clientMessageId === localUser?.clientMessageId);
  if (userIndex < 0) return null;
  const terminal = rows.slice(userIndex + 1).some(message => message.role === 'assistant' &&
    (message.id === localAssistant?.id || message.requestId && message.requestId === rows[userIndex].requestId));
  if (!terminal && localAssistant?.content) rows.push({ ...localAssistant, state: 'interrupted', streaming: false, localOnly: true });
  return rows;
}
/** Parse actual application SSE. Controlled byte fixtures only test this parser, never provider access. */
export async function* readChatEvents(body, signal) {
  if (!body?.getReader) fail('CHAT_STREAM_FAILED');
  const reader = body.getReader(), decoder = new TextDecoder('utf-8', {fatal:true});
  let buffer = '', doneSeen = false, sourcesRequestId = null, outputLength = 0, bytes = 0;
  const abort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', abort, {once:true});
  const check = () => { if (signal?.aborted) throw new DOMException('Request aborted','AbortError'); };
  try {
    for (;;) {
      check(); const next = await reader.read(); check();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 1024 * 1024) fail('CHAT_TOO_LARGE');
      buffer += decoder.decode(next.value,{stream:true}); let split;
      while ((split = /\r?\n\r?\n/u.exec(buffer))) {
        const frame = buffer.slice(0,split.index); buffer = buffer.slice(split.index + split[0].length);
        const name = frame.split(/\r?\n/u).find(line => line.startsWith('event:'))?.slice(6).trim();
        const data = frame.split(/\r?\n/u).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
        if (!name || !data) continue;
        let value; try {value = JSON.parse(data);} catch {fail('CHAT_STREAM_FAILED');}
        if (name === 'delta') {
          if (doneSeen || sourcesRequestId || typeof value.text !== 'string') fail('CHAT_STREAM_FAILED');
          outputLength += value.text.length; if (outputLength > CHAT_BOUNDS.output) fail('CHAT_TOO_LARGE');
          yield {type:'delta',text:value.text};
        } else if (name === 'activity') {
          if (doneSeen || sourcesRequestId) fail('CHAT_STREAM_FAILED');
          yield {type:'activity',...normalizeLibraryActivity(value)};
        } else if (name === 'sources') {
          if (doneSeen || sourcesRequestId) fail('CHAT_STREAM_FAILED');
          const sources=normalizeLibrarySources(value); sourcesRequestId=sources.requestId;
          outputLength+=sources.appendix.length; if(outputLength>CHAT_BOUNDS.output)fail('CHAT_TOO_LARGE');
          yield {type:'sources',...sources};
        } else if (name === 'conversation') {
          if (!uuid(value.conversationId) || !uuid(value.userMessageId)) fail('CHAT_STREAM_FAILED');
          yield {...value,type:'conversation'};
        } else if (name === 'done') {
          if (doneSeen || sourcesRequestId && sourcesRequestId !== value.requestId || !uuid(value.requestId) || !uuid(value.assistantMessageId)) fail('CHAT_STREAM_FAILED');
          doneSeen = true; yield {...value,type:'done'};
        } else if (name === 'error') {
          if (doneSeen || sourcesRequestId && sourcesRequestId !== value.requestId) fail('CHAT_STREAM_FAILED');
          yield {type:'error',code:typeof value.code === 'string' ? value.code : 'CHAT_STREAM_FAILED'};
          return;
        }
      }
      if (buffer.length > 100000) fail('CHAT_STREAM_FAILED');
    }
    decoder.decode();
    if (!doneSeen || buffer.trim()) fail('CHAT_INCOMPLETE');
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof ChatClientError) throw error;
    fail('CHAT_STREAM_FAILED');
  } finally {
    signal?.removeEventListener('abort',abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

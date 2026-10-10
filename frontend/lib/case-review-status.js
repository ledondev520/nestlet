const coreKeys = ['property','owner','pha','caseReference','rent'];
/** Saved review status is separate from a document's required subset and agency acceptance. */
export function caseReviewRows(record, readiness) {
 const fields=new Map((record?.fields||[]).map(field=>[field.key,field]));
 return coreKeys.map(key=>{
  const field=fields.get(key), missing=readiness?.missing?.find(item=>item.key===key);
  const state=field?.conflict?'conflict':!field?.value?.trim()?'missing':!field.confirmed?'unconfirmed':'reviewed';
  return {key,value:field?.value||'',source:field?.source||'',state,blocksDocument:Boolean(missing),omitted:Boolean(readiness?.omittedOptionalKeys?.includes(key))};
 });
}
const agencyNames={sfha:['sfha','san francisco housing authority','旧金山住房局','旧金山住房机构'],oha:['oha','oakland housing authority','奥克兰住房局'],haca:['haca','housing authority of the county of alameda','阿拉米达县住房局'],sccha:['sccha','santa clara county housing authority','圣克拉拉县住房局']};
export function savedAgencyId(record){
 const field=record?.fields?.find(item=>item.key==='pha');
 if(!field?.value||field.conflict)return null;
 const value=field.value.trim().toLowerCase();
 const matches=Object.entries(agencyNames).filter(([,names])=>names.some(name=>name.length<=5?new RegExp(`\\b${name}\\b`,'u').test(value):value.includes(name)));
 return matches.length===1?matches[0][0]:null;
}

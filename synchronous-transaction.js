/** Synchronous-only reentrant transaction: an inner failure dooms the outer commit. */
export function createSynchronousTransaction(db) {
 let depth=0,failed=null;
 const invoke=action=>{
  if(typeof action!=='function'||action.constructor?.name==='AsyncFunction') throw new TypeError('Transactions require synchronous callbacks');
  const result=action();
  if(result && typeof result.then==='function') throw new TypeError('Transactions cannot return promises');
  return result;
 };
 return action=>{
  if(depth){try{return invoke(action);}catch(error){failed ||= error;throw error;}}
  db.exec('BEGIN IMMEDIATE');depth++;failed=null;
  try{const result=invoke(action);if(failed)throw failed;db.exec('COMMIT');return result;}
  catch(error){db.exec('ROLLBACK');throw error;}
  finally{depth--;failed=null;}
 };
}

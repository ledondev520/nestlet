/** Only an authoritative same-account snapshot can pre-gate AI work.
 * Absent/older-server state still goes through the server's final guard. */
export function serviceAvailabilityError(status){
 const service=status?.service;
 if(!service||service.userId!==status.userId)return null;
 if(service.status==='paused')return 'SERVICE_PAUSED';
 if(service.status==='expired')return 'SERVICE_EXPIRED';
 if(service.status==='available'&&service.remaining===0)return 'TRIAL_LIMIT_REACHED';
 return null;
}

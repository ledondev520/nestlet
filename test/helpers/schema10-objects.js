// Explicit additive schema10 inventory, independent of runtime migration builders.
export const SCHEMA10_OBJECTS = [
 ['index','service_usage_time'],['index','service_usage_user_time'],
 ['table','record_display_counters'],['table','record_display_ids'],['table','service_entitlement_audit'],['table','service_entitlements'],['table','service_recovery_receipts'],['table','service_usage'],
 ...['artifacts','assets','cases','clients','conversations','messages'].map(name=>['trigger',name+'_assign_display_id']),
 ['trigger','record_display_id_no_delete'],['trigger','record_display_id_no_update'],['trigger','service_audit_no_delete'],['trigger','service_audit_no_update'],['trigger','service_recovery_no_delete'],['trigger','service_recovery_no_update']
];
export const sortedSchemaObjects=rows=>rows.slice().sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1]));

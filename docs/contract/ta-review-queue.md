# TA review queue (PA3)

GET /labs/:labId/reviews?page=1&limit=20&view=queue|all returns {items,total,page,limit,requiredPending}.
TA only; authenticated identity and assigned class required. Other-class TA: 404.
Students/admin: 403; invalid credentials: 401; invalid request: 400.
Each item includes source, student display name, frozen constraint text/deduction,
proposal/evidence/reason, current decision, version, required and sampledPass.
Only the latest submission received before the deadline per student is counted
(FAQ-02), and only its latest review run/current constraint revision is shown.
Queue: all violation/unsure and ceil(10% of passes), sampled using random UUID
ordering across the lab; sampling is stable while the eligible population is unchanged.
All view permits overriding other passes (FAQ-10).

POST /labs/:labId/reviews/:itemId/decisions
{verdict:"pass"|"violation",reason:string,evidence:[{line:number,text:string}],version:number}
No default verdict. Reason required (max 4000 chars). Violation needs evidence;
every line must exactly match original source. Pass has empty evidence.
Returns {success:true}. 404 for unavailable item, 409 for stale version,
superseded submission/revision or publication; 422 for invalid evidence.
Decision is append-only with actor/time, previous decisions retained; concurrent
writes use a lab row lock and optimistic version. No grades/publication written.
FAQ-08/09/10: no review data is available through student snapshots.

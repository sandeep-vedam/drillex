// k6 load test for the SRS §9.5 target: 200 concurrent users, p95 < 5 s on submissions, < 3 s on reads.
// Run: k6 run -e API=http://localhost:4000/api/v1 infra/load/k6-smoke.js
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = {
  scenarios: { field: { executor: 'ramping-vus', startVUs: 10, stages: [{ duration: '1m', target: 200 }, { duration: '3m', target: 200 }, { duration: '30s', target: 0 }] } },
  thresholds: { http_req_failed: ['rate<0.01'], 'http_req_duration{kind:read}': ['p(95)<3000'], 'http_req_duration{kind:submit}': ['p(95)<5000'] },
};
const API = __ENV.API || 'http://localhost:4000/api/v1';
const USERS = ['OPR001', 'SUP001', 'TEC001'];
export function setup() {
  return USERS.map((employeeId) => { const r = http.post(`${API}/auth/login`, JSON.stringify({ employeeId, password: 'Password123', deviceId: `k6-${employeeId}` }), { headers: { 'Content-Type': 'application/json' } }); return { employeeId, token: r.json('accessToken') }; });
}
export default function (data) {
  const u = data[__VU % data.length]; const h = { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` } };
  const a = http.get(`${API}/assets`, { ...h, tags: { kind: 'read' } }); check(a, { 'assets 200': (r) => r.status === 200 });
  const s = http.get(`${API}/dashboard/summary`, { ...h, tags: { kind: 'read' } }); check(s, { 'summary 200': (r) => r.status === 200 });
  if (u.employeeId === 'OPR001') {
    const asset = a.json('0.id'); const d = new Date(Date.now() - (1000 + __ITER * 7 + __VU) * 864e5).toISOString().slice(0, 10); // unique far-past dates → no conflicts
    const body = JSON.stringify({ ops: [{ opId: `k6-${__VU}-${__ITER}`, kind: 'daily_reading', payload: { assetId: asset, date: d, hourMeter: 1, fuelStart: 10, fuelEnd: 5, engineOil: 'OK', hydraulicOil: 'OK', coolant: 'OK', airFilter: 'OK', battery: 'OK', preStartChecklistDone: true, warningLights: false, unusualNoises: false, leaks: false, conditionRating: 4, notes: '[k6]' } }] });
    const p = http.post(`${API}/sync/push`, body, { ...h, tags: { kind: 'submit' } }); check(p, { 'sync 201': (r) => r.status === 201 });
  }
  sleep(1);
}

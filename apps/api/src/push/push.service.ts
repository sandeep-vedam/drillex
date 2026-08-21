import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuth } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Push transport (SRS §9.4). Uses FCM HTTP v1 for Android and iOS (via APNs through Firebase).
 * Configure FCM_SERVICE_ACCOUNT_JSON (path or inline JSON) + FCM_PROJECT_ID; without them, pushes are logged only.
 */
@Injectable()
export class PushService {
  private log = new Logger('Push');
  private auth: GoogleAuth | null = null;
  private projectId = process.env.FCM_PROJECT_ID;
  constructor(private prisma: PrismaService) {
    const sa = process.env.FCM_SERVICE_ACCOUNT_JSON;
    if (sa && this.projectId) {
      try {
        const credentials = sa.trim().startsWith('{') ? JSON.parse(sa) : undefined;
        this.auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/firebase.messaging'], ...(credentials ? { credentials } : { keyFile: sa }) });
      } catch (e) { this.log.warn(`FCM disabled: ${(e as Error).message}`); }
    }
  }
  get enabled() { return !!this.auth; }

  async sendToUsers(userIds: string[], msg: { title: string; body?: string; data?: Record<string, string> }) {
    if (!userIds.length) return 0;
    const devices = await this.prisma.device.findMany({ where: { userId: { in: userIds }, approved: true, pushToken: { not: null } }, select: { pushToken: true, id: true } });
    if (!devices.length) return 0;
    if (!this.auth) { this.log.debug(`(push disabled) ${msg.title} → ${devices.length} device(s)`); return 0; }
    const client = await this.auth.getClient(); const token = await client.getAccessToken();
    let sent = 0;
    for (const d of devices) {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, { method: 'POST', headers: { Authorization: `Bearer ${token.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { token: d.pushToken, notification: { title: msg.title, body: msg.body }, data: msg.data, android: { priority: 'high' }, apns: { payload: { aps: { sound: 'default' } } } } }) });
        if (res.status === 404 || res.status === 410) await this.prisma.device.update({ where: { id: d.id }, data: { pushToken: null } }); // stale token
        else if (res.ok) sent++;
        else this.log.warn(`FCM ${res.status}: ${await res.text()}`);
      } catch (e) { this.log.warn(`FCM error: ${(e as Error).message}`); }
    }
    return sent;
  }
}

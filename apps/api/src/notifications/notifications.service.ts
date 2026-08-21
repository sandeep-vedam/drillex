import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

/** In-app notifications now; push/email fan-out hooks in here later (SRS §9.4). */
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private push: PushService) {}

  /** Create in-app notifications for specific users and fan out to their devices. */
  async notifyUsers(userIds: string[], n: { type: string; title: string; body?: string; payload?: object }) {
    if (!userIds.length) return 0;
    await this.prisma.notification.createMany({ data: userIds.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body, payload: n.payload as never })) });
    void this.push.sendToUsers(userIds, { title: n.title, body: n.body, data: { type: n.type } });
    return userIds.length;
  }

  async notifyRoles(siteId: string | null, roles: Array<'SUPERVISOR' | 'TECHNICIAN' | 'MANAGER' | 'ADMIN'>, n: { type: string; title: string; body?: string; payload?: object }) {
    const siteRoles = roles.filter((r) => r !== 'MANAGER' && r !== 'ADMIN');
    const globalRoles = roles.filter((r) => r === 'MANAGER' || r === 'ADMIN');
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', OR: [
        ...(siteRoles.length ? [{ role: { in: siteRoles }, ...(siteId ? { siteId } : {}) }] : []),
        ...(globalRoles.length ? [{ role: { in: globalRoles } }] : []),
      ] },
      select: { id: true },
    });
    if (!users.length) return 0;
    return this.notifyUsers(users.map((u) => u.id), n);
  }
}

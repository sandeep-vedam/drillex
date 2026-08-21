import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** In-app notifications now; push/email fan-out hooks in here later (SRS §9.4). */
@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

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
    await this.prisma.notification.createMany({ data: users.map((u) => ({ userId: u.id, type: n.type, title: n.title, body: n.body, payload: n.payload as never })) });
    return users.length;
  }
}

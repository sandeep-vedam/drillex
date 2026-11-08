import { Body, Controller, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { can, REQUEST_RECIPIENT_ROLES, requestNumber, RequestReplySchema, RequestSchema, RequestTypeLabel, RequestStatusLabel, type RequestInput, type RequestReplyInput } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RolesService } from '../roles/roles.service';
import { RolesModule } from '../roles/roles.module';
import { StorageService } from '../storage/storage.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';

const include = {
  createdBy: { select: { id: true, employeeId: true, name: true, role: true } },
  asset: { select: { id: true, assetNumber: true, name: true, category: true } },
  replies: { include: { author: { select: { employeeId: true, name: true, role: true } } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.RequestInclude;

/**
 * Requests (client spec §4A tab 7, §4B tab 6, §10.5): operators and supervisors ask for consumables, equipment,
 * safety items, HR or finance help. Delivered to the Operations Manager, Finance Manager and Admin, who move it through
 * Received → In Progress → Resolved; replies are visible to the person who asked.
 *
 * Who sees what: your own always; `request:manage` holders see all; otherwise `request:read` by scope — a drilling
 * supervisor (site) sees rig operators' requests on their site, the plant hire supervisor (all) plant operators' requests.
 */
@Injectable()
export class RequestsService {
  constructor(private prisma: PrismaService, private notify: NotificationsService, private roles: RolesService, private storage: StorageService) {}

  private async visible(u: AuthUser): Promise<Prisma.RequestWhereInput> {
    const m = await this.roles.getMatrix();
    if (can(m, u.role, 'request:manage')) return {};
    const scope = can(m, u.role, 'request:read');
    const own = { createdById: u.id };
    if (scope === 'site') return { OR: [own, { siteId: u.siteId ?? '__none__', asset: { category: 'DRILLING' } }] };
    if (scope === 'all') return { OR: [own, { asset: { category: { not: 'DRILLING' } } }] };
    return own;
  }
  private async canManage(u: AuthUser) { return !!can(await this.roles.getMatrix(), u.role, 'request:manage'); }

  async list(u: AuthUser, q: { status?: string; type?: string; mine?: string }) {
    const rows = await this.prisma.request.findMany({
      where: { AND: [await this.visible(u), q.status ? { status: q.status as never } : {}, q.type ? { type: q.type as never } : {}, q.mine === '1' ? { createdById: u.id } : {}] },
      include, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 300,
    });
    // Urgent first within each status, then newest.
    const rank = { URGENT: 0, MEDIUM: 1, LOW: 2 } as const;
    return rows.sort((a, b) => a.status.localeCompare(b.status) || rank[a.priority] - rank[b.priority] || +b.createdAt - +a.createdAt);
  }

  async get(u: AuthUser, id: string) {
    const r = await this.prisma.request.findFirst({ where: { AND: [{ id }, await this.visible(u)] }, include });
    if (!r) throw new NotFoundException('Request not found');
    const atts = await this.prisma.attachment.findMany({ where: { ownerType: 'Request', ownerId: id }, orderBy: { createdAt: 'asc' } });
    return { ...r, attachments: await Promise.all(atts.map(async (a) => ({ id: a.id, kind: a.kind, url: await this.storage.urlFor(a.storageKey) }))) };
  }

  /** Machine and site are filled from the submitter's assignment when not given (spec: auto-filled). */
  async create(u: AuthUser, input: RequestInput) {
    if (input.id) { const dup = await this.prisma.request.findUnique({ where: { id: input.id }, include }); if (dup) return dup; } // offline replay
    let assetId = input.assetId ?? null;
    if (!assetId) assetId = (await this.prisma.assetOperator.findFirst({ where: { userId: u.id, validTo: null }, orderBy: { validFrom: 'desc' } }))?.assetId ?? null;
    const asset = assetId ? await this.prisma.asset.findFirst({ where: { id: assetId, deletedAt: null } }) : null;
    if (assetId && !asset) throw new NotFoundException('Machine not found');
    const r = await this.prisma.request.create({ data: { ...(input.id ? { id: input.id } : {}), type: input.type, priority: input.priority, details: input.details, assetId, siteId: asset?.siteId ?? u.siteId, createdById: u.id }, include });
    await this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Request', entityId: r.id, action: 'CREATE', diff: { type: r.type, priority: r.priority } } });
    await this.notify.notifyRoles(null, REQUEST_RECIPIENT_ROLES, {
      type: 'request_new', title: `${r.priority === 'URGENT' ? 'URGENT · ' : ''}${requestNumber(r.number)} · ${RequestTypeLabel[r.type]} request`,
      body: `${u.employeeId}${asset ? ` (${asset.assetNumber})` : ''}: ${r.details.slice(0, 140)}`, payload: { requestId: r.id },
    });
    return r;
  }

  /** A reply, a status change, or both. Only managers of requests change status; the requester may add a follow-up. */
  async reply(u: AuthUser, id: string, b: RequestReplyInput) {
    const r = await this.get(u, id);
    const manage = await this.canManage(u);
    if (!manage && r.createdById !== u.id) throw new ForbiddenException('You cannot reply to this request');
    if (b.status && !manage) throw new ForbiddenException('Only the office can change a request’s status');
    const status = b.status && b.status !== r.status ? b.status : undefined;
    await this.prisma.$transaction([
      this.prisma.requestReply.create({ data: { requestId: id, authorId: u.id, body: b.body, status } }),
      ...(status ? [this.prisma.request.update({ where: { id }, data: { status, resolvedAt: status === 'RESOLVED' ? new Date() : null } })] : []),
      this.prisma.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity: 'Request', entityId: id, action: status ? `STATUS_${status}` : 'REPLY' } }),
    ]);
    const title = `${requestNumber(r.number)}${status ? ` is now ${RequestStatusLabel[status].toLowerCase()}` : ' · new reply'}`;
    if (u.id !== r.createdById) await this.notify.notifyUsers([r.createdById], { type: 'request_reply', title, body: b.body ? `${u.employeeId}: ${b.body.slice(0, 160)}` : undefined, payload: { requestId: id } });
    else await this.notify.notifyRoles(null, REQUEST_RECIPIENT_ROLES, { type: 'request_reply', title, body: `${u.employeeId}: ${b.body.slice(0, 160)}`, payload: { requestId: id } });
    return this.get(u, id);
  }
}

@Controller('requests')
export class RequestsController {
  constructor(private svc: RequestsService) {}
  @Get() @RequirePermission('request:read', 'request:create', 'request:manage') list(@CurrentUser() u: AuthUser, @Query() q: Record<string, string>) { return this.svc.list(u, q); }
  @Get(':id') @RequirePermission('request:read', 'request:create', 'request:manage') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.svc.get(u, id); }
  @Post() @RequirePermission('request:create') create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(RequestSchema)) b: RequestInput) { return this.svc.create(u, b); }
  @Post(':id/replies') @RequirePermission('request:create', 'request:manage') reply(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(RequestReplySchema)) b: RequestReplyInput) { return this.svc.reply(u, id, b); }
}

@Module({ imports: [RolesModule], controllers: [RequestsController], providers: [RequestsService], exports: [RequestsService] })
export class RequestsModule {}

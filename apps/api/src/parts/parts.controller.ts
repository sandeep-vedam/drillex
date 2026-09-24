import { BadRequestException, Body, ConflictException, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PR_TRANSITIONS } from '@drillex/shared';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { NotificationsService } from '../notifications/notifications.service';

const PartSchema = z.object({ partNo: z.string().min(1), name: z.string().min(1), qtyOnHand: z.number().int().nonnegative().default(0), minQty: z.number().int().nonnegative().default(0), unitCost: z.number().nonnegative().optional() });
const PRSchema = z.object({ partId: z.string().uuid(), quantity: z.number().int().positive(), notes: z.string().optional() });
const PRStatusSchema = z.object({ status: z.enum(['ORDERED', 'RECEIVED', 'CANCELLED']) });
const MoveSchema = z.object({ type: z.enum(['IN', 'OUT', 'ADJUST']), quantity: z.number().int(), reference: z.string().optional() });

/** Throws if decrementing `partId` by `qty` would take qtyOnHand below zero. Must run inside the same transaction as the decrement. */
export async function assertSufficientStock(tx: Prisma.TransactionClient, partId: string, qty: number) {
  if (qty <= 0) return;
  const part = await tx.part.findUniqueOrThrow({ where: { id: partId } });
  if (part.qtyOnHand < qty) throw new BadRequestException(`Insufficient stock for ${part.partNo} (${part.qtyOnHand} on hand, ${qty} requested)`);
}

@Controller('parts')
export class PartsController {
  constructor(private prisma: PrismaService, private notify: NotificationsService) {}
  @Get() @RequirePermission('parts:read') list(@Query('q') q?: string) {
    return this.prisma.part.findMany({ where: q ? { OR: [{ partNo: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}, orderBy: { partNo: 'asc' } });
  }
  @Post() @RequirePermission('parts:write')
  async create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(PartSchema)) b: z.infer<typeof PartSchema>) {
    const part = await this.prisma.part.create({ data: b });
    await this.audit(u, 'Part', part.id, 'CREATE', b);
    return part;
  }
  /** Stock movement (receipt, issue, stock-take adjustment). Low-stock alert when below minimum (SRS §7.3). */
  @Post(':id/movements') @RequirePermission('parts:write')
  async move(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(MoveSchema)) b: z.infer<typeof MoveSchema>) {
    const delta = b.type === 'IN' ? Math.abs(b.quantity) : b.type === 'OUT' ? -Math.abs(b.quantity) : b.quantity;
    const part = await this.prisma.$transaction(async (tx) => {
      if (delta < 0) await assertSufficientStock(tx, id, -delta);
      await tx.partStockMovement.create({ data: { partId: id, type: b.type, quantity: delta, reference: b.reference ?? `${u.employeeId}` } });
      const updated = await tx.part.update({ where: { id }, data: { qtyOnHand: { increment: delta } } });
      await this.audit(u, 'Part', id, `STOCK_${b.type}`, { quantity: delta, reference: b.reference, qtyOnHand: updated.qtyOnHand }, tx);
      return updated;
    });
    if (part.qtyOnHand < part.minQty) await this.notify.notifyRoles(null, ['MANAGER', 'TECHNICIAN'], { type: 'low_stock', title: `Low stock: ${part.partNo} ${part.name}`, body: `${part.qtyOnHand} on hand, minimum ${part.minQty}.`, payload: { partId: part.id } });
    return part;
  }
  @Patch(':id') @RequirePermission('parts:write')
  async update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(PartSchema.partial())) b: Partial<z.infer<typeof PartSchema>>) {
    const before = await this.prisma.part.findUniqueOrThrow({ where: { id } });
    const part = await this.prisma.part.update({ where: { id }, data: b });
    await this.audit(u, 'Part', id, 'UPDATE', { before: Object.fromEntries(Object.keys(b).map((k) => [k, before[k as keyof typeof before]])), after: b });
    return part;
  }
  /** Purchase requests (SRS §10.1 Parts Inventory: raise purchase requests). Receiving books stock IN automatically. */
  @Get('purchase-requests/all') @RequirePermission('parts:read') prs(@Query('status') status?: string) { return this.prisma.purchaseRequest.findMany({ where: status ? { status: status as never } : {}, include: { part: true }, orderBy: { createdAt: 'desc' } }); }
  @Post('purchase-requests') @RequirePermission('parts:write')
  async raisePr(@CurrentUser() u: AuthUser, @Body(new ZodPipe(PRSchema)) b: z.infer<typeof PRSchema>) {
    const pr = await this.prisma.purchaseRequest.create({ data: { ...b, requestedBy: u.employeeId }, include: { part: true } });
    await this.audit(u, 'PurchaseRequest', pr.id, 'CREATE', b);
    await this.notify.notifyRoles(null, ['MANAGER'], { type: 'purchase_request', title: `Purchase request: ${pr.quantity} × ${pr.part.partNo} ${pr.part.name}`, body: `Raised by ${u.employeeId}${b.notes ? ` — ${b.notes}` : ''}`, payload: { purchaseRequestId: pr.id } });
    return pr;
  }
  @Patch('purchase-requests/:id') @RequirePermission('parts:write')
  async prStatus(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(PRStatusSchema)) b: z.infer<typeof PRStatusSchema>) {
    const pr = await this.prisma.purchaseRequest.findUniqueOrThrow({ where: { id } });
    // SRS §7.5: only forward moves (OPEN → ORDERED → RECEIVED, or CANCELLED before receipt).
    const from = Object.keys(PR_TRANSITIONS).filter((s) => PR_TRANSITIONS[s].includes(b.status));
    if (!from.includes(pr.status)) throw new ConflictException(`A ${pr.status.toLowerCase()} purchase request cannot be marked ${b.status.toLowerCase()}`);
    return this.prisma.$transaction(async (tx) => {
      // Conditional on the current status, so two simultaneous "received" clicks cannot both book the stock in.
      const moved = await tx.purchaseRequest.updateMany({ where: { id, status: { in: from as never } }, data: { status: b.status, ...(b.status === 'ORDERED' ? { orderedAt: new Date() } : {}), ...(b.status === 'RECEIVED' ? { receivedAt: new Date() } : {}) } });
      if (!moved.count) throw new ConflictException('This purchase request was just updated by someone else — reload and try again');
      if (b.status === 'RECEIVED') {
        await tx.partStockMovement.create({ data: { partId: pr.partId, type: 'IN', quantity: pr.quantity, reference: `PR ${id.slice(0, 8)} received by ${u.employeeId}` } });
        await tx.part.update({ where: { id: pr.partId }, data: { qtyOnHand: { increment: pr.quantity } } });
      }
      await this.audit(u, 'PurchaseRequest', id, `STATUS_${b.status}`, { from: pr.status, to: b.status }, tx);
      return tx.purchaseRequest.findUniqueOrThrow({ where: { id }, include: { part: true } });
    });
  }
  private audit(u: AuthUser, entity: string, entityId: string, action: string, diff: unknown, tx: Prisma.TransactionClient = this.prisma) {
    return tx.auditLog.create({ data: { actorId: u.id, deviceId: u.deviceId, entity, entityId, action, diff: diff as never } });
  }
  @Get(':id/movements') @RequirePermission('parts:read') movements(@Param('id') id: string) { return this.prisma.partStockMovement.findMany({ where: { partId: id }, orderBy: { createdAt: 'desc' }, take: 100 }); }
}

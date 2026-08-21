import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, RequirePermission } from '../auth/decorators';
import { ZodPipe } from '../common/zod.pipe';
import { NotificationsService } from '../notifications/notifications.service';

const PartSchema = z.object({ partNo: z.string().min(1), name: z.string().min(1), qtyOnHand: z.number().int().nonnegative().default(0), minQty: z.number().int().nonnegative().default(0), unitCost: z.number().nonnegative().optional() });
const MoveSchema = z.object({ type: z.enum(['IN', 'OUT', 'ADJUST']), quantity: z.number().int(), reference: z.string().optional() });

@Controller('parts')
export class PartsController {
  constructor(private prisma: PrismaService, private notify: NotificationsService) {}
  @Get() @RequirePermission('parts:read') list(@Query('q') q?: string) {
    return this.prisma.part.findMany({ where: q ? { OR: [{ partNo: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}, orderBy: { partNo: 'asc' } });
  }
  @Post() @RequirePermission('parts:write') create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(PartSchema)) b: z.infer<typeof PartSchema>) { return this.prisma.part.create({ data: b }); }
  /** Stock movement (receipt, issue, stock-take adjustment). Low-stock alert when below minimum (SRS §7.3). */
  @Post(':id/movements') @RequirePermission('parts:write')
  async move(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(MoveSchema)) b: z.infer<typeof MoveSchema>) {
    const delta = b.type === 'IN' ? Math.abs(b.quantity) : b.type === 'OUT' ? -Math.abs(b.quantity) : b.quantity;
    const part = await this.prisma.$transaction(async (tx) => {
      await tx.partStockMovement.create({ data: { partId: id, type: b.type, quantity: delta, reference: b.reference ?? `${u.employeeId}` } });
      return tx.part.update({ where: { id }, data: { qtyOnHand: { increment: delta } } });
    });
    if (part.qtyOnHand < part.minQty) await this.notify.notifyRoles(null, ['MANAGER', 'TECHNICIAN'], { type: 'low_stock', title: `Low stock: ${part.partNo} ${part.name}`, body: `${part.qtyOnHand} on hand, minimum ${part.minQty}.`, payload: { partId: part.id } });
    return part;
  }
  @Get(':id/movements') @RequirePermission('parts:read') movements(@Param('id') id: string) { return this.prisma.partStockMovement.findMany({ where: { partId: id }, orderBy: { createdAt: 'desc' }, take: 100 }); }
}

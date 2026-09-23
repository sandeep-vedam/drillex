import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Permissions, type Permission, type PermissionMatrix, type Scope } from '@drillex/shared';
import { PrismaService } from '../prisma/prisma.service';

const SCOPES: Scope[] = ['self', 'site', 'all'];
export type PermissionGrant = { permission: Permission; scope: Scope };

/** Owns the database-backed permission matrix: reads it (cached — `can()` runs on every API request),
 *  and mutates roles/grants, invalidating the cache on write. Single-process cache: a horizontally
 *  scaled deployment would need a shared invalidation signal instead of this in-memory Map. */
@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}
  private cache: PermissionMatrix | null = null;

  invalidate() { this.cache = null; }

  async getMatrix(): Promise<PermissionMatrix> {
    if (this.cache) return this.cache;
    const roles = await this.prisma.role.findMany({ include: { permissions: true } });
    const matrix: PermissionMatrix = {};
    for (const r of roles) {
      matrix[r.key] = {};
      for (const g of r.permissions) matrix[r.key][g.permission as Permission] = g.scope as Scope;
    }
    this.cache = matrix;
    return matrix;
  }

  list() {
    return this.prisma.role
      .findMany({ include: { permissions: true, _count: { select: { users: true } } }, orderBy: { createdAt: 'asc' } })
      .then((roles) => roles.map((r) => ({
        id: r.id, key: r.key, name: r.name, isSystem: r.isSystem, userCount: r._count.users,
        permissions: r.permissions.map((p) => ({ permission: p.permission, scope: p.scope })),
      })));
  }

  async exists(key: string) { return !!(await this.prisma.role.findUnique({ where: { key } })); }

  private slugify(name: string) {
    return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'ROLE';
  }

  private validateGrants(grants: PermissionGrant[]) {
    for (const g of grants) {
      if (!(Permissions as readonly string[]).includes(g.permission)) throw new BadRequestException(`Unknown permission: ${g.permission}`);
      if (!SCOPES.includes(g.scope)) throw new BadRequestException(`Unknown scope: ${g.scope}`);
    }
  }

  async create(actorId: string, input: { name: string; permissions: PermissionGrant[] }) {
    this.validateGrants(input.permissions);
    const base = this.slugify(input.name);
    let key = base, n = 1;
    while (await this.exists(key)) key = `${base}_${++n}`;
    const role = await this.prisma.role.create({
      data: { key, name: input.name, permissions: { create: input.permissions } },
      include: { permissions: true },
    });
    await this.prisma.auditLog.create({ data: { actorId, entity: 'Role', entityId: role.id, action: 'CREATE' } });
    this.invalidate();
    return role;
  }

  async update(actorId: string, id: string, input: { name?: string; permissions?: PermissionGrant[] }) {
    if (input.permissions) this.validateGrants(input.permissions);
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    await this.prisma.$transaction(async (tx) => {
      if (input.name) await tx.role.update({ where: { id }, data: { name: input.name } });
      if (input.permissions) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (input.permissions.length) await tx.rolePermission.createMany({ data: input.permissions.map((g) => ({ roleId: id, permission: g.permission, scope: g.scope })) });
      }
    });
    await this.prisma.auditLog.create({ data: { actorId, entity: 'Role', entityId: id, action: 'UPDATE' } });
    this.invalidate();
    return this.prisma.role.findUniqueOrThrow({ where: { id }, include: { permissions: true } });
  }

  async remove(actorId: string, id: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('Built-in roles cannot be deleted');
    if (role._count.users > 0) throw new ConflictException(`${role._count.users} user(s) still have this role`);
    await this.prisma.role.delete({ where: { id } });
    await this.prisma.auditLog.create({ data: { actorId, entity: 'Role', entityId: id, action: 'DELETE' } });
    this.invalidate();
  }
}

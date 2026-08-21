import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Controller('sites')
export class SitesController {
  constructor(private prisma: PrismaService) {}
  @Get() list() { return this.prisma.site.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }); }
}

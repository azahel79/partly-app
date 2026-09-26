import { Injectable } from '@nestjs/common';
import { CommissionChargeStatus, GroupApprovalStatus, IncidentStatus, ProviderOrderStatus, ProviderProfileStatus, WholesaleAccessStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type ActivityItem = {
  id: string;
  type: 'USER' | 'PROVIDER' | 'GROUP' | 'COMMISSION' | 'INCIDENT';
  title: string;
  detail: string;
  createdAt: Date;
  route: string;
};

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const now = new Date();
    const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

    const [pendingProviders, pendingGroups, pendingCommissions, pendingWholesaleAccess, pendingOrderPayments, escalatedIncidents, totalUsers, usersForChart,
      recentUsers, recentProviders, recentGroups, recentCommissions, recentIncidents] = await Promise.all([
      this.prisma.providerProfile.count({ where: { status: ProviderProfileStatus.PENDING } }),
      this.prisma.group.count({ where: { approvalStatus: GroupApprovalStatus.PENDING } }),
      this.prisma.commissionCharge.count({ where: { status: CommissionChargeStatus.IN_REVIEW } }),
      this.prisma.wholesaleAccess.count({ where: { status: WholesaleAccessStatus.REQUESTED } }),
      this.prisma.providerOrder.count({ where: { status: ProviderOrderStatus.PENDING_APPROVAL } }),
      this.prisma.incident.count({ where: { status: IncidentStatus.ESCALATED } }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.findMany({ where: { deletedAt: null }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true, email: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 4 }),
      this.prisma.providerProfile.findMany({ include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 4 }),
      this.prisma.group.findMany({ include: { owner: { select: { name: true } }, plan: { include: { platform: true } } }, orderBy: { createdAt: 'desc' }, take: 4 }),
      this.prisma.commissionCharge.findMany({ where: { status: CommissionChargeStatus.IN_REVIEW }, include: { seller: { select: { name: true } } }, orderBy: { receiptUploadedAt: 'desc' }, take: 4 }),
      this.prisma.incident.findMany({ include: { reportedBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 4 }),
    ]);

    const monthKeys = Array.from({ length: 12 }, (_, index) => {
      const date = new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + index, 1));
      return date.toISOString().slice(0, 7);
    });
    const monthlyNewUsers = new Map(monthKeys.map((key) => [key, 0]));
    let cumulative = 0;
    for (const user of usersForChart) {
      if (user.createdAt < firstMonth) cumulative += 1;
      else {
        const key = user.createdAt.toISOString().slice(0, 7);
        if (monthlyNewUsers.has(key)) monthlyNewUsers.set(key, (monthlyNewUsers.get(key) ?? 0) + 1);
      }
    }
    const userGrowth = monthKeys.map((key) => {
      const newUsers = monthlyNewUsers.get(key) ?? 0;
      cumulative += newUsers;
      return { month: `${key}-01`, total: cumulative, newUsers };
    });
    const currentMonthUsers = usersForChart.filter((user) => user.createdAt >= currentMonth).length;
    const previousMonthUsers = usersForChart.filter((user) => user.createdAt >= previousMonth && user.createdAt < currentMonth).length;
    const monthlyChange = previousMonthUsers === 0 ? (currentMonthUsers > 0 ? 100 : 0) : Math.round(((currentMonthUsers - previousMonthUsers) / previousMonthUsers) * 100);

    const activity: ActivityItem[] = [
      ...recentUsers.map((item) => ({ id: item.id, type: 'USER' as const, title: 'Nuevo usuario registrado', detail: `${item.name} · ${item.email}`, createdAt: item.createdAt, route: '/admin/usuarios' })),
      ...recentProviders.map((item) => ({ id: item.id, type: 'PROVIDER' as const, title: 'Solicitud de proveedor', detail: `${item.businessName} · ${item.user.name}`, createdAt: item.createdAt, route: '/admin/proveedores' })),
      ...recentGroups.map((item) => ({ id: item.id, type: 'GROUP' as const, title: 'Grupo enviado a revisión', detail: `${item.plan.platform.name} · ${item.owner.name}`, createdAt: item.createdAt, route: '/admin/grupos' })),
      ...recentCommissions.map((item) => ({ id: item.id, type: 'COMMISSION' as const, title: 'Comisión por revisar', detail: `${item.seller.name} · $${item.amount.toString()} MXN`, createdAt: item.receiptUploadedAt ?? item.createdAt, route: '/admin/comisiones' })),
      ...recentIncidents.map((item) => ({ id: item.id, type: 'INCIDENT' as const, title: 'Incidencia reportada', detail: `${item.subject} · ${item.reportedBy.name}`, createdAt: item.createdAt, route: `/admin/incidencias/${item.id}` })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 5);

    return {
      generatedAt: now,
      counts: { pendingProviders, pendingGroups, pendingCommissions, pendingWholesaleAccess, pendingOrderPayments, escalatedIncidents, totalUsers },
      users: { monthlyChange, currentMonth: currentMonthUsers, previousMonth: previousMonthUsers, growth: userGrowth },
      activity,
    };
  }
}

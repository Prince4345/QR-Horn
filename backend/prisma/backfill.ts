import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizePlate(number: string) {
  return number.replace(/\s+/g, '').toUpperCase();
}

async function main() {
  const vehicles = await prisma.vehicle.findMany();
  for (const v of vehicles) {
    const normalized = normalizePlate(v.number);
    if (v.numberNormalized !== normalized) {
      await prisma.vehicle.update({
        where: { id: v.id },
        data: { numberNormalized: normalized },
      });
    }
  }

  const owners = await prisma.owner.findMany({ where: { fcmToken: { not: null } } });
  for (const owner of owners) {
    if (!owner.fcmToken) continue;
    await prisma.ownerPushToken.upsert({
      where: { token: owner.fcmToken },
      create: { ownerId: owner.id, token: owner.fcmToken, device: 'web' },
      update: { ownerId: owner.id },
    });
  }

  console.log('Backfill complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

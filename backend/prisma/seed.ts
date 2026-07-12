import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';

const prisma = new PrismaClient();

function normalizePlate(number: string) {
  return number.replace(/\s+/g, '').toUpperCase();
}

async function main() {
  await prisma.activity.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.call.deleteMany();
  await prisma.sticker.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.owner.deleteMany();

  const owner = await prisma.owner.create({
    data: {
      name: 'Prince',
      email: 'prince@example.com',
      phone: '+919876543210',
    },
  });

  const honda = await prisma.vehicle.create({
    data: {
      ownerId: owner.id,
      name: 'Honda City',
      number: 'DL 8C AA 1111',
      numberNormalized: normalizePlate('DL 8C AA 1111'),
      type: 'car',
      active: true,
      theftMode: true,
      sticker: {
        create: { code: nanoid(10), themeId: 'default' },
      },
    },
    include: { sticker: true },
  });

  const duke = await prisma.vehicle.create({
    data: {
      ownerId: owner.id,
      name: 'Duke 390',
      number: 'HR 26 BR 9999',
      numberNormalized: normalizePlate('HR 26 BR 9999'),
      type: 'bike',
      active: true,
      theftMode: false,
      sticker: {
        create: { code: nanoid(10), themeId: 'dark' },
      },
    },
    include: { sticker: true },
  });

  const seedActivities = [
    { vehicleId: honda.id, type: 'notification' as const, description: 'Please move your vehicle', daysAgo: 0 },
    { vehicleId: honda.id, type: 'call' as const, description: 'Incoming secure call', daysAgo: 1 },
    { vehicleId: honda.id, type: 'notification' as const, description: 'Lights are ON', daysAgo: 30 },
    { vehicleId: duke.id, type: 'notification' as const, description: 'Wrong parking', daysAgo: 2 },
  ];

  for (const act of seedActivities) {
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - act.daysAgo);

    await prisma.activity.create({
      data: {
        vehicleId: act.vehicleId,
        type: act.type,
        description: act.description,
        createdAt,
      },
    });
  }

  for (let i = 0; i < 20; i++) {
    await prisma.notification.create({
      data: { vehicleId: honda.id, reason: 'move' },
    });
  }
  for (let i = 0; i < 5; i++) {
    await prisma.call.create({
      data: { vehicleId: honda.id, status: 'COMPLETED' },
    });
  }

  console.log('Seed complete.');
  console.log(`Honda City scan code: ${honda.sticker!.code}`);
  console.log(`Duke 390 scan code: ${duke.sticker!.code}`);
  console.log('Note: Demo owner has no Supabase auth — sign up to create your own account.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { PrismaClient, Role, SignupRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Seed the database with an admin user, a couple of judge/competitor users,
 * and one sample event with a rubric and time slots so the end-to-end flow
 * can be exercised immediately after `prisma migrate dev`.
 */
async function main() {
  const passwordHash = await bcrypt.hash('password', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@tsa.local' },
    update: {},
    create: {
      email: 'admin@tsa.local',
      name: 'Org Admin',
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const judge1 = await prisma.user.upsert({
    where: { email: 'judge1@tsa.local' },
    update: {},
    create: {
      email: 'judge1@tsa.local',
      name: 'Jamie Judge',
      passwordHash,
      role: Role.JUDGE,
    },
  });

  const comp1 = await prisma.user.upsert({
    where: { email: 'student1@tsa.local' },
    update: {},
    create: {
      email: 'student1@tsa.local',
      name: 'Sam Student',
      passwordHash,
      role: Role.COMPETITOR,
    },
  });

  const now = new Date();
  const startsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 6 * 60 * 60 * 1000);
  const signupClosesAt = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);

  const event = await prisma.event.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: 'Spring Showcase 2026',
      description: 'Annual student competition. Sign up to compete or to judge.',
      location: 'Main Campus Hall',
      startsAt,
      endsAt,
      signupClosesAt,
      status: 'OPEN',
      rubric: {
        create: {
          criteria: [
            { name: 'Content', maxScore: 10, weight: 0.4 },
            { name: 'Delivery', maxScore: 10, weight: 0.4 },
            { name: 'Creativity', maxScore: 10, weight: 0.2 },
          ],
        },
      },
      timeSlots: {
        create: [
          {
            startsAt,
            endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
            capacity: 3,
            room: 'Room A',
          },
          {
            startsAt,
            endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
            capacity: 3,
            room: 'Room B',
          },
          {
            startsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
            endsAt: new Date(startsAt.getTime() + 2 * 60 * 60 * 1000),
            capacity: 3,
            room: 'Room A',
          },
        ],
      },
    },
    include: { timeSlots: true },
  });

  // Seed one competitor + one judge signup so the assignment flow has data.
  const firstSlot = event.timeSlots[0];
  if (firstSlot) {
    await prisma.signup.upsert({
      where: { eventId_userId_role: { eventId: event.id, userId: comp1.id, role: SignupRole.COMPETITOR } },
      update: {},
      create: {
        eventId: event.id,
        userId: comp1.id,
        role: SignupRole.COMPETITOR,
        timeSlotId: firstSlot.id,
      },
    });
  }

  await prisma.signup.upsert({
    where: { eventId_userId_role: { eventId: event.id, userId: judge1.id, role: SignupRole.JUDGE } },
    update: {},
    create: {
      eventId: event.id,
      userId: judge1.id,
      role: SignupRole.JUDGE,
    },
  });

  console.log('Seed complete.');
  console.log('  Admin login: admin@tsa.local / password');
  console.log('  Judge login: judge1@tsa.local / password');
  console.log('  Competitor login: student1@tsa.local / password');
  console.log(`  Sample event: ${event.name} (id=${event.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
import 'dotenv/config';
import { faker } from '@faker-js/faker';
import { PrismaClient, TodoStatus } from '@prisma/client';

const prisma = new PrismaClient();
const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];

async function main() {
  const count = Number(process.env.SEED_TODOS ?? 1000);
  const batchSize = 1000;

  for (let offset = 0; offset < count; offset += batchSize) {
    const rows = Array.from({ length: Math.min(batchSize, count - offset) }, (_, index) => {
      const seed = offset + index + 1;
      const order = seed * 1000;
      faker.seed(seed);
      const startDate = faker.date.between({ from: '2024-01-01T00:00:00.000Z', to: '2026-12-31T23:59:59.999Z' });

      return {
        title: faker.hacker.phrase(),
        description: faker.lorem.sentences({ min: 1, max: 3 }),
        status: seed % 3 === 0 ? TodoStatus.completed : TodoStatus.pending,
        order,
        dueDateTime: faker.date.soon({ days: 45, refDate: startDate }),
        startDateTime: startDate,
        color: COLORS[seed % COLORS.length],
      };
    });

    await prisma.todo.createMany({ data: rows });
    console.log(`Seeded ${Math.min(offset + batchSize, count)} / ${count}`);
  }
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

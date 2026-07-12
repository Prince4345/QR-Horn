import { PrismaClient } from '@prisma/client';

const CONNECTION_ERROR_CODES = new Set(['P1001', 'P1008', 'P1017']);

function isConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  if (CONNECTION_ERROR_CODES.has(code)) return true;
  const message = 'message' in error ? String(error.message).toLowerCase() : '';
  return (
    message.includes('connection reset') ||
    message.includes('forcibly closed') ||
    message.includes('connection terminated') ||
    message.includes('econnreset') ||
    message.includes('closed by the remote host')
  );
}

function createPrismaClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  return base.$extends({
    query: {
      $allOperations({ args, query }) {
        return query(args).catch(async (error: unknown) => {
          if (!isConnectionError(error)) throw error;
          await base.$disconnect().catch(() => {});
          await base.$connect();
          return query(args);
        });
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof createPrismaClient> };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

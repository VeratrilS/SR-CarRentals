const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { config } = require('../config');
const { publishAvailability } = require('../services/inventory.service');
const { cleanExpiredSeatHolds } = require('../services/trip.service');

let intervalHandle = null;

// PostgreSQL advisory lock ID for leader election.
// Only one instance holds this lock at a time (try-lock, non-blocking).
const ADVISORY_LOCK_ID = 800001;

/**
 * Try to become the leader for this expiry cycle using pg_try_advisory_lock.
 * Returns true if this instance acquired the lock. The lock is session-level
 * and released explicitly after the job finishes.
 */
async function tryAcquireLeadership() {
     try {
          const result = await prisma.$queryRaw`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS acquired`;
          return result[0].acquired === true;
     } catch (err) {
          logger.error('Failed to acquire lock expiry leadership', { error: err.message });
          return false;
     }
}

async function releaseLeadership() {
     try {
          await prisma.$queryRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`;
     } catch (err) {
          logger.error('Failed to release lock expiry leadership', { error: err.message });
     }
}

/**
 * Remove LOCKED holds whose payment window has passed, then republish the
 * availability of every affected car so search results free them up again.
 */
async function cleanExpiredLocks() {
     const isLeader = await tryAcquireLeadership();
     if (!isLeader) {
          logger.debug('Skipping lock expiry job — another instance is the leader');
          return;
     }

     try {
          // Shared-ride seats whose payment window passed
          await cleanExpiredSeatHolds().catch((err) => logger.error('Seat hold cleanup failed', { error: err.message }));

          const expiredHolds = await prisma.rentalHold.findMany({
               where: { status: 'LOCKED', lockExpiresAt: { lt: new Date() } },
               select: { id: true, carId: true },
          });

          if (expiredHolds.length === 0) return;

          logger.info(`Found ${expiredHolds.length} expired hold(s) to clean up`);

          await prisma.rentalHold.deleteMany({
               where: {
                    id: { in: expiredHolds.map(h => h.id) },
                    status: 'LOCKED', // never delete a hold that was confirmed meanwhile
               },
          });

          const affectedCars = [...new Set(expiredHolds.map(h => h.carId))];
          for (const carId of affectedCars) {
               await publishAvailability(carId);
          }

          logger.info(`Released expired holds on ${affectedCars.length} car(s)`);
     } catch (error) {
          logger.error('Lock expiry cleanup failed', { error: error.message });
     } finally {
          await releaseLeadership();
     }
}

function startLockExpiryJob() {
     // Run once immediately
     cleanExpiredLocks();

     intervalHandle = setInterval(cleanExpiredLocks, config.LOCK_EXPIRY_INTERVAL_MS);
     logger.info(`Lock expiry job started (interval: ${config.LOCK_EXPIRY_INTERVAL_MS}ms)`);
}

function stopLockExpiryJob() {
     if (intervalHandle) {
          clearInterval(intervalHandle);
          intervalHandle = null;
          logger.info('Lock expiry job stopped');
     }
}

module.exports = { startLockExpiryJob, stopLockExpiryJob };

const prisma = require('./prisma');
const logger = require('./logger');

/**
 * Database-level guarantees against double booking (whole-car rentals and shared-ride seats).
 *
 * The application already serialises holds per car (row lock on car_inventories +
 * overlap check), but an EXCLUSION constraint makes overlapping active holds on the
 * same car physically impossible — even if a future code path forgets the check.
 *
 *   EXCLUDE USING gist ("carId" WITH =, tsrange("startAt","endAt") WITH &&)
 *
 * Prisma cannot express exclusion constraints in schema.prisma, so we apply it
 * idempotently on startup. Requires the btree_gist extension (for "carId" WITH =).
 */
const ensureDbConstraints = async () => {
     try {
          await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
          await prisma.$executeRawUnsafe(`
               DO $$
               BEGIN
                    IF NOT EXISTS (
                         SELECT 1 FROM pg_constraint WHERE conname = 'rental_holds_no_overlap'
                    ) THEN
                         ALTER TABLE rental_holds
                         ADD CONSTRAINT rental_holds_no_overlap
                         EXCLUDE USING gist (
                              "carId" WITH =,
                              tsrange("startAt", "endAt", '[)') WITH &&
                         );
                    END IF;
               END $$;
          `);
          logger.info('DB constraint rental_holds_no_overlap is in place');

          // Shared rides: the same seat can't be held twice for overlapping stretches of a trip
          await prisma.$executeRawUnsafe(`
               DO $$
               BEGIN
                    IF NOT EXISTS (
                         SELECT 1 FROM pg_constraint WHERE conname = 'trip_seat_holds_no_overlap'
                    ) THEN
                         ALTER TABLE trip_seat_holds
                         ADD CONSTRAINT trip_seat_holds_no_overlap
                         EXCLUDE USING gist (
                              "tripId" WITH =,
                              "seatNumber" WITH =,
                              int4range("fromSeq", "toSeq", '[)') WITH &&
                         );
                    END IF;
               END $$;
          `);
          logger.info('DB constraint trip_seat_holds_no_overlap is in place');
     } catch (err) {
          // Not fatal: the transactional overlap check still protects bookings.
          logger.error('Could not apply overlap constraints', { error: err.message });
     }
};

module.exports = { ensureDbConstraints };

/**
 * Create every known Kafka topic before a consumer subscribes.
 *
 * On a fresh broker, topics are auto-created lazily on first use. A consumer that
 * subscribes while that is still happening gets "This server does not host this
 * topic-partition" and crashes on startup. Creating topics up-front (idempotent —
 * existing topics are skipped) removes that race.
 *
 * Usage:
 *   const { ensureTopics } = require('../../../../shared/utils/ensureTopics');
 *   await ensureTopics(kafka, logger);
 */

const { KAFKA_TOPICS } = require('../constants/kafka-topics');

async function ensureTopics(kafka, logger) {
     const admin = kafka.admin();
     try {
          await admin.connect();
          const existing = new Set(await admin.listTopics());
          const missing = Object.values(KAFKA_TOPICS).filter((t) => !existing.has(t));

          if (missing.length > 0) {
               await admin.createTopics({
                    waitForLeaders: true,
                    topics: missing.map((topic) => ({ topic, numPartitions: 1, replicationFactor: 1 })),
               });
               logger.info(`Created ${missing.length} Kafka topic(s)`, { topics: missing });
          }
     } catch (err) {
          // Another service may be creating the same topics concurrently — not fatal.
          logger.warn('ensureTopics: could not create topics', { error: err.message });
     } finally {
          await admin.disconnect().catch(() => {});
     }
}

module.exports = { ensureTopics };

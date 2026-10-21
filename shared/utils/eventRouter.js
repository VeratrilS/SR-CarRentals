/**
 * Observer pattern for Kafka consumers.
 *
 * Producers publish events without knowing who listens; each service registers
 * one handler (observer) per topic it cares about. The handler map is the single
 * source of truth: we subscribe to exactly its keys, so the subscription list and
 * the dispatch logic can never drift apart (a topic subscribed but not handled,
 * or handled but never subscribed).
 *
 * Usage:
 *   const router = createEventRouter({ [TOPIC_A]: (event) => ..., [TOPIC_B]: ... }, logger);
 *   await consumer.subscribe({ topics: router.topics });
 *   await consumer.run({ eachMessage: withDLQ(producer, dlqTopic, logger, router.dispatch) });
 */
function createEventRouter(handlers, logger) {
     const topics = Object.keys(handlers);

     const dispatch = async ({ topic, partition, message, parsedValue }) => {
          const handler = handlers[topic];
          if (!handler) {
               logger.warn(`No handler registered for topic: ${topic}`);
               return;
          }
          logger.info(`Processing ${topic}`, { partition, offset: message.offset });
          await handler(parsedValue, { topic, partition, message });
     };

     return { topics, dispatch };
}

module.exports = { createEventRouter };

const { ensureTopics } = require('./ensureTopics');
const { withDLQ } = require('./dlqHandler');
const { createEventRouter } = require('./eventRouter');

/**
 * Template Method pattern for Kafka consumers.
 *
 * Every service consumes events the same way; only *what* it does with them differs.
 * start() is the template: a fixed sequence of steps that subclasses can't reorder
 * (topics must exist before subscribing, the DLQ producer must be connected before
 * the first message can fail). Subclasses fill in the hooks:
 *
 *   handlers()           required — { topic: async (event) => ... }  (the Observers)
 *   beforeConnect(opts)  optional — e.g. search-service seeks to offset 0 to rebuild its index
 */
class EventConsumer {
     constructor({ name, kafka, consumer, producer, connectProducer, logger, dlqTopic, fromBeginning = false }) {
          if (new.target === EventConsumer) {
               throw new Error('EventConsumer is abstract — extend it and implement handlers()');
          }
          Object.assign(this, { name, kafka, consumer, producer, connectProducer, logger, dlqTopic, fromBeginning });
     }

     /** Hook (required): topic → handler map */
     handlers() {
          throw new Error(`${this.constructor.name} must implement handlers()`);
     }

     /** Hook (optional): runs after topics exist, before the consumer connects */
     async beforeConnect() {}

     /** The template method */
     async start(options = {}) {
          const router = createEventRouter(this.handlers(), this.logger);

          await ensureTopics(this.kafka, this.logger);
          await this.beforeConnect(options);
          await this.consumer.connect();
          await this.connectProducer(); // needed for DLQ publishing
          this.logger.info(`${this.name} consumer connected`);

          await this.consumer.subscribe({ topics: router.topics, fromBeginning: this.fromBeginning });
          await this.consumer.run({
               eachMessage: withDLQ(this.producer, this.dlqTopic, this.logger, router.dispatch),
          });
          this.logger.info(`${this.name} consumer running (${router.topics.length} topics)`);
     }

     async stop() {
          await this.consumer.disconnect();
          this.logger.info(`${this.name} consumer disconnected`);
     }
}

module.exports = { EventConsumer };

const config = {
     SERVICE_NAME: require('../../package.json').name,
     PORT: Number(process.env.PORT) || 4002,
     NODE_ENV: process.env.NODE_ENV || "development",
     LOG_LEVEL: process.env.LOG_LEVEL || "info",
     ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL,
     KAFKA_BROKER: process.env.KAFKA_BROKER,
     KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID,
     ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,

     // Shared-ride search asks inventory for live seats-left per stretch
     INVENTORY_SERVICE_URL: process.env.INVENTORY_SERVICE_URL || 'http://localhost:4007',
     INTERNAL_SERVICE_KEY: process.env.INTERNAL_SERVICE_KEY,
     TIME_ZONE: process.env.TIME_ZONE || 'Asia/Kolkata',
}

module.exports = { config };
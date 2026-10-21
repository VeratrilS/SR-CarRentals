const { config } = require("../config");
const {redis} = require("../config/redis");
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const {roleFor} = require('../utils/auth');
const { NotFoundError } = require('../utils/error');

/**
 * Cache-Aside: reads try Redis first and fill it from Postgres on a miss;
 * every write goes to Postgres and then *invalidates* the cached copy, so
 * the next read reloads fresh data.
 */
const cacheKey = (userId) => `user:${userId}`;
const withoutPassword = ({password: _password, ...safeUser}) => safeUser;
const isNotFound = (err) => err?.code === 'P2025';

const getProfile = async(userId) =>{
     const storedUser = await redis.get(cacheKey(userId));
     if(storedUser){
          logger.debug(`Profile ${userId} served from cache`);
          const cached = JSON.parse(storedUser);
          return {...cached, role: roleFor(cached.email)};
     }

     const userProfile = await prisma.user.findUnique({
          where: {
               id: userId
          }
     })
     // Valid token but the account is gone (deleted)
     if(!userProfile) return null;

     const safeUser = withoutPassword(userProfile);
     await redis.set(cacheKey(userId), JSON.stringify(safeUser), 'EX', config.REDIS_USER_TTL);
     return {...safeUser, role: roleFor(safeUser.email)};
}

const updateProfile = async(userId, changes) =>{
     try {
          const user = await prisma.user.update({ where: { id: userId }, data: changes });
          await redis.del(cacheKey(userId));
          const safeUser = withoutPassword(user);
          return {...safeUser, role: roleFor(safeUser.email)};
     } catch (err) {
          if (isNotFound(err)) throw new NotFoundError("User not found");
          throw err;
     }
}

/** Delete the account and end every session it has on any device */
const deleteProfile = async(userId) =>{
     try {
          await prisma.user.delete({ where: { id: userId } }); // AuthProviders cascade
     } catch (err) {
          if (isNotFound(err)) throw new NotFoundError("User not found");
          throw err;
     }

     const sessionKeys = [];
     const stream = redis.scanStream({ match: `refresh:${userId}:*`, count: 100 });
     for await (const keys of stream) sessionKeys.push(...keys);
     await redis.del(cacheKey(userId), ...sessionKeys);
     logger.info(`User ${userId} deleted their account (${sessionKeys.length} session(s) revoked)`);
}

module.exports = {getProfile, updateProfile, deleteProfile}

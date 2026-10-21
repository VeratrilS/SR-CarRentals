const { ConflictError, BadRequestError, ForbiddenError, UnauthorizedError } = require("../utils/error")
const {generateAndStoreOtp, verifyOtp} = require('../utils/otp');
const {generateAccessToken, generateRefreshToken, verifyRefreshToken, roleFor, normalizeEmail} = require('../utils/auth');
const notificationProducer = require('../kafka/producer/notification.producer')
const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const {redis} = require('../config/redis');
const { config } = require("../config");
const logger = require('../config/logger');
const jwt = require('jsonwebtoken');
const {OAuth2Client} = require("google-auth-library");
const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

const isUniqueViolation = (err) => err?.code === 'P2002';
const refreshKey = (userId, deviceId) => `refresh:${userId}:${deviceId}`;

/**
 * Every login method (password, Google) ends the same way: issue an access +
 * refresh token pair, remember this device's refresh session (its jti) and
 * cache the profile. New login methods only have to find the user.
 */
const issueSession = async(user, deviceId) =>{
     const role = roleFor(user.email);
     const accessToken = generateAccessToken(user.id, role);
     const refreshToken = generateRefreshToken(user.id);
     const {jti} = jwt.decode(refreshToken);
     await redis.set(refreshKey(user.id, deviceId), jti, 'EX', config.REFRESH_TOKEN_EXP_SEC);
     const {password: _password, ...rest} = user;
     const safeUser = {...rest, role};
     await redis.set(`user:${user.id}`, JSON.stringify(safeUser), 'EX', config.REDIS_USER_TTL);
     return {accessToken, refreshToken, loggedInUser: safeUser};
}

const sendOTP = async(firstName, lastName, rawEmail, password) =>{
     const email = normalizeEmail(rawEmail);
     const existingUser = await prisma.user.findUnique({
          where: {email}
     })

     if(existingUser){
          throw new ConflictError("An account with this email already exists", "ACCOUNT_EXISTS");
     }
     const hashedPassword = await bcrypt.hash(password, 12);
     const meta = {firstName, lastName, email, hashedPassword};
     const {otp, otpSessionId} = await generateAndStoreOtp(meta);
     await notificationProducer.sendOtpEmail(email, otp, (config.OTP_TTL) / 60);
     logger.info(`OTP email queued for : ${email}`);

     // Local development only: email delivery can fail (e.g. sender domain DMARC),
     // so optionally echo the code to the service log. Never enabled in production.
     if (config.LOG_OTP_IN_DEV && config.NODE_ENV !== 'production') {
          logger.warn(`[DEV ONLY] OTP for ${email}: ${otp}`);
     }
     return {otpSessionId}
}

const verifyOTP = async(otp, otpSessionId) =>{
     const meta = await verifyOtp(otp, otpSessionId);
     if(meta === null){
          throw new BadRequestError("Invalid or expired OTP", "OTP_INVALID");
     }
     let user;
     try {
          user = await prisma.user.create({
               data: {
                    firstName: meta.firstName,
                    lastName: meta.lastName,
                    email: meta.email,
                    password: meta.hashedPassword,
                    emailVerified: true
               }
          })
     } catch (err) {
          // Same email registered through another OTP session / Google meanwhile
          if (isUniqueViolation(err)) {
               throw new ConflictError("An account with this email already exists", "ACCOUNT_EXISTS");
          }
          throw err;
     }

     await notificationProducer.sendWelcomeEmail(meta.email, meta.firstName);
     logger.info(`Welcome email queued for ${meta.email}`);
     const {password: _password, ...safeUser} = user;
     return safeUser;
}

const login = async(rawEmail, password, deviceId) =>{
     const existingUser = await prisma.user.findUnique({
          where: {email: normalizeEmail(rawEmail)}
     })
     if(!existingUser){
          throw new UnauthorizedError("Invalid email or password", "INVALID_CREDENTIALS");
     }
     if(!existingUser.password){
          throw new BadRequestError(
               "This account was created with Google. Please sign in with Google.",
               "OAUTH_ONLY_ACCOUNT"
          );
     }
     const doesPasswordMatch = await bcrypt.compare(password, existingUser.password);
     if(!doesPasswordMatch){
          throw new UnauthorizedError("Invalid email or password", "INVALID_CREDENTIALS");
     }
     return issueSession(existingUser, deviceId);
}

// Compare-and-swap in one atomic step: only the holder of the *current* jti may
// rotate it. Any other jti for this device is a replayed token → end the session.
const ROTATE_JTI = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
if current ~= ARGV[1] then
     redis.call('DEL', KEYS[1])
     return -1
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1`;

const rotateRefreshToken = async(refreshToken, deviceId) =>{
     const {id: userId, jti} = verifyRefreshToken(refreshToken);
     const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
     if(!user){
          await redis.del(refreshKey(userId, deviceId));
          throw new ForbiddenError("User no longer exists", "LOGIN_AGAIN")
     }

     const newAccessToken = generateAccessToken(userId, roleFor(user.email));
     const newRefreshToken = generateRefreshToken(userId);
     const {jti: newJti} = jwt.decode(newRefreshToken);

     const result = await redis.eval(ROTATE_JTI, 1, refreshKey(userId, deviceId), jti, newJti, config.REFRESH_TOKEN_EXP_SEC);
     if(result === 0){
          throw new ForbiddenError("Session Expired", "LOGIN_AGAIN")
     }
     if(result === -1){
          logger.warn(`Refresh token reuse detected for user ${userId} — session revoked`);
          throw new ForbiddenError("Refresh token reused", "LOGIN_AGAIN")
     }
     return {newAccessToken, newRefreshToken};
}

/**
 * Revoke this device's refresh session. Best-effort: an invalid/expired token
 * still results in a clean logout (cookies are cleared by the controller).
 */
const logout = async(refreshToken, deviceId) =>{
     if(!refreshToken) return;
     try {
          const {id: userId} = verifyRefreshToken(refreshToken);
          await redis.del(refreshKey(userId, deviceId));
          logger.info(`User ${userId} logged out`);
     } catch (err) {
          logger.info(`Logout with invalid or expired refresh token: ${err.message}`);
     }
}

const findOrCreateGoogleUser = (googleUser) => prisma.$transaction(async (tx) =>{
     const googleAuth = await tx.authProvider.findUnique({
          where: {
               provider_providerId: {
                    provider: googleUser.provider,
                    providerId: googleUser.providerId
               }
          },
          include: {user: true}
     })

     if(googleAuth){
          return googleAuth.user;
     }

     const existingUser = await tx.user.findUnique({
          where: {email: googleUser.email}
     })

     if(existingUser){
          // Linking Google to an existing account is only safe if Google has
          // verified that the caller really owns this address
          if(!googleUser.emailVerified){
               throw new ConflictError(
                    "An account with this email already exists. Log in with your password.",
                    "ACCOUNT_EXISTS"
               );
          }
          await tx.authProvider.create({
               data: {
                    provider: googleUser.provider,
                    providerId: googleUser.providerId,
                    userId: existingUser.id
               }
          })
          return existingUser;
     }

     return tx.user.create({
          data: {
               email: googleUser.email,
               firstName: googleUser.firstName,
               lastName: googleUser.lastName,
               emailVerified: googleUser.emailVerified,
               AuthProviders: {
                    create: {
                         provider: googleUser.provider,
                         providerId: googleUser.providerId
                    }
               }
          }
     })
})

const verifyGoogleIdToken = async(idToken, deviceId) =>{
     let payload;
     try {
          const ticket = await client.verifyIdToken({
               idToken,
               audience: config.GOOGLE_CLIENT_ID
          })
          payload = ticket.getPayload();
     } catch (err) {
          logger.warn(`Google ID token rejected: ${err.message}`);
          throw new UnauthorizedError("Google sign-in failed. Please try again.", "INVALID_GOOGLE_TOKEN");
     }

     if(!payload?.sub || !payload?.email){
          throw new UnauthorizedError("Invalid Google Token Payload")
     }

     const email = normalizeEmail(payload.email);
     const googleUser = {
          provider: "google",
          providerId: payload.sub,
          email,
          // Google accounts don't always have a given/family name
          firstName: payload.given_name || payload.name || email.split('@')[0],
          lastName: payload.family_name || '',
          emailVerified: payload.email_verified === true
     }

     let user;
     try {
          user = await findOrCreateGoogleUser(googleUser);
     } catch (err) {
          // Two first-time sign-ins raced to create the same user: the other one won, use it
          if (!isUniqueViolation(err)) throw err;
          user = await findOrCreateGoogleUser(googleUser);
     }

     return issueSession(user, deviceId);
}
module.exports = {sendOTP, verifyOTP, login, rotateRefreshToken, verifyGoogleIdToken, logout}

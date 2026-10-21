const { ConflictError, BadRequestError, ForbiddenError, UnauthorizedError } = require("../utils/error")
const {generateAndStoreOtp, verifyOtp} = require('../utils/otp');
const {generateAccessToken, generateRefreshToken, verifyRefreshToken, roleFor} = require('../utils/auth');
const notificationProducer = require('../kafka/producer/notification.producer')
const bcrypt = require('bcrypt');
const prisma = require('../config/prisma');
const {redis} = require('../config/redis');
const { config } = require("../config");
const logger = require('../config/logger');
const jwt = require('jsonwebtoken');
const {OAuth2Client} = require("google-auth-library");
const client = new OAuth2Client(config.GOOGLE_CLIENT_ID);

const sendOTP = async(firstName, lastName, email, password) =>{
     const existingUser = await prisma.user.findUnique({
          where: {email}
     })

     if(existingUser){
          throw new ConflictError("user already exists");
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
     const user = await prisma.user.create({
          data: {
               firstName: meta.firstName,
               lastName: meta.lastName,
               email: meta.email,
               password: meta.hashedPassword,
               emailVerified: true
          }
     })

     await notificationProducer.sendWelcomeEmail(meta.email, meta.firstName);
     logger.info(`Welcome email queued for ${meta.email}`);
     return user;
     
}

const login = async(email, password, deviceId) =>{
     const existingUser = await prisma.user.findUnique({
          where: {email}
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
     const role = roleFor(existingUser.email);
     const accessToken = generateAccessToken(existingUser.id, role);
     const refreshToken = generateRefreshToken(existingUser.id);
     const {jti} = jwt.decode(refreshToken);
     await redis.set(`refresh:${existingUser.id}:${deviceId}`, jti, 'EX', config.REFRESH_TOKEN_EXP_SEC);
     const {password: _password, ...rest} = existingUser;
     const safeUser = {...rest, role};
     await redis.set(`user:${existingUser.id}`, JSON.stringify(safeUser), 'EX', config.REDIS_USER_TTL);
     return {accessToken, refreshToken, loggedInUser: safeUser};
}


const rotateRefreshToken = async(refreshToken, deviceId) =>{
     const payload = verifyRefreshToken(refreshToken);
     const {id: userId, jti} = payload;
     const storedJti = await redis.get(`refresh:${userId}:${deviceId}`);
     if(!storedJti){
          throw new ForbiddenError("Session Expired", "Login AGAIN")
     }
     if(storedJti !== jti){
          await redis.del(`refresh:${userId}:${deviceId}`);
          throw new ForbiddenError("Refresh token reused", "LOGIN AGAIN")
     }
     const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { email: true } });
     if(!user){
          throw new ForbiddenError("User no longer exists", "LOGIN AGAIN")
     }
     const newAccessToken = generateAccessToken(payload.id, roleFor(user.email));
     const newRefreshToken = generateRefreshToken(payload.id);
     const {jti: newJti} = jwt.decode(newRefreshToken);
     await redis.set(`refresh:${payload.id}:${deviceId}`, newJti, 'EX', config.REFRESH_TOKEN_EXP_SEC);
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
          await redis.del(`refresh:${userId}:${deviceId}`);
          logger.info(`User ${userId} logged out`);
     } catch (err) {
          logger.info('Logout with invalid or expired refresh token', { error: err.message });
     }
}

const verifyGoogleIdToken = async(idToken, deviceId) =>{
     const ticket = await client.verifyIdToken({
          idToken,
          audience: config.GOOGLE_CLIENT_ID
     })
     const payload = ticket.getPayload();

     if(!payload.sub || !payload.email){
          throw new UnauthorizedError("Invalid Google Token Payload")
     }

     const googleUser = {
          provider: "google",
          providerId: payload.sub,
          email: payload.email,
          firstName: payload.given_name,
          lastName: payload.family_name,
          emailVerified: payload.email_verified || false
     }


     const user = await prisma.$transaction(async (tx) =>{
          let googleAuth = await tx.authProvider.findUnique({
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

          let existingUser = await tx.user.findUnique({
               where: {email: googleUser.email}
          })

          if(existingUser){
               await tx.authProvider.create({
                    data: {
                         provider: googleUser.provider,
                         providerId: googleUser.providerId,
                         userId: existingUser.id
                    }
               })
               return existingUser;
          }

          return await tx.user.create({
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

     const role = roleFor(user.email);
     const accessToken = generateAccessToken(user.id, role);
     const refreshToken = generateRefreshToken(user.id);
     const {jti} = jwt.decode(refreshToken);
     await redis.set(`refresh:${user.id}:${deviceId}`, jti, 'EX', config.REFRESH_TOKEN_EXP_SEC);
     const {password: _password, ...rest} = user;
     const safeUser = {...rest, role};
     await redis.set(`user:${user.id}`, JSON.stringify(safeUser), 'EX', config.REDIS_USER_TTL);
     return {accessToken, refreshToken, loggedInUser: safeUser};
     
}
module.exports = {sendOTP, verifyOTP, login, rotateRefreshToken, verifyGoogleIdToken, logout}
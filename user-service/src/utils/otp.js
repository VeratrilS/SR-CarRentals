const { TooManyRequestsError } = require("./error");
const {config} = require('../config');
const {redis} = require('../config/redis');
const otpGenerator = require('otp-generator');
const crypto = require('crypto');

const RATE_MAX = parseInt(config.OTP_RATE_MAX_PER_HOUR || '5', 10);
const ATTEMPT_MAX = parseInt(config.OTP_MAX_VERIFY_ATTEMPTS || '5', 10);
const OTP_TTL = parseInt(config.OTP_TTL || '300', 10);
const HMAC_SECRET = config.OTP_HMAC_SECRET

// Fixed-window counter in one atomic step: INCR, and start the window on the
// first hit only. (GET-then-INCR let parallel requests slip past the limit.)
const HIT_COUNTER = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return n`;

const hit = (key, windowSec) => redis.eval(HIT_COUNTER, 1, key, windowSec);

function hmacFor(email, otp){
     return crypto.createHmac('sha256', HMAC_SECRET).update(email + ":" + otp).digest('hex');
}
async function generateAndStoreOtp(meta){
     // how many otp's you can send in an hour
     const sentCount = await hit(`otp:rate:${meta.email}`, 3600);
     if(sentCount > RATE_MAX){
          throw new TooManyRequestsError(
               "Too many OTP requests. Try again later.",
               "OTP_RATE_LIMIT"
          )
     }

     const otp = otpGenerator.generate(6, {
          upperCaseAlphabets: false,
          lowerCaseAlphabets: false,
          specialChars: false
     })

     const otpSessionId = crypto.randomUUID();
     const hashed = hmacFor(meta.email, otp);
     await redis.set(`otp:session:${otpSessionId}`, JSON.stringify({
          hashedOtp: hashed,
          meta
     }), 'EX', OTP_TTL);
     return {otp, otpSessionId};
}

async function verifyOtp(otp, otpSessionId){
     const sessionKey = `otp:session:${otpSessionId}`;
     const rawData = await redis.get(sessionKey);
     if(!rawData) return null;

     const {hashedOtp: storedOtp, meta} = JSON.parse(rawData);
     const attemptsKey = `otp:attempts:${meta.email}`;
     // Count the attempt before checking it, so parallel guesses can't exceed the limit
     const attemptsCount = await hit(attemptsKey, OTP_TTL);
     if(attemptsCount > ATTEMPT_MAX){
          throw new TooManyRequestsError("Too many attempts to verify OTP", "OTP_ATTEMPTS_EXCEEDED");
     }
     const hashedOtp = hmacFor(meta.email, String(otp));
     if(!crypto.timingSafeEqual(Buffer.from(hashedOtp, 'hex'), Buffer.from(storedOtp, 'hex'))){
          return null;
     }

     // An OTP is single-use: of two concurrent correct submissions only the one
     // that actually deletes the session wins
     const consumed = await redis.del(sessionKey);
     if(!consumed) return null;
     await redis.del(attemptsKey, `otp:rate:${meta.email}`);
     return meta;
}

module.exports = {generateAndStoreOtp, verifyOtp};

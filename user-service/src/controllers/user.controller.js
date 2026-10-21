const asyncHandler = require("../utils/asyncHandler");
const { BadRequestError, NotFoundError } = require("../utils/error");
const userService = require('../services/user.service');

const isProd = process.env.NODE_ENV === 'production';
const EDITABLE_FIELDS = ['firstName', 'lastName'];

exports.getProfile = asyncHandler(async(req, res) =>{
     const userId = req.user.id;
     if(!userId){
          throw new BadRequestError("User Id is missing");
     }

     const user = await userService.getProfile(userId);
     if(!user){
          throw new NotFoundError("User not found");
     }
     return res.status(200).json({
          success: true,
          message: "Fetched user details",
          data: {
               user
          }
     })
})

exports.updateProfile = asyncHandler(async(req, res) =>{
     // Only names are editable here; email/password/role are never taken from the body
     const changes = {};
     for (const field of EDITABLE_FIELDS) {
          if (req.body?.[field] === undefined) continue;
          const value = typeof req.body[field] === 'string' ? req.body[field].trim() : '';
          if (!value || value.length > 50) {
               throw new BadRequestError(`${field} must be 1-50 characters`);
          }
          changes[field] = value;
     }
     if (Object.keys(changes).length === 0) {
          throw new BadRequestError(`Nothing to update. Editable fields: ${EDITABLE_FIELDS.join(', ')}`);
     }

     const user = await userService.updateProfile(req.user.id, changes);
     return res.status(200).json({
          success: true,
          message: "Profile updated",
          data: {
               user
          }
     })
})

exports.deleteProfile = asyncHandler(async(req, res) =>{
     await userService.deleteProfile(req.user.id);
     const clear = { httpOnly: true, secure: isProd, sameSite: isProd ? 'strict' : 'lax' };
     res.clearCookie("accessToken", clear);
     res.clearCookie("refreshToken", clear);
     return res.status(200).json({
          success: true,
          message: "Account deleted"
     })
})

exports.getUserInternal = asyncHandler(async(req, res) =>{
     const { userId } = req.params;
     if(!userId){
          throw new BadRequestError("User Id is missing");
     }

     const user = await userService.getProfile(userId);
     if(!user){
          throw new NotFoundError("User not found");
     }

     return res.status(200).json({
          success: true,
          data: {
               id: user.id,
               firstName: user.firstName,
               lastName: user.lastName,
               email: user.email,
          }
     });
})

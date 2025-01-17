import { Router } from 'express';
import {
	loginUser,
	logoutUser,
	registerUser,
	refreshAccessToken,
	updateUserCoverImage,
	updateUserAvatar,
	changeCurrentPassword,
	getCurrentUser,
	updateAccountDetails,
	getWatchHistory,
	getUserChannelProfile,
} from '../controllers/user.controller.js';

import { upload } from '../middlewares/multer.middleware.js';
import { verifyJWT } from '../middlewares/auth.middleware.js';

const router = Router();

router.route('/register').post(
	upload.fields([
		{
			name: 'avatar',
			maxCount: 1,
		},
		{
			name: 'coverImage',
			maxCount: 1,
		},
	]),
	registerUser
);

router.route('/login').post(loginUser);

// protected routes

router.route('/logout').post(verifyJWT, logoutUser);
router.route('/refresh-token').post(refreshAccessToken);
router.route('/change-password').post(verifyJWT, changeCurrentPassword);
router.route('/current-user').get(verifyJWT, getCurrentUser);
router.route('/update-account').patch(verifyJWT, updateAccountDetails);
router.route('/watch-history').get(verifyJWT, getWatchHistory);
router.route('/channel/:username').get(verifyJWT, getUserChannelProfile);

router
	.route('/cover-image')
	.patch(verifyJWT, upload.single('coverImage'), updateUserCoverImage);

router
	.route('/avatar')
	.patch(verifyJWT, upload.single('avatar'), updateUserAvatar);

export default router;

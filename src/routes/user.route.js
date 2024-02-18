import { Router } from 'express';
import {
	loginUser,
	logoutUser,
	registerUser,
	refreshAccessToken,
	updateUserCoverImage,
	updateUserAvatar,
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
router
	.route('/cover-image')
	.patch(verifyJWT, upload.single('coverImage'), updateUserCoverImage);

router
	.route('/avatar')
	.patch(verifyJWT, upload.single('avatar'), updateUserAvatar);

export default router;

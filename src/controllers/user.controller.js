import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';

import { User } from '../models/user.model.js';

import {
	uploadOnCloudinary,
	deleteFromCloudinary,
} from '../utils/cloudinary.js';

import jwt from 'jsonwebtoken';

import path from 'path';

const generateAccessAndRefreshTokens = async (userId) => {
	try {
		const userInstance = await User.findById(userId);
		const accessToken = userInstance.generateAccessToken();
		const refreshToken = userInstance.generateRefreshToken();

		userInstance.refreshToken = refreshToken;

		await userInstance.save({ validateBeforeSave: false });

		return { accessToken, refreshToken };
	} catch (error) {
		throw new ApiError(
			500,
			'Something went wrong while generating refresh and access tokens.'
		);
	}
};

const registerUser = asyncHandler(async (req, res) => {
	const { fullName, email, username, password } = req.body;

	if (
		[fullName, email, username, password].some(
			(field) => field?.trim() === ''
		)
	) {
		throw new ApiError(400, 'All fields are required');
	}

	const existedUser = await User.findOne({
		$or: [{ username }, { email }],
	});

	if (existedUser) {
		throw new ApiError(
			409,
			'User with this username or email already exists.'
		);
	}

	const avatarLocalPath = req.files?.avatar?.[0]?.path;
	const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

	if (!avatarLocalPath) {
		throw new ApiError(400, 'Avatar file is required');
	}

	const avatar = await uploadOnCloudinary(avatarLocalPath);
	const coverImage = await uploadOnCloudinary(coverImageLocalPath);

	if (!avatar) {
		throw new ApiError(
			500,
			'Something went wrong while file upload, try again.'
		);
	}

	const user = await User.create({
		fullName,
		avatar: avatar.url,
		coverImage: coverImage?.url || '',
		email,
		password,
		username: username.toLowerCase(),
	});

	const createdUser = await User.findById(user._id).select(
		'-password -refreshToken'
	);

	if (!createdUser) {
		throw new ApiError(
			500,
			'Something went wrong while doing user registration.'
		);
	}

	return res
		.status(201)
		.json(
			new ApiResponse(201, createdUser, 'User registration successful')
		);
});

const loginUser = asyncHandler(async (req, res) => {
	const { email, username, password } = req.body;

	if (!username && !email) {
		throw new ApiError(400, 'username or email is required.');
	}

	const userInstance = await User.findOne({
		$or: [{ username }, { email }],
	});

	if (!userInstance) {
		throw new ApiError(404, 'User does not exist.');
	}

	const isPasswordValid = await userInstance.isPasswordCorrect(password);

	if (!isPasswordValid) {
		throw new ApiError(401, 'Invalid user credentials');
	}

	const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
		userInstance._id
	);

	const loggedInUser = await User.findById(userInstance._id).select(
		'-password -refreshToken'
	);

	const options = {
		httpOnly: true,
		secure: true,
	};

	return res
		.status(200)
		.cookie('accessToken', accessToken, options)
		.cookie('refreshToken', refreshToken, options)
		.json(
			new ApiResponse(
				200,
				{
					user: loggedInUser,
					accessToken,
					refreshToken,
				},
				'User logged in successfully.'
			)
		);
});

const logoutUser = asyncHandler(async (req, res) => {
	await User.findByIdAndUpdate(
		req.user._id,
		{
			$set: {
				refreshToken: undefined,
			},
		},
		{
			new: true,
		}
	);

	const options = {
		httpOnly: true,
		secure: true,
	};

	return res
		.status(200)
		.clearCookie('accessToken', options)
		.clearCookie('refreshToken', options)
		.json(new ApiResponse(200, {}, 'User logged out.'));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
	const incomingRefreshToken =
		req.cookies.refreshToken || req.body.refreshToken;

	if (!incomingRefreshToken) {
		throw new ApiError(401, 'Unauthorized request.');
	}

	try {
		const decodedToken = jwt.verify(
			incomingRefreshToken,
			process.env.REFRESH_TOKEN_SECRET
		);

		const userInstance = await User.findById(decodedToken?._id);

		if (!userInstance) {
			throw new ApiError(401, 'Invalid refresh token');
		}

		if (incomingRefreshToken !== userInstance?.refreshToken) {
			throw new ApiError(401, 'Refresh token is expired or used');
		}

		const options = {
			httpOnly: true,
			secure: true,
		};

		const { accessToken, refreshToken } =
			await generateAccessAndRefreshTokens(userInstance._id);

		return res
			.status(200)
			.cookie('accessToken', accessToken, options)
			.cookie('refreshToken', refreshToken, options)
			.json(
				new ApiResponse(
					200,
					{
						accessToken,
						refreshToken,
					},
					'Access token refreshed'
				)
			);
	} catch (error) {
		throw new ApiError(401, error?.message || 'Invalid refresh token');
	}
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
	const { oldPassword, newPassword } = req.body;

	const userInstance = await User.findById(req.user?._id);

	const isPasswordCorrect = await userInstance.isPasswordCorrect(oldPassword);

	if (!isPasswordCorrect) {
		throw new ApiError(400, 'Incorrect Password');
	}

	userInstance.password = newPassword;
	await userInstance.save({ validateBeforeSave: false });

	return res
		.status(200)
		.json(new ApiResponse(200, {}, 'Password updated successfully.'));
});

const getCurrentUser = asyncHandler(async (req, res) => {
	return res
		.status(200)
		.json(
			new ApiResponse(200, req.user, 'Current user fetched successfully')
		);
});

const updateAccountDetails = asyncHandler(async (req, res) => {
	const { fullName, email } = req.body;

	if (!fullName || !email) {
		throw new ApiError(400, 'All fields are required');
	}

	const userInstance = await User.findByIdAndUpdate(
		req.user?._id,
		{
			$set: {
				fullName,
				email,
			},
		},
		{
			new: true,
		}
	).select('-password');

	return res
		.status(200)
		.json(
			new ApiResponse(
				200,
				userInstance,
				'Account details updated successfully'
			)
		);
});

const updateUserAvatar = asyncHandler(async (req, res) => {
	const avatarLocalPath = req.file?.path;

	if (!avatarLocalPath) {
		throw new ApiError(400, 'Avatar file is missing');
	}

	const avatar = await uploadOnCloudinary(avatarLocalPath);

	if (!avatar.url) {
		throw new ApiError(
			500,
			'Something went wrong while uploading the avatar, try again.'
		);
	}

	const currentUser = await User.findById(req.user?._id).select('avatar');
	const fileName = path.parse(currentUser.avatar).name;

	const response = await deleteFromCloudinary(fileName, 'image');

	const userInstance = await User.findByIdAndUpdate(
		req.user?._id,
		{
			$set: {
				avatar: avatar.url,
			},
		},
		{ new: true }
	).select('-password');

	if (response.result !== 'ok') {
		throw new ApiError(
			500,
			'Something went wrong while deleting previous avatar Image.',
			response
		);
	}

	return res
		.status(200)
		.json(
			new ApiResponse(
				200,
				userInstance,
				'Avatar image updated successfully'
			)
		);
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
	const coverImageLocalPath = req.file?.path;

	if (!coverImageLocalPath) {
		throw new ApiError(400, 'Cover image file is missing');
	}

	const coverImage = await uploadOnCloudinary(coverImageLocalPath);

	if (!coverImage.url) {
		throw new ApiError(
			500,
			'Something went wrong while uploading the Cover image, try again.'
		);
	}

	const currentUser = await User.findById(req.user?._id).select('coverImage');
	const fileName = path.parse(currentUser.coverImage).name;

	const response = await deleteFromCloudinary(fileName, 'image');

	const userInstance = await User.findByIdAndUpdate(
		req.user?._id,
		{
			$set: {
				coverImage: coverImage.url,
			},
		},
		{ new: true }
	).select('-password');

	if (response.result !== 'ok') {
		throw new ApiError(
			500,
			'Something went wrong while deleting previous Cover Image.',
			response
		);
	}

	return res
		.status(200)
		.json(
			new ApiResponse(
				200,
				userInstance,
				'Cover image updated successfully'
			)
		);
});

export {
	registerUser,
	loginUser,
	logoutUser,
	refreshAccessToken,
	changeCurrentPassword,
	getCurrentUser,
	updateAccountDetails,
	updateUserAvatar,
	updateUserCoverImage,
};

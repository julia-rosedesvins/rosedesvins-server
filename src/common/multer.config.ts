import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BadRequestException } from '@nestjs/common';

// Allowed file types for images
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Multer configuration for domain profile images
export const domainProfileImageStorage = diskStorage({
  destination: './uploads/domain-profiles',
  filename: (req, file, callback) => {
    // Generate unique filename with UUID
    const uniqueSuffix = uuidv4();
    const fileExt = extname(file.originalname);
    const fileName = `${uniqueSuffix}${fileExt}`;
    callback(null, fileName);
  },
});

// File filter for images
export const imageFileFilter = (req: any, file: Express.Multer.File, callback: any) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(
      new BadRequestException(
        'Invalid file type. Only JPEG, JPG, PNG, GIF, and WebP files are allowed.'
      ),
      false,
    );
  }
};

// Multer options
export const domainProfileImageOptions = {
  storage: domainProfileImageStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
};

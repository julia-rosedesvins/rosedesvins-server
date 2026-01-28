# Media Sync Module

This module handles media file uploads to AWS S3.

## Features

- ✅ Upload files to S3 with custom folder paths
- ✅ Generate unique file names automatically
- ✅ Reusable S3 service for use across the application
- ✅ Full TypeScript support with DTOs
- ✅ Swagger/OpenAPI documentation

## API Endpoints

### POST /media-sync/upload

Upload a file to S3.

**Request:**
- Content-Type: `multipart/form-data`
- Body:
  - `file` (required): The file to upload
  - `folder` (optional): S3 folder path (e.g., `images/profiles`)
  - `fileName` (optional): Custom file name without extension

**Response:**
```json
{
  "url": "https://rosedesvins.s3.us-east-1.amazonaws.com/images/profiles/abc123.jpg",
  "key": "images/profiles/abc123.jpg",
  "message": "File uploaded successfully"
}
```

**Example using cURL:**
```bash
curl -X POST http://localhost:3000/media-sync/upload \
  -F "file=@/path/to/image.jpg" \
  -F "folder=images/profiles" \
  -F "fileName=profile-pic"
```

**Example using Postman:**
1. Set method to POST
2. URL: `http://localhost:3000/media-sync/upload`
3. Go to Body tab
4. Select `form-data`
5. Add key `file` with type `File` and select your file
6. Add key `folder` with value like `images/profiles` (optional)
7. Add key `fileName` with your custom name (optional)

## S3Service (Reusable)

The `S3Service` is exported from the `MediaSyncModule` and can be used anywhere in your application.

### Available Methods

#### uploadFile(file, fileName?, folder?)
Upload a file to S3.

**Parameters:**
- `file`: Buffer or Express.Multer.File
- `fileName`: Optional custom file name
- `folder`: Optional S3 folder path

**Returns:** `{ url: string, key: string }`

#### deleteFile(key)
Delete a file from S3.

**Parameters:**
- `key`: S3 object key

#### fileExists(key)
Check if a file exists in S3.

**Parameters:**
- `key`: S3 object key

**Returns:** `boolean`

#### getFile(key)
Retrieve a file from S3.

**Parameters:**
- `key`: S3 object key

**Returns:** `Buffer`

### Usage Example

```typescript
import { S3Service } from '../common/services/s3.service';

@Injectable()
export class YourService {
  constructor(private readonly s3Service: S3Service) {}

  async uploadUserAvatar(file: Express.Multer.File, userId: string) {
    const { url, key } = await this.s3Service.uploadFile(
      file,
      `avatar-${userId}`,
      'avatars'
    );
    return { url, key };
  }

  async deleteUserAvatar(key: string) {
    await this.s3Service.deleteFile(key);
  }
}
```

To use S3Service in another module, import `MediaSyncModule`:

```typescript
@Module({
  imports: [MediaSyncModule],
  // ...
})
export class YourModule {}
```

## Environment Variables

Required environment variables in `.env`:

```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your_bucket_name
```

## Dependencies

- `@aws-sdk/client-s3` - AWS SDK for S3 operations
- `uuid` - For generating unique file names

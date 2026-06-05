import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
    const region = this.configService.get<string>('AWS_REGION');
    const bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME');

    if (!accessKeyId || !secretAccessKey || !region || !bucketName) {
      throw new Error('AWS S3 configuration is missing. Please check your environment variables.');
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
    this.bucketName = bucketName;
  }

  /**
   * Upload a buffer directly to a specific S3 key (overwrites if exists)
   */
  async uploadFileByKey(key: string, buffer: Buffer, contentType: string): Promise<{ url: string; key: string }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await this.s3Client.send(command);

      const url = `https://${this.bucketName}.s3.${this.configService.get<string>('AWS_REGION')}.amazonaws.com/${key}`;
      this.logger.log(`File uploaded by key: ${key}`);
      return { url, key };
    } catch (error) {
      this.logger.error(`Failed to upload file to S3: ${error.message}`, error.stack);
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  /**
   * Upload a file to S3
   * @param file - The file buffer or stream
   * @param fileName - Optional custom file name, generates UUID if not provided
   * @param folder - Optional folder path in S3
   * @returns The S3 URL of the uploaded file
   */
  async uploadFile(
    file: Buffer | Express.Multer.File,
    fileName?: string,
    folder?: string,
  ): Promise<{ url: string; key: string }> {
    try {
      const buffer = Buffer.isBuffer(file) ? file : file.buffer;
      const originalName = Buffer.isBuffer(file) ? fileName : file.originalname;
      const mimeType = Buffer.isBuffer(file) ? 'application/octet-stream' : file.mimetype;

      // Generate unique file name
      const fileExtension = originalName ? originalName.split('.').pop() : '';
      const uniqueFileName = fileName || `${uuidv4()}.${fileExtension}`;
      const key = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      });

      await this.s3Client.send(command);

      const url = `https://${this.bucketName}.s3.${this.configService.get<string>('AWS_REGION')}.amazonaws.com/${key}`;
      
      this.logger.log(`File uploaded successfully: ${key}`);
      return { url, key };
    } catch (error) {
      this.logger.error(`Failed to upload file to S3: ${error.message}`, error.stack);
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  /**
   * Delete a file from S3
   * @param key - The S3 object key
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${error.message}`, error.stack);
      throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
  }

  /**
   * Check if a file exists in S3
   * @param key - The S3 object key
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get a file from S3
   * @param key - The S3 object key
   */
  async getFile(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const stream = response.Body as any;
      
      return new Promise((resolve, reject) => {
        const chunks: any[] = [];
        stream.on('data', (chunk: any) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
      });
    } catch (error) {
      this.logger.error(`Failed to get file from S3: ${error.message}`, error.stack);
      throw new Error(`Failed to get file from S3: ${error.message}`);
    }
  }
}

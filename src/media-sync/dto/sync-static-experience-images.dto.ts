import { z } from 'zod';

export const syncStaticExperienceImagesSchema = z.object({
  imagesDirectory: z.string().optional().default('/home/bikter/upwork/rosedesvins/docs/transformed_images-20260129T055134Z-3-001/transformed_images'),
});

export type SyncStaticExperienceImagesDto = z.infer<typeof syncStaticExperienceImagesSchema>;

export interface SyncStaticExperienceImagesResponseDto {
  success: boolean;
  totalProcessed: number;
  successfulUploads: number;
  failedUploads: number;
  errors: Array<{
    id: string;
    error: string;
  }>;
}

import { z } from 'zod';

export const uploadMediaSchema = z.object({
  folder: z.string().optional(),
  fileName: z.string().optional(),
});

export type UploadMediaDto = z.infer<typeof uploadMediaSchema>;

export class CreateStaticExperienceDto {
  name: string;
  domain_name?: string;
  domain_description?: string;
  domain_profile_pic_url?: string;
  domain_logo_url?: string;
  category?: string;
  category_ref?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  reviews?: number;
  website?: string;
  phone?: string;
  opening_hours?: Record<string, string[]>;
  about?: string;
  url?: string;
}

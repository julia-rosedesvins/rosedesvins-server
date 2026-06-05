export class UpdateRegionDto {
  denom?: string;
  min_lat?: number;
  min_lon?: number;
  max_lat?: number;
  max_lon?: number;
  thumbnailUrl?: string;
  isParent?: boolean;
  parent?: string;
}

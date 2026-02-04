export class CreateRegionDto {
  denom: string;
  min_lat: number;
  min_lon: number;
  max_lat: number;
  max_lon: number;
  isParent?: boolean;
  parent?: string;
}

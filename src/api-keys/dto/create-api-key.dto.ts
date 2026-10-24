import { IsInt, IsString, MaxLength, Min, ValidateIf } from 'class-validator';

export class CreateApiKeyDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(1)
  rateLimit?: number;
}

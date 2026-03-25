import { IsString, IsBoolean, IsOptional, IsEnum, IsInt, Min, Max, IsObject } from 'class-validator';
import { ConfigScope } from '../interfaces/config.interfaces';

export class SetConfigDto {
  @IsString()
  key: string;

  @IsString()
  value: string;

  @IsEnum(ConfigScope)
  @IsOptional()
  scope?: ConfigScope;

  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsBoolean()
  @IsOptional()
  encrypted?: boolean;
}

export class SetFeatureFlagDto {
  @IsString()
  key: string;

  @IsBoolean()
  enabled: boolean;

  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  rolloutPct?: number;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class GetConfigDto {
  @IsString()
  key: string;

  @IsString()
  @IsOptional()
  tenantId?: string;

  @IsString()
  @IsOptional()
  userId?: string;
}

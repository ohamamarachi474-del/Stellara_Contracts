import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ConfigManagerService } from './services/config-manager.service';
import { FeatureFlagService } from './services/feature-flag.service';
import { ConfigAuditService } from './services/config-audit.service';
import { SetConfigDto, SetFeatureFlagDto } from './dto/config.dto';
import { ConfigScope } from './interfaces/config.interfaces';

@Controller('config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConfigManagerController {
  constructor(
    private readonly configManager: ConfigManagerService,
    private readonly featureFlags: FeatureFlagService,
    private readonly audit: ConfigAuditService,
  ) {}

  // ─── Config entries ───────────────────────────────────────────────────────

  @Get('resolve')
  async resolve(
    @Query('key') key: string,
    @Query('tenantId') tenantId?: string,
    @Query('userId') userId?: string,
  ) {
    const value = await this.configManager.get(key, tenantId, userId);
    return { key, value: value ?? null };
  }

  @Post()
  @Roles('ADMIN' as any)
  async set(@Body() dto: SetConfigDto, @Request() req: any) {
    await this.configManager.set(dto, req.user?.id);
    return { success: true };
  }

  @Delete(':key')
  @Roles('ADMIN' as any)
  async delete(
    @Param('key') key: string,
    @Query('scope') scope: ConfigScope = ConfigScope.GLOBAL,
    @Query('tenantId') tenantId?: string,
    @Query('userId') userId?: string,
    @Request() req?: any,
  ) {
    await this.configManager.delete(key, scope, tenantId, userId, req?.user?.id);
    return { success: true };
  }

  @Get('tenant/:tenantId')
  @Roles('ADMIN' as any)
  async listForTenant(@Param('tenantId') tenantId: string) {
    return this.configManager.listForTenant(tenantId);
  }

  // ─── Feature flags ────────────────────────────────────────────────────────

  @Get('flags')
  async listFlags(@Query('tenantId') tenantId?: string) {
    return this.featureFlags.listFlags(tenantId);
  }

  @Get('flags/:key')
  async checkFlag(
    @Param('key') key: string,
    @Query('tenantId') tenantId?: string,
    @Query('userId') userId?: string,
  ) {
    const enabled = await this.featureFlags.isEnabled(key, tenantId, userId);
    return { key, enabled };
  }

  @Post('flags')
  @Roles('ADMIN' as any)
  async setFlag(@Body() dto: SetFeatureFlagDto, @Request() req: any) {
    const flag = await this.featureFlags.setFlag(dto, req.user?.id);
    return flag;
  }

  @Delete('flags/:key')
  @Roles('ADMIN' as any)
  async deleteFlag(
    @Param('key') key: string,
    @Query('tenantId') tenantId?: string,
    @Request() req?: any,
  ) {
    await this.featureFlags.deleteFlag(key, tenantId, req?.user?.id);
    return { success: true };
  }

  // ─── Audit trail ──────────────────────────────────────────────────────────

  @Get('audit/:key')
  @Roles('ADMIN' as any)
  async getAuditTrail(
    @Param('key') key: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.audit.getAuditTrail(key, tenantId);
  }
}

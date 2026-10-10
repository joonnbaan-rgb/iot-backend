import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { SitesService } from './sites.service';
import { SITE_PRESETS } from './presets';
import { AddMemberDto, CreateSiteDto, UpdateMemberDto, UpdateSiteDto } from './dto/site.dto';

@SkipThrottle()
@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get('presets')
  presets() {
    return SITE_PRESETS;
  }

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.sites.list(user);
  }

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateSiteDto) {
    return this.sites.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSiteDto) {
    return this.sites.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.sites.remove(user, id);
  }

  @Get(':id/members')
  members(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.sites.listMembers(user, id);
  }

  @Post(':id/members')
  addMember(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMemberDto) {
    return this.sites.addMember(user, id, dto);
  }

  @Patch(':id/members/:userId')
  updateMember(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.sites.updateMember(user, id, userId, dto);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  async removeMember(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.sites.removeMember(user, id, userId);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { GroupsService } from './groups.service';
import { SharesService } from './shares.service';
import { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';
import { CreateShareDto, UpdateShareDto } from './dto/share.dto';

@SkipThrottle()
@Controller()
export class SharingController {
  constructor(
    private readonly groups: GroupsService,
    private readonly shares: SharesService,
  ) {}

  // ----- กลุ่มอุปกรณ์ -----
  @Get('groups')
  listGroups(@CurrentUser() user: CurrentUserPayload) {
    return this.groups.list(user);
  }

  @Post('groups')
  createGroup(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateGroupDto) {
    return this.groups.create(user, dto);
  }

  @Patch('groups/:id')
  updateGroup(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groups.update(user, id, dto);
  }

  @Delete('groups/:id')
  @HttpCode(204)
  async deleteGroup(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.groups.remove(user, id);
  }

  // ----- การแชร์ -----
  @Get('shares/outgoing')
  outgoing(@CurrentUser() user: CurrentUserPayload) {
    return this.shares.listOutgoing(user);
  }

  @Get('shares/incoming')
  incoming(@CurrentUser() user: CurrentUserPayload) {
    return this.shares.listIncoming(user);
  }

  @Post('shares')
  createShare(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateShareDto) {
    return this.shares.create(user, dto);
  }

  @Patch('shares/:id')
  updateShare(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShareDto,
  ) {
    return this.shares.updatePermission(user, id, dto.permission);
  }

  @Delete('shares/:id')
  @HttpCode(204)
  async revokeShare(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    await this.shares.revoke(user, id);
  }
}

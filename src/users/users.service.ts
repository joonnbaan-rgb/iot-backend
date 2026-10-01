import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<Omit<User, 'password_hash'>[]> {
    const users = await this.userRepository.find({ order: { created_at: 'DESC' } });
    return users.map(({ password_hash, ...safe }) => safe);
  }

  async updateRole(userId: string, role: UserRole): Promise<Omit<User, 'password_hash'>> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`ไม่พบผู้ใช้ id: ${userId}`);
    }
    user.role = role;
    await this.userRepository.save(user);
    const { password_hash, ...safe } = user;
    return safe;
  }
}

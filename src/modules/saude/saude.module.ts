import { Module } from '@nestjs/common';
import { SaudeController } from './controllers/saude.controller';

@Module({ controllers: [SaudeController] })
export class SaudeModule {}

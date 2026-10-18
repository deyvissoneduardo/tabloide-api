import { Injectable } from '@nestjs/common';

@Injectable()
export class ClockService {
  agora(): Date {
    return new Date();
  }
}

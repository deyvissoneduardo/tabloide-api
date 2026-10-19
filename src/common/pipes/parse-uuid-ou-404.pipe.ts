import { Injectable, ParseUUIDPipe } from '@nestjs/common';
import { naoEncontrado } from '../errors/errors';

@Injectable()
export class ParseUuidOu404Pipe extends ParseUUIDPipe {
  constructor() {
    super({ version: '7', exceptionFactory: () => naoEncontrado() });
  }
}

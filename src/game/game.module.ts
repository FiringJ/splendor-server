import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { GameGateway } from './game.gateway';
import { AIService } from './ai.service';

@Module({
  providers: [GameService, GameGateway, AIService],
  controllers: [GameController],
})
export class GameModule { } 
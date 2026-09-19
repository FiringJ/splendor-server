import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { GameGateway } from './game.gateway';
import { AIService } from './ai.service';
import { OpenRouterClient } from './jev/openrouter-client';
import { JevAIService } from './jev/jev-ai.service';

@Module({
  providers: [GameService, GameGateway, AIService, OpenRouterClient, JevAIService],
  controllers: [GameController],
})
export class GameModule { } 
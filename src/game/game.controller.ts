import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { GameService } from './game.service';

@Controller('game')
export class GameController {
  constructor(private readonly gameService: GameService) { }

  @Post('create-room')
  createRoom(@Body() body: { playerId: string }) {
    const roomId = this.gameService.createRoom(body.playerId);
    return { success: true, roomId };
  }

  @Post('join-room')
  joinRoom(@Body() body: { roomId: string; playerId: string }) {
    const room = this.gameService.joinRoom(body.roomId, body.playerId);
    return { success: true, room };
  }
} 
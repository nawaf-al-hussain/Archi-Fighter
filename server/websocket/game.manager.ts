import { GameRoom } from "./game.room.ts";

class GameManager {
  private rooms = new Map<number, GameRoom>();

  create(gameId: number, mapId: number, creatorId: number): GameRoom {
    const room = new GameRoom(gameId, mapId, creatorId, () => this.delete(gameId));
    this.rooms.set(gameId, room);
    return room;
  }

  get(gameId: number): GameRoom | undefined {
    return this.rooms.get(gameId);
  }

  delete(gameId: number): void {
    this.rooms.delete(gameId);
  }

  get activeCount(): number {
    return this.rooms.size;
  }
}

export const gameManager = new GameManager();

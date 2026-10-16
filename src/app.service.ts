import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Olá, Plexus! Bem-vindo à API de estudo de gRCP Fullstack e novo projeto de estudo de NestJS com TypeScript, PostgreSQL, Redis, Docker, Swagger e JWT.';
  }
}

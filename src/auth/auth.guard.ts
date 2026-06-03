import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket = require('ws');
import { AuthenticatedRequest } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly supabase: SupabaseClient;

  constructor(configService: ConfigService) {
    const supabaseUrl = configService.getOrThrow<string>('SUPABASE_URL');
    const supabaseKey =
      configService.get<string>('SUPABASE_PUBLISHABLE_KEY') || configService.getOrThrow<string>('SUPABASE_ANON_KEY');

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket as any },
    });
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.getBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const { data, error } = await this.supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid bearer token');
    }

    request.user = {
      id: data.user.id,
      email: data.user.email,
    };

    return true;
  }

  private getBearerToken(authorization: string | undefined) {
    if (!authorization?.startsWith('Bearer ')) {
      return null;
    }

    return authorization.slice('Bearer '.length).trim();
  }
}

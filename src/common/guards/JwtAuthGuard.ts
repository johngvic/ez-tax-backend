import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { decode } from 'jsonwebtoken';
import { JwtService } from '@nestjs/jwt';
import * as jwksRsa from 'jwks-rsa';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwtService: JwtService;
  private jwksClient: jwksRsa.JwksClient;

  constructor() {
    this.jwksClient = jwksRsa({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: process.env.AUTH_JWKS_URL || '',
    });

    this.jwtService = new JwtService({
      secretOrKeyProvider: async (_requestType, _tokenOrPayload, _options) => {
        const decoded = decode(_tokenOrPayload as string, { complete: true });
        if (!decoded || !decoded.header) {
          throw new Error('Invalid token: unable to decode');
        }
        const key = await this.jwksClient.getSigningKey(decoded.header.kid);
        return key.getPublicKey();
      },
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] || '';
    const [_, token] = authHeader.split(' ');

    if (!token) {
      return false;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        issuer: process.env.AUTH_ISSUER || '',
      });

      request.user = {
        ...payload,
        sub: payload.sub.split('_')[1],
      };

      return true;
    } catch (error) {
      console.error('JWT Validation Error:', error);
      return false;
    }
  }
}

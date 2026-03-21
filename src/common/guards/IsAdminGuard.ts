import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';

@Injectable()
export class IsAdminGuard implements CanActivate {
  private clerk: ReturnType<typeof createClerkClient>;

  constructor() {
    this.clerk = createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.sub) {
      return false;
    }

    try {
      const clerkUser = await this.clerk.users.getUser(`user_${user.sub}`);
      const isAdmin =
        clerkUser.privateMetadata?.isAdmin === true ||
        clerkUser.privateMetadata?.role === 'admin';

      return isAdmin;
    } catch (error) {
      console.error('Error fetching user from Clerk:', error);
      return false;
    }
  }
}

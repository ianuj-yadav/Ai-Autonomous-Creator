import { Router, Request, Response } from 'express';
import { pool, isPgAvailable } from '../db';
import { logger } from '../logger';

export const userRouter = Router();

// In-Memory User Fallback Store for Stateless & Vercel Environments
interface UserRecord {
  id: string;
  email: string;
  name: string;
  streakCount: number;
  lastActiveDate: string;
  interests: string[];
  recentSearches: Array<{ id: string; query: string; timestamp: string }>;
  history: Array<{ id: string; title: string; category: string; timestamp: string; url?: string }>;
}

const memoryUsersMap: Map<string, UserRecord> = new Map();

// Seed initial demo user for instant out-of-the-box experience
const seedUser: UserRecord = {
  id: 'user-demo-101',
  email: 'alex.mindful@ascend.ai',
  name: 'Alex Rivera',
  streakCount: 7,
  lastActiveDate: new Date().toISOString().split('T')[0],
  interests: ['AI Security & Vulnerability', 'Autonomous Agents', 'Neural Search', 'Post-Quantum Cryptography', 'Hardware TEE'],
  recentSearches: [
    { id: 'search-1', query: 'Confidential Computing TEE 2026', timestamp: new Date(Date.now() - 3600000 * 2).toISOString() },
    { id: 'search-2', query: 'Jaccard Deduplication Fingerprinting', timestamp: new Date(Date.now() - 3600000 * 5).toISOString() },
    { id: 'search-3', query: 'Exa Neural API vs Keyword Search', timestamp: new Date(Date.now() - 3600000 * 12).toISOString() },
    { id: 'search-4', query: 'Autonomous Agent Cadence Jitter', timestamp: new Date(Date.now() - 3600000 * 24).toISOString() }
  ],
  history: [
    { id: 'hist-1', title: 'Hardware-Enclosed Trusted Execution Environments for AI Inference', category: 'AI Security', timestamp: new Date(Date.now() - 3600000 * 3).toISOString(), url: 'https://research.org/disclosures/hardware-tee-2026' },
    { id: 'hist-2', title: 'Runtime Isolation Breakdown in Multi-Tenant Agent Environments', category: 'Security Audit', timestamp: new Date(Date.now() - 3600000 * 8).toISOString(), url: 'https://research.org/disclosures/runtime-isolation-2026' },
    { id: 'hist-3', title: 'Memory Safety Invariants in Post-Quantum Cryptographic Libraries', category: 'Cryptography', timestamp: new Date(Date.now() - 3600000 * 18).toISOString(), url: 'https://research.org/disclosures/pqc-fuzzing-2026' }
  ]
};

memoryUsersMap.set(seedUser.id, seedUser);
memoryUsersMap.set(seedUser.email.toLowerCase(), seedUser);

// Helper: Calculate streak update
function calculateStreak(user: UserRecord): number {
  const today = new Date().toISOString().split('T')[0];
  const lastActive = user.lastActiveDate;

  if (lastActive === today) {
    return user.streakCount;
  }

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (lastActive === yesterday) {
    user.streakCount += 1;
    user.lastActiveDate = today;
    return user.streakCount;
  }

  // Missed more than 1 day - reset to 1
  user.streakCount = 1;
  user.lastActiveDate = today;
  return user.streakCount;
}

/**
 * POST /api/user/auth/login
 * User Log In endpoint
 */
userRouter.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email address is required' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    let user = memoryUsersMap.get(cleanEmail);

    if (!user) {
      // Auto-create user record on first login for smooth UX
      const newId = `user-${Date.now()}`;
      const nameFromEmail = cleanEmail.split('@')[0].replace(/[._-]/g, ' ');
      const formattedName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);

      user = {
        id: newId,
        email: cleanEmail,
        name: formattedName,
        streakCount: 1,
        lastActiveDate: new Date().toISOString().split('T')[0],
        interests: ['AI Security', 'Autonomous Agents', 'Neural Search', 'LLM Fine-Tuning'],
        recentSearches: [],
        history: []
      };

      memoryUsersMap.set(newId, user);
      memoryUsersMap.set(cleanEmail, user);
    } else {
      calculateStreak(user);
    }

    logger.info(`User logged in successfully: ${cleanEmail}`);
    res.status(200).json({
      status: 'success',
      message: 'Authentication successful',
      token: `jwt-token-${user.id}-${Date.now()}`,
      user
    });
  } catch (err: any) {
    logger.error('Login error', { error: err.message });
    res.status(500).json({ error: 'Failed to process authentication' });
  }
});

/**
 * POST /api/user/auth/signup
 * User Sign Up endpoint
 */
userRouter.post('/auth/signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, name, password } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email address is required' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const newId = `user-${Date.now()}`;
    const displayName = name ? name.trim() : cleanEmail.split('@')[0];

    const newUser: UserRecord = {
      id: newId,
      email: cleanEmail,
      name: displayName,
      streakCount: 1,
      lastActiveDate: new Date().toISOString().split('T')[0],
      interests: ['AI Security', 'Autonomous Agents', 'Neural Search', 'Post-Quantum Cryptography'],
      recentSearches: [],
      history: []
    };

    memoryUsersMap.set(newId, newUser);
    memoryUsersMap.set(cleanEmail, newUser);

    logger.info(`New user registered: ${cleanEmail}`);
    res.status(201).json({
      status: 'success',
      message: 'Account created successfully',
      token: `jwt-token-${newUser.id}-${Date.now()}`,
      user: newUser
    });
  } catch (err: any) {
    logger.error('Signup error', { error: err.message });
    res.status(500).json({ error: 'Failed to create user account' });
  }
});

/**
 * GET /api/user/profile
 * Get user profile, active streak, interests, history, and searches
 */
userRouter.get('/profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.query.userId as string) || 'user-demo-101';
    let user = memoryUsersMap.get(userId);

    if (!user) {
      user = seedUser;
    } else {
      calculateStreak(user);
    }

    res.status(200).json({
      status: 'success',
      user
    });
  } catch (err: any) {
    logger.error('Profile fetch error', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

/**
 * POST /api/user/interests
 * Update user topic interests
 */
userRouter.post('/interests', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, interests } = req.body;
    const targetId = userId || 'user-demo-101';
    const user = memoryUsersMap.get(targetId) || seedUser;

    if (Array.isArray(interests)) {
      user.interests = Array.from(new Set(interests.map((i: string) => i.trim())));
    }

    res.status(200).json({
      status: 'success',
      message: 'Interests updated successfully',
      interests: user.interests
    });
  } catch (err: any) {
    logger.error('Interests update error', { error: err.message });
    res.status(500).json({ error: 'Failed to update interests' });
  }
});

/**
 * POST /api/user/searches
 * Log a user search query into latest searches
 */
userRouter.post('/searches', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, query } = req.body;
    if (!query) {
      res.status(400).json({ error: 'Search query required' });
      return;
    }

    const targetId = userId || 'user-demo-101';
    const user = memoryUsersMap.get(targetId) || seedUser;

    const newSearch = {
      id: `search-${Date.now()}`,
      query: query.trim(),
      timestamp: new Date().toISOString()
    };

    user.recentSearches.unshift(newSearch);
    if (user.recentSearches.length > 15) {
      user.recentSearches = user.recentSearches.slice(0, 15);
    }

    res.status(200).json({
      status: 'success',
      message: 'Search query logged',
      recentSearches: user.recentSearches
    });
  } catch (err: any) {
    logger.error('Search log error', { error: err.message });
    res.status(500).json({ error: 'Failed to log search query' });
  }
});

/**
 * POST /api/user/streak/claim
 * Claim daily active check-in streak
 */
userRouter.post('/streak/claim', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.body;
    const targetId = userId || 'user-demo-101';
    const user = memoryUsersMap.get(targetId) || seedUser;

    const today = new Date().toISOString().split('T')[0];
    if (user.lastActiveDate !== today) {
      user.streakCount += 1;
      user.lastActiveDate = today;
    }

    res.status(200).json({
      status: 'success',
      message: 'Daily check-in claimed! Active streak updated.',
      streakCount: user.streakCount,
      lastActiveDate: user.lastActiveDate
    });
  } catch (err: any) {
    logger.error('Streak claim error', { error: err.message });
    res.status(500).json({ error: 'Failed to claim daily streak' });
  }
});

import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + 'contentai_salt').digest('hex');
}

function generateToken(userId) {
  return Buffer.from(JSON.stringify({ userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const passwordHash = hashPassword(password);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&password_hash=eq.${passwordHash}&select=*`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
    }
  });

  const users = await response.json();
  if (!users.length) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  const user = users[0];
  const token = generateToken(user.id);

  res.status(200).json({ token, user: { id: user.id, email: user.email, plan: user.plan, generations_used: user.generations_used } });
}
